import {
    happyReferencePlaceholder,
    type HappyAgentArtifactId,
    type HappyAgentArtifactTitlesSnapshot,
    type HappyAgentArtifactTitlesStore,
    type HappyReference,
} from "happy-desktop-state";
import type { MessageReferences, MessageReferenceView } from "happy-desktop-ui";

const TITLES_EMPTY: HappyAgentArtifactTitlesSnapshot = new Map();

/** A titles store with nothing behind it, for a Happy Agent that keeps no artifacts. */
export const artifactTitlesStoreNoop: HappyAgentArtifactTitlesStore = {
    get: () => TITLES_EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
};

/** What an artifact reads as until its title has been read. */
export const ARTIFACT_READING: MessageReferenceView = {
    type: "link",
    label: "artifact",
    busy: false,
};

function inert(reference: HappyReference): MessageReferenceView {
    return { type: "text", label: happyReferencePlaceholder(reference) };
}

function artifactView(
    reference: HappyReference,
    titles: HappyAgentArtifactTitlesSnapshot,
    store: HappyAgentArtifactTitlesStore,
): MessageReferenceView {
    const artifactId = reference.id as HappyAgentArtifactId;
    const artifact = titles.get(artifactId);
    if (artifact === undefined) {
        // Recording what is wanted publishes nothing in this call; the read
        // answers later through the subscription.
        store.request([artifactId]);
        return ARTIFACT_READING;
    }
    if (artifact.type === "missing") return inert(reference);
    // Always the current title: a pinned version only decides what opens.
    const title = artifact.title.trim();
    // A deleted artifact serves nothing, so it is named and not offered.
    if (artifact.status === "deleted")
        return { type: "text", label: title || happyReferencePlaceholder(reference) };
    // Artifacts have no busy state.
    return { type: "link", label: title || "Untitled artifact", busy: false };
}

/**
 * The live side of the Happy references a transcript shows: what each one
 * reads as in the current store snapshots, and where opening it goes.
 *
 * Built from immutable snapshots, so a new snapshot is a new value and the
 * transcript re-renders and re-sizes the rows that name what changed.
 */
export function messageReferencesCreate(input: {
    readonly titles: HappyAgentArtifactTitlesSnapshot;
    readonly titlesStore: HappyAgentArtifactTitlesStore;
    /** Opens one artifact: its latest version, or the one a reference pinned. */
    readonly onArtifactOpen?: (artifactId: HappyAgentArtifactId, version?: number) => void;
}): MessageReferences {
    return {
        view(reference) {
            if (reference.kind === "artifact" && input.onArtifactOpen !== undefined)
                return artifactView(reference, input.titles, input.titlesStore);
            return inert(reference);
        },
        open(reference) {
            if (reference.kind === "artifact")
                input.onArtifactOpen?.(reference.id as HappyAgentArtifactId, reference.version);
        },
    };
}
