import type { DaemonConfig, HappyAgentEvent } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentModelStoreCreate, type HappyAgentModelStore } from "./happyAgentModelStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { happyAgentSessionDraftStoreCreate } from "./happyAgentSessionDraftStore.js";
import type { HappyAgentModelCatalog } from "./happyAgentTypes.js";

const disposables: { [Symbol.dispose](): void }[] = [];
const connections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const disposable of disposables.splice(0)) disposable[Symbol.dispose]();
    for (const connection of connections.splice(0)) connection.close();
});

/** The fake daemon's configuration with one more provider offering one model. */
function configWithProvider(
    config: DaemonConfig,
    providerId: string,
    modelId: string,
): DaemonConfig {
    return {
        ...config,
        models: {
            ...config.models,
            [modelId]: { ...config.models["test-model"]!, name: modelId },
        },
        providers: {
            ...config.providers,
            [providerId]: {
                enabled: true,
                models: [{ enabled: true, id: modelId }],
                type: "claude",
            },
        },
    };
}

function modelIds(store: HappyAgentModelStore): readonly string[] {
    const snapshot = store.get();
    if (snapshot.type !== "ready") return [];
    return snapshot.menus.modelOptions.map((option) => `${option.providerId}/${option.modelId}`);
}

async function harnessOpen(daemon: FakeHappyAgentDaemon = fakeHappyAgentDaemonCreate()) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    connections.push(connection);
    const models = happyAgentModelStoreCreate({
        catalogRead: async () =>
            happyAgentModelCatalogProject((await daemon.client.getConfig()).config),
        sync: connection.sync,
    });
    disposables.push(models);
    await models.load();
    // Live: bootstrapped, and following the feed an announcement arrives on.
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
    return { connection, daemon, models };
}

it("reads the catalog again when the daemon announces config.updated", async () => {
    const { daemon, models } = await harnessOpen();
    expect(modelIds(models)).toEqual(["test-provider/test-model"]);

    daemon.configSet(configWithProvider(daemon.configGet(), "grok", "grok-4.7"));
    daemon.eventEmit("config.updated", {});

    await vi.waitFor(() =>
        expect(modelIds(models)).toEqual(["test-provider/test-model", "grok/grok-4.7"]),
    );
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
});

it("replaces the catalog from a replacement daemon's bootstrap without config.updated", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.configSet(configWithProvider(daemon.configGet(), "retired", "retired-model"));
    const { models } = await harnessOpen(daemon);
    expect(modelIds(models)).toEqual(["test-provider/test-model", "retired/retired-model"]);

    // The restarted daemon comes back on a different configuration and never
    // announces a change: it has no idea what the previous process offered.
    const { retired: _retired, ...providers } = daemon.configGet().providers;
    daemon.configSet(
        configWithProvider({ ...daemon.configGet(), providers }, "claude_extra", "opus-5-5"),
    );
    daemon.daemonReplace({ version: "0.4.75" });

    await vi.waitFor(() =>
        expect(modelIds(models)).toEqual(["test-provider/test-model", "claude_extra/opus-5-5"]),
    );
});

it("keeps the newest catalog when an older read answers after it", async () => {
    const { source: sync, writer } = happyAgentSyncCreate();
    const reads: ((catalog: HappyAgentModelCatalog) => void)[] = [];
    const models = happyAgentModelStoreCreate({
        catalogRead: () => new Promise((resolve) => reads.push(resolve)),
        sync,
    });
    disposables.push(models);
    const daemon = fakeHappyAgentDaemonCreate();
    const before = happyAgentModelCatalogProject(daemon.configGet());
    const after = happyAgentModelCatalogProject(
        configWithProvider(daemon.configGet(), "grok", "grok-4.7"),
    );

    const loaded = models.load();
    expect(reads).toHaveLength(1);
    writer.updateReceived({
        kind: "event",
        cursor: "cursor-2",
        event: {
            cursor: "cursor-2",
            occurredAt: 1,
            payload: {},
            type: "config.updated",
        } as HappyAgentEvent,
    });
    await vi.waitFor(() => expect(reads).toHaveLength(2));

    reads[1]!(after);
    await vi.waitFor(() => expect(models.get().type).toBe("ready"));
    reads[0]!(before);

    expect((await loaded).catalog).toBe(after);
    expect(models.get()).toMatchObject({ type: "ready", catalog: after });
});

it("stops following the daemon once disposed", async () => {
    const { daemon, models } = await harnessOpen();
    models[Symbol.dispose]();
    const reads = daemon.callCount("getConfig");

    daemon.eventEmit("config.updated", {});
    // The connection's own config reload is the one read this event causes.
    await vi.waitFor(() => expect(daemon.callCount("getConfig")).toBe(reads + 1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(daemon.callCount("getConfig")).toBe(reads + 1);
});

it("re-derives a session draft's pickers from a changed catalog", () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const before = happyAgentModelCatalogProject(
        configWithProvider(daemon.configGet(), "retired", "retired-model"),
    );
    const draft = happyAgentSessionDraftStoreCreate({
        catalog: before,
        selection: {
            providerId: "retired",
            modelId: "retired-model",
            effort: "high",
            permissionMode: "full_access",
        },
    });
    const listener = vi.fn();
    draft.subscribe(listener);

    draft.catalogChanged(before);
    expect(listener).not.toHaveBeenCalled();

    const after = happyAgentModelCatalogProject(
        configWithProvider(daemon.configGet(), "grok", "grok-4.7"),
    );
    draft.catalogChanged(after);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(
        draft.get().menus.modelOptions.map((option) => `${option.providerId}/${option.modelId}`),
    ).toEqual(["test-provider/test-model", "grok/grok-4.7"]);
    // The model it was on is gone, so it falls back to the catalog's default
    // without changing the access mode the reader chose.
    expect(draft.get().selection).toMatchObject({
        providerId: "test-provider",
        modelId: "test-model",
        permissionMode: "full_access",
    });
});
