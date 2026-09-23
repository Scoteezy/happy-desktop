// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import { happyAgentConnectionOpen, type HappyAgentConnectionHandle } from "./happyAgentConnection";

// The app package brings the whole renderer UI with it; this connection only
// hands its terminal driver on, and no terminal is opened here.
vi.mock("happy-desktop-app", () => ({ terminalDriverCreate: () => undefined }));

const handles: HappyAgentConnectionHandle[] = [];

afterEach(() => {
    for (const handle of handles.splice(0)) handle.dispose();
});

it("follows a daemon restarted behind the same endpoint onto its version and models", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ daemon: "0.4.73-preview.4" });
    const changed = vi.fn();
    const modelIds = (): readonly string[] => {
        const models = handle.get()?.models.get();
        return models?.type === "ready"
            ? models.catalog.providers.flatMap((provider) =>
                  provider.models.map((model) => `${provider.id}/${model.id}`),
              )
            : [];
    };
    const handle = happyAgentConnectionOpen({
        client: daemon.client,
        cloudHost: {
            cloudAuthCallbackSubscribe: () => () => undefined,
            cloudAuthCallbackTake: async () => undefined,
            cloudAuthConfigurationGet: () => new Promise(() => undefined),
            cloudAuthOpen: async () => undefined,
        },
        deps: {
            changed,
            conversationOpen: () => undefined,
            groupForget: () => undefined,
            groupOpen: () => undefined,
        },
        happyAgentHttpUrl: "http://happy-agent.test",
        happyAgentId: "local",
        host: { applicationMenuOpen: () => undefined, directoryPick: async () => undefined },
        modelPreferencePersistence: {
            read: () => undefined,
            write: () => undefined,
        },
        terminalColorScheme: () => "light",
    });
    handles.push(handle);
    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    const session = handle.get()!;
    await vi.waitFor(() =>
        expect(session.connection.get()).toMatchObject({
            connection: "connected",
            version: "0.4.73-preview.4",
        }),
    );

    expect(modelIds()).toEqual(["test-provider/test-model"]);

    // The restarted daemon also came back with a provider switched on, and it
    // never announces that: it has no idea what the previous process offered.
    const config = daemon.configGet();
    daemon.configSet({
        ...config,
        models: { ...config.models, "grok-4.7": { ...config.models["test-model"]!, name: "Grok" } },
        providers: {
            ...config.providers,
            grok: { enabled: true, models: [{ enabled: true, id: "grok-4.7" }], type: "grok" },
        },
    });
    // Its health answers last, after the feed is live on it again.
    const healthRelease = daemon.pause("getHealth");
    daemon.daemonReplace({ version: "0.4.75" });

    await vi.waitFor(() =>
        expect(modelIds()).toEqual(["test-provider/test-model", "grok/grok-4.7"]),
    );
    await vi.waitFor(() => expect(session.connection.get().connection).toBe("connected"));
    healthRelease();
    await vi.waitFor(() =>
        expect(session.connection.get()).toMatchObject({
            connection: "connected",
            version: "0.4.75",
        }),
    );
    // Reconciled in place: the same session and stores, never a new one.
    expect(handle.get()).toBe(session);
});
