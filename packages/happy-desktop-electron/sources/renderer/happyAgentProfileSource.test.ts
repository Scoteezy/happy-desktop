import { afterEach, expect, it, vi } from "vitest";
import {
    connectHappyAgent,
    type HappyAgentConnection,
    type HappyAgentProfile,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate, type FakeHappyAgentDaemon } from "happy-desktop-state/testing";
import { happyAgentProfileSourceCreate } from "./happyAgentProfileSource";

/* The profile carries only its photo's ThumbHash. The source reads the bytes
 * whenever the profile changes, conditionally on the tag it already holds, and
 * reports the ThumbHash alone until the current photo's bytes are in hand. The
 * wire contract is the same in standalone and team mode; only the event a
 * change produces differs, and both lead to the same reads. */

const openConnections: HappyAgentConnection[] = [];
const closers: (() => void)[] = [];

afterEach(() => {
    for (const close of closers.splice(0)) close();
    for (const connection of openConnections.splice(0)) connection.close();
    vi.restoreAllMocks();
});

const PHOTO = new Uint8Array([1, 2, 3]);
const OTHER = new Uint8Array([4, 5, 6]);

function harness(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    openConnections.push(connection);
    const adapter = happyAgentProfileSourceCreate(daemon.client, connection.sync);
    const seen: (HappyAgentProfile | undefined)[] = [];
    closers.push(
        adapter.source.subscribe(
            (profile) => seen.push(profile),
            () => undefined,
        ),
    );
    return { adapter, latest: () => seen.at(-1), seen };
}

function photoReads(daemon: FakeHappyAgentDaemon) {
    return daemon.calls
        .filter((call) => call.method === "getProfilePhoto")
        .map((call) => (call.args[0] as { ifNoneMatch?: string }).ifNoneMatch);
}

it("shows the ThumbHash until the bytes arrive, then the bytes", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "steve@example.com", name: "Steve" });
    daemon.profilePhotoSeed({ data: PHOTO, contentType: "image/webp", thumbhash: "first" });
    const h = harness(daemon);

    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toMatch(/^blob:/u));
    expect(h.seen.find((profile) => profile?.photo)?.photo).toEqual({ thumbhash: "first" });
    expect(h.latest()?.photo?.thumbhash).toBe("first");
    // The first read has no tag to offer.
    expect(photoReads(daemon)).toEqual([undefined]);
});

it("uploads against the version seen, swaps the bytes, and lets the old ones go", async () => {
    const revoked = vi.spyOn(URL, "revokeObjectURL");
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "steve@example.com", name: "Steve" });
    daemon.profilePhotoSeed({ data: PHOTO, contentType: "image/webp", thumbhash: "first" });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toBeDefined());
    const first = h.latest()!.photo!.imageUrl!;
    const version = (await daemon.client.getProfile()).profile.version;

    await h.adapter.actions.photoUpload({ contentType: "image/png", data: OTHER.slice().buffer });

    const upload = daemon.calls.find((call) => call.method === "setProfilePhoto")!;
    expect(upload.args[1]).toEqual({ ifMatch: version });
    // The new photo is a new ThumbHash: the old picture is not shown for it.
    expect(h.latest()?.photo?.imageUrl).toBeUndefined();
    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toMatch(/^blob:/u));
    expect(h.latest()?.photo?.imageUrl).not.toBe(first);
    expect(revoked).toHaveBeenCalledWith(first);
});

it("asks with the held tag when the profile changes, and keeps unchanged bytes", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "steve@example.com", name: "Steve" });
    daemon.profilePhotoSeed({ data: PHOTO, contentType: "image/webp", thumbhash: "first" });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toBeDefined());
    const imageUrl = h.latest()!.photo!.imageUrl;

    // A name edit made elsewhere: a new version, the same photo.
    daemon.profileSet({ name: "Steve K", updatedAt: 50, version: daemon.versionNext() });
    daemon.eventEmit("profile.updated", { profile: (await daemon.client.getProfile()).profile });

    await vi.waitFor(() => expect(photoReads(daemon)).toHaveLength(2));
    expect(photoReads(daemon)[1]).toMatch(/^"photo-/u);
    await vi.waitFor(() => expect(h.latest()?.name).toBe("Steve K"));
    expect(h.latest()?.photo?.imageUrl).toBe(imageUrl);
});

it("drops the photo when it is removed", async () => {
    const revoked = vi.spyOn(URL, "revokeObjectURL");
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "steve@example.com", name: "Steve" });
    daemon.profilePhotoSeed({ data: PHOTO, contentType: "image/webp", thumbhash: "first" });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toBeDefined());
    const imageUrl = h.latest()!.photo!.imageUrl!;

    await h.adapter.actions.photoRemove();

    expect(h.latest()?.photo).toBeUndefined();
    expect(h.latest()?.name).toBe("Steve");
    expect(revoked).toHaveBeenCalledWith(imageUrl);
    expect(photoReads(daemon)).toHaveLength(1);
});

it("follows a team member's identity-only event to the new photo", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "ada@example.com", name: "Ada", userId: "user1" });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.latest()?.name).toBe("Ada"));
    expect(h.latest()?.photo).toBeUndefined();
    // Nothing to read while there is no photo.
    expect(photoReads(daemon)).toEqual([]);

    // Another of the member's windows uploads; the team event names only who changed.
    daemon.profilePhotoSeed({ data: PHOTO, contentType: "image/webp", thumbhash: "team" });
    daemon.eventEmit("profile.updated", { userId: "user1" });

    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toMatch(/^blob:/u));
    expect(h.latest()?.photo?.thumbhash).toBe("team");
});

it("re-reads the profile when an upload loses to a change made elsewhere", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ email: "steve@example.com", name: "Steve" });
    const h = harness(daemon);
    await vi.waitFor(() => expect(h.latest()?.name).toBe("Steve"));
    // Changed behind this window's back, with the event still on its way.
    daemon.profileSet({ name: "Steve K", updatedAt: 50, version: daemon.versionNext() });

    await expect(
        h.adapter.actions.photoUpload({ contentType: "image/png", data: OTHER.slice().buffer }),
    ).rejects.toMatchObject({ status: 409 });

    expect(h.latest()?.name).toBe("Steve K");
    // The next attempt is made against the version now shown, and succeeds.
    await h.adapter.actions.photoUpload({ contentType: "image/png", data: OTHER.slice().buffer });
    await vi.waitFor(() => expect(h.latest()?.photo?.imageUrl).toMatch(/^blob:/u));
});
