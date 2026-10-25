import {
    HappyAgentApiError,
    MAX_STORY_FRAMES,
    MAX_STORY_OVERLAYS,
    type HappyAgentClient,
    type Story,
    type StoryFrame,
    type StoryFrameInput,
    type StoryOverlay,
} from "@slopus/happy-agent-client";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** API.md, Overlays: a frame holds at most five reaction overlays; the client exports no constant. */
const MAX_STORY_REACTION_OVERLAYS = 5;

export type HappyAgentStoryEditorDrafts =
    | { readonly status: "idle" }
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly drafts: readonly Story[] };

export interface HappyAgentStoryEditorSnapshot {
    /** The draft's ID, chosen here before the daemon has seen it. */
    readonly storyId: string;
    /** The draft as the daemon last answered, absent until it holds media. */
    readonly story?: Story;
    /** The frames as the person is editing them. */
    readonly frames: readonly StoryFrame[];
    readonly frameIndex: number;
    readonly caption: string;
    /** Edits the daemon has not been sent. */
    readonly dirty: boolean;
    /** Files still uploading. */
    readonly uploading: number;
    readonly saving: boolean;
    readonly posting: boolean;
    readonly error?: UserError;
    readonly drafts: HappyAgentStoryEditorDrafts;
}

/**
 * One editing session of one story. Media the person adds is saved to the
 * draft at once, so its frames are the daemon's — measured, placed, with their
 * background bands — and overlays and the caption are the person's local edits
 * until they save or post.
 */
export interface HappyAgentStoryEditorStore {
    get(): HappyAgentStoryEditorSnapshot;
    subscribe(listener: () => void): () => void;
    /** A new CUID2 for an overlay the person adds; the client names overlays. */
    idCreate(): string;
    /** Opens an existing draft by ID in place of the new one. */
    draftOpen(storyId: string): void;
    /** Reads the person's drafts, for returning to one. */
    draftsRequest(): void;
    /** Uploads files from the device and adds each as a frame. */
    filesAdd(files: readonly File[]): void;
    frameSelect(index: number): void;
    frameRemove(frameId: string): void;
    captionUpdate(caption: string): void;
    /** Adds an overlay on the selected frame, on top. */
    overlayAdd(overlay: StoryOverlay): void;
    /** Replaces an overlay of the selected frame, keeping its place in the drawing order. */
    overlayUpdate(overlay: StoryOverlay): void;
    overlayRemove(overlayId: string): void;
    /** Sends the edits; the draft stays a draft. Rejects with a displayable `UserError`. */
    save(): Promise<void>;
    /** Saves, then posts exactly the version saved. Rejects with a displayable `UserError`. */
    post(): Promise<Story>;
    [Symbol.dispose](): void;
}

export interface HappyAgentStoryEditorDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "createStory"
        | "updateStory"
        | "getStory"
        | "postStory"
        | "listStories"
        | "uploadArtifactFile"
    >;
    /** A draft already held, to edit; without it the editor starts a new one. */
    readonly story?: Story;
    readonly now?: () => number;
}

/** The fields of a frame that only the daemon decides: its media and how it measured it. */
function mediaOf(frame: StoryFrame, from: StoryFrame): StoryFrame {
    return {
        ...frame,
        kind: from.kind,
        width: from.width,
        height: from.height,
        ...(from.scale === undefined ? {} : { scale: from.scale }),
        thumbhash: from.thumbhash,
        durationMs: from.durationMs,
        asset: from.asset,
        available: from.available,
    };
}

function frameInput(frame: StoryFrame): StoryFrameInput {
    return {
        id: frame.id,
        placement: frame.placement,
        background: frame.background,
        overlays: [...frame.overlays],
    } as StoryFrameInput;
}

export function happyAgentStoryEditorStoreCreate(
    deps: HappyAgentStoryEditorDeps,
): HappyAgentStoryEditorStore {
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    const initial = deps.story;
    let snapshot: HappyAgentStoryEditorSnapshot = {
        storyId: initial?.id ?? idCreate(),
        ...(initial ? { story: initial } : {}),
        frames: initial?.frames ?? [],
        frameIndex: 0,
        caption: initial?.caption ?? "",
        dirty: false,
        uploading: 0,
        saving: false,
        posting: false,
        drafts: { status: "idle" },
    };
    /** Counts local edits, so an answer can tell whether any arrived while it was away. */
    let edits = 0;
    /** Counts drafts opened here; an answer for an earlier draft is dropped. */
    let session = 0;
    let queue: Promise<unknown> = Promise.resolve();
    let disposed = false;
    const aborts = new AbortController();

    const publish = (next: Partial<HappyAgentStoryEditorSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of [...listeners]) listener();
    };
    const edit = (next: Partial<HappyAgentStoryEditorSnapshot>): void => {
        edits += 1;
        const { error: _error, ...rest } = snapshot;
        snapshot = rest;
        publish({ ...next, dirty: true });
    };
    const framesEdit = (change: (frame: StoryFrame) => StoryFrame): void => {
        const index = snapshot.frameIndex;
        const frame = snapshot.frames[index];
        if (!frame) return;
        const changed = change(frame);
        // A refused change, such as an overlay past the frame's limit, is no edit.
        if (changed === frame) return;
        edit({ frames: snapshot.frames.map((each, at) => (at === index ? changed : each)) });
    };

    /**
     * The daemon's answer, with any edits made while it was away kept on top.
     * `sent` is the frames the request carried: a served frame among them that
     * is no longer here was removed meanwhile, and stays removed.
     */
    const answerTake = (story: Story, editsAtSend: number, sent: ReadonlySet<string>): void => {
        const kept = edits !== editsAtSend;
        const served = new Map(story.frames.map((frame) => [frame.id, frame]));
        const frames = kept
            ? [
                  ...snapshot.frames.flatMap((frame) => {
                      const from = served.get(frame.id);
                      return from ? [mediaOf(frame, from)] : [];
                  }),
                  ...story.frames.filter(
                      (frame) =>
                          !sent.has(frame.id) &&
                          !snapshot.frames.some((local) => local.id === frame.id),
                  ),
              ]
            : story.frames;
        publish({
            story,
            frames,
            frameIndex: Math.min(snapshot.frameIndex, Math.max(0, frames.length - 1)),
            ...(kept ? {} : { caption: story.caption ?? "" }),
            dirty: kept,
        });
    };

    /** One write at a time, each against the version the last produced. */
    const enqueue = <Result>(work: () => Promise<Result>): Promise<Result> => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    const send = (added: readonly StoryFrameInput[]): Promise<Story> =>
        enqueue(async () => {
            if (disposed) throw new UserError("The editor is closed.");
            const editsAtSend = edits;
            const sessionAtSend = session;
            const sent = new Set(snapshot.frames.map((frame) => frame.id));
            const frames = [...snapshot.frames.map(frameInput), ...added];
            const caption = snapshot.caption.trim() === "" ? null : snapshot.caption;
            publish({ saving: true });
            try {
                const held = snapshot.story;
                const answer = held
                    ? await deps.client.updateStory(
                          held.id,
                          { caption, frames, mutationId: idCreate() },
                          { ifMatch: held.version, signal: aborts.signal },
                      )
                    : await deps.client.createStory(
                          { id: snapshot.storyId, caption, frames, mutationId: idCreate() },
                          { signal: aborts.signal },
                      );
                if (sessionAtSend !== session) throw new UserError("Another draft is open.");
                answerTake(answer.story, editsAtSend, sent);
                publish({ saving: false });
                return answer.story;
            } catch (error) {
                const current =
                    error instanceof HappyAgentApiError && error.status === 409
                        ? (error.body as { story?: Story } | null)?.story
                        : undefined;
                // Someone else changed the draft: theirs is what stands now.
                if (current && sessionAtSend === session) answerTake(current, -1, new Set());
                const failure = happyAgentUserError(error);
                publish({ saving: false, error: failure });
                throw failure;
            }
        });
    const frameRoom = (count: number): boolean => {
        if (snapshot.frames.length + snapshot.uploading + count <= MAX_STORY_FRAMES) return true;
        publish({
            error: new UserError(`A story holds at most ${MAX_STORY_FRAMES} photos or videos.`),
        });
        return false;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        idCreate: () => idCreate(),
        draftOpen(storyId) {
            if (disposed) return;
            session += 1;
            const opened = session;
            void deps.client
                .getStory(storyId, { signal: aborts.signal })
                .then((answer) => {
                    if (disposed || opened !== session) return;
                    edits += 1;
                    publish({
                        storyId,
                        story: answer.story,
                        frames: answer.story.frames,
                        frameIndex: 0,
                        caption: answer.story.caption ?? "",
                        dirty: false,
                    });
                })
                .catch((error: unknown) => {
                    if (!disposed && opened === session)
                        publish({ error: happyAgentUserError(error) });
                });
        },
        draftsRequest() {
            if (disposed || snapshot.drafts.status === "loading") return;
            publish({ drafts: { status: "loading" } });
            void deps.client
                .listStories({ status: ["draft"], limit: 50 }, { signal: aborts.signal })
                .then((answer) => {
                    if (!disposed) publish({ drafts: { status: "ready", drafts: answer.stories } });
                })
                .catch(() => {
                    if (!disposed) publish({ drafts: { status: "ready", drafts: [] } });
                });
        },
        filesAdd(files) {
            if (disposed || files.length === 0 || !frameRoom(files.length)) return;
            const accepted = files.filter(
                (file) =>
                    (file.type.startsWith("image/") || file.type.startsWith("video/")) &&
                    !/hei[cf]/iu.test(file.type),
            );
            if (accepted.length < files.length)
                publish({
                    error: new UserError(
                        "Choose photos or videos: PNG, JPEG, GIF, WebP, AVIF, MP4, QuickTime or WebM.",
                    ),
                });
            if (accepted.length === 0) return;
            publish({ uploading: snapshot.uploading + accepted.length });
            void Promise.all(
                accepted.map(async (file) => {
                    const answer = await deps.client.uploadArtifactFile(
                        { data: await file.arrayBuffer() },
                        { signal: aborts.signal },
                    );
                    return {
                        id: idCreate(),
                        upload: { uploadId: answer.upload.id, name: file.name },
                        overlays: [],
                    } as StoryFrameInput;
                }),
            )
                .then((added) => send(added))
                .then((story) => {
                    if (!disposed) publish({ frameIndex: story.frames.length - 1 });
                })
                .catch((error: unknown) => {
                    if (!disposed) publish({ error: happyAgentUserError(error) });
                })
                .finally(() => {
                    if (!disposed) publish({ uploading: snapshot.uploading - accepted.length });
                });
        },
        frameSelect(index) {
            if (index < 0 || index >= snapshot.frames.length || index === snapshot.frameIndex)
                return;
            publish({ frameIndex: index });
        },
        frameRemove(frameId) {
            // A story keeps at least one frame; an empty draft is deleted instead.
            if (snapshot.frames.length <= 1) return;
            const frames = snapshot.frames.filter((frame) => frame.id !== frameId);
            edit({ frames, frameIndex: Math.min(snapshot.frameIndex, frames.length - 1) });
        },
        captionUpdate(caption) {
            if (caption === snapshot.caption) return;
            edit({ caption: caption.slice(0, 1024) });
        },
        overlayAdd(overlay) {
            framesEdit((frame) =>
                frame.overlays.length >= MAX_STORY_OVERLAYS ||
                (overlay.type === "reaction" &&
                    frame.overlays.filter((each) => each.type === "reaction").length >=
                        MAX_STORY_REACTION_OVERLAYS)
                    ? frame
                    : { ...frame, overlays: [...frame.overlays, overlay] },
            );
        },
        overlayUpdate(overlay) {
            framesEdit((frame) => ({
                ...frame,
                overlays: frame.overlays.map((each) => (each.id === overlay.id ? overlay : each)),
            }));
        },
        overlayRemove(overlayId) {
            framesEdit((frame) => ({
                ...frame,
                overlays: frame.overlays.filter((each) => each.id !== overlayId),
            }));
        },
        async save() {
            if (!snapshot.dirty || snapshot.frames.length === 0) return;
            await send([]);
        },
        async post() {
            if (snapshot.frames.length === 0)
                throw new UserError("Add a photo or video before posting.");
            publish({ posting: true });
            try {
                if (snapshot.dirty || !snapshot.story) await send([]);
                // Behind any write still on its way, against the version it made.
                const answer = await enqueue(async () => {
                    const saved = snapshot.story;
                    if (!saved) throw new UserError("Add a photo or video before posting.");
                    return deps.client.postStory(
                        saved.id,
                        { artifactVersion: saved.artifactVersion, mutationId: idCreate() },
                        { signal: aborts.signal },
                    );
                });
                publish({ story: answer.story, posting: false });
                return answer.story;
            } catch (error) {
                const current =
                    error instanceof HappyAgentApiError && error.status === 409
                        ? (error.body as { story?: Story } | null)?.story
                        : undefined;
                // The draft moved on since it was shown: show the latest, and the
                // next Post sends that.
                if (current) answerTake(current, -1, new Set());
                const failure = happyAgentUserError(error);
                publish({ posting: false, error: failure });
                throw failure;
            }
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            aborts.abort();
            listeners.clear();
        },
    };
}
