import {
    analyticsClientCreate,
    analyticsModel,
    analyticsProviderKind,
    type AnalyticsClient,
    type AnalyticsCommonProperties,
    type AnalyticsEventName,
    type AnalyticsEvents,
    type AnalyticsOs,
    type AnalyticsOutcome,
} from "happy-desktop-analytics";
import {
    happyAgentBotSubtasks,
    happyAgentTaskDepths,
    usageAnalyticsStoreCreate,
    type HappyAgentActionResult,
    type HappyAgentActivity,
    type HappyAgentActivityModel,
    type UsageAnalyticsDocument,
    type UsageAnalyticsPersistence,
    type UsageAnalyticsStore,
    type WelcomeStore,
} from "happy-desktop-state";
import {
    localOnboardingStage,
    type LocalOnboardingAssistant,
    type OnboardingStage,
} from "happy-desktop-ui";
import {
    localOnboardingView,
    type LocalOnboardingStore,
    type LocalOnboardingViewSnapshot,
} from "./localOnboardingStore";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import { localWebBuild } from "./localWebBuild";

declare const __HAPPY_RENDERER_VERSION__: string;
declare const __HAPPY_POSTHOG_API_KEY__: string | null;

const INSTALL_ID_KEY = "happy.analytics.install-id.v1";
const LAUNCH_COUNT_KEY = "happy.analytics.launch-count.v1";
const USAGE_ANALYTICS_KEY = "happy.usage-analytics.v1";

export interface DesktopAnalytics {
    /** The Settings switch, shared with the settings screen. */
    readonly preference: UsageAnalyticsStore;
    /** Counts this renderer start and reports it. */
    appOpened(): void;
    /** What one Happy Agent's workspace reported doing. */
    activity(happyAgentId: string, activity: HappyAgentActivity): void;
    /**
     * Wraps first-run setup so its steps are observed exactly while the setup
     * screen itself is subscribed. Observing on its own would subscribe the
     * store, and subscribing it is what starts setup's machine work.
     */
    onboardingObserve(store: LocalOnboardingStore, welcome: WelcomeStore): LocalOnboardingStore;
    /** Stops following the directory. */
    dispose(): void;
}

function storageRead(key: string): string | undefined {
    try {
        return localStorage.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
}

function storageWrite(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // A storage-denied window still reports for as long as it is open.
    }
}

/** A random identity for this installation, made once and kept by this window's storage. */
function installId(): string {
    const stored = storageRead(INSTALL_ID_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    storageWrite(INSTALL_ID_KEY, created);
    return created;
}

function usageAnalyticsPersistence(): UsageAnalyticsPersistence {
    return {
        read() {
            const value = storageRead(USAGE_ANALYTICS_KEY);
            return value ? (JSON.parse(value) as UsageAnalyticsDocument) : undefined;
        },
        write(document) {
            storageWrite(USAGE_ANALYTICS_KEY, JSON.stringify(document));
        },
    };
}

/**
 * The operating system this window runs on. The browser is not ours and gives
 * no typed answer, so this boundary reads its platform string once.
 */
function desktopOs(): AnalyticsOs {
    const platform = (
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ?? navigator.platform
    ).toLowerCase();
    if (platform.startsWith("mac")) return "mac";
    if (platform.startsWith("win")) return "win";
    if (platform.startsWith("linux")) return "linux";
    return "other";
}

function outcomeOf(result: HappyAgentActionResult): AnalyticsOutcome {
    return result.ok ? { result: "ok" } : { result: "failed", error_code: result.failure };
}

/** How many hex characters of the digest an account hash keeps. */
const PROVIDER_ACCOUNT_HASH_LENGTH = 12;

/**
 * A short digest that tells two configured providers of one kind apart
 * without naming either. It is salted with this installation's random id, so
 * the same account hashes differently on every installation.
 */
async function providerAccountHash(installation: string, providerId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${installation}:${providerId}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, PROVIDER_ACCOUNT_HASH_LENGTH);
}

function stepOf(stage: OnboardingStage): AnalyticsEvents["onboarding_step_viewed"]["step"] {
    switch (stage) {
        case "setup":
        case "subscriptions":
            return stage;
        case "get-app":
            return "get_app";
        case "connect-phone":
            return "connect_phone";
    }
}

function assistantStatus(
    authentication: LocalOnboardingAssistant["authentication"],
): AnalyticsEvents["onboarding_assistant_status"]["status"] | undefined {
    switch (authentication) {
        case "valid":
            return "signed_in";
        case "invalid":
            return "not_signed_in";
        case "unavailable":
            return "not_installed";
        case "error":
            return "check_failed";
        case "checking":
            return undefined;
    }
}

/**
 * The desktop's analytics: one client for the window, the common fields read
 * from the Happy Agent each event happened on, and the observers that turn
 * product state into catalog events. Development windows send nothing.
 */
export function desktopAnalyticsCreate(options: {
    readonly development: boolean;
    readonly happyAgents: HappyAgentDirectoryStore;
}): DesktopAnalytics {
    const preference = usageAnalyticsStoreCreate(usageAnalyticsPersistence());
    const installation = installId();
    const client: AnalyticsClient = analyticsClientCreate({
        apiKey: options.development ? undefined : (__HAPPY_POSTHOG_API_KEY__ ?? undefined),
        distinctId: installation,
        enabled: () => preference.get().usageAnalyticsEnabled,
    });
    const os = desktopOs();

    /**
     * The fields every event carries, for the Happy Agent it happened on.
     * Happy Agent does not report its operating system yet, so a remote one
     * is unknown rather than guessed; the local one is this machine.
     */
    const common = (happyAgentId: string): AnalyticsCommonProperties => {
        const entry = options.happyAgents
            .get()
            .happyAgents.find((item) => item.id === happyAgentId);
        const local = happyAgentId === LOCAL_HAPPY_AGENT_ID;
        return {
            app_version: __HAPPY_RENDERER_VERSION__,
            flavor: localWebBuild ? "nightly" : "standard",
            os,
            agent_os: local ? os : null,
            agent_location: entry ? (local ? "local" : "remote") : null,
            happy_agent_version: entry?.version ?? null,
        };
    };
    const track = <E extends AnalyticsEventName>(
        happyAgentId: string,
        event: E,
        properties: AnalyticsEvents[E],
    ): void => client.track(event, { ...common(happyAgentId), ...properties });

    const accountHashes = new Map<string, Promise<string | null>>();
    const accountHash = (providerId: string | undefined): Promise<string | null> => {
        if (providerId === undefined) return Promise.resolve(null);
        let hash = accountHashes.get(providerId);
        if (!hash) {
            hash = providerAccountHash(installation, providerId).catch(() => null);
            accountHashes.set(providerId, hash);
        }
        return hash;
    };
    /** The model fields of an event, once its account hash is known. */
    const modelOf = (model: HappyAgentActivityModel) =>
        accountHash(model.providerId).then((hash) => ({
            model: analyticsModel(model.modelId),
            model_provider_kind: analyticsProviderKind(model.providerType),
            provider_account_hash: hash,
            effort: model.effort ?? null,
        }));

    // A subtask is made by an agent, not by a control here, so it is counted
    // the first time this window sees it. What a Happy Agent already had when
    // its list first arrived is not new.
    const subtasksSeen = new Map<string, Set<string>>();
    const subtasksFollow = (): void => {
        for (const entry of options.happyAgents.get().happyAgents) {
            if (entry.projectsStatus !== "ready") continue;
            const ids = happyAgentBotSubtasks(entry.bots).map((task) => task.conversation.id);
            let depths: ReadonlyMap<string, number> | undefined;
            const seen = subtasksSeen.get(entry.id);
            if (!seen) {
                subtasksSeen.set(entry.id, new Set(ids));
                continue;
            }
            for (const id of ids) {
                if (seen.has(id)) continue;
                seen.add(id);
                depths ??= happyAgentTaskDepths(entry.bots);
                track(entry.id, "subtask_created", {
                    result: "ok",
                    task_depth: depths.get(id) ?? null,
                });
            }
        }
    };
    const directoryUnsubscribe = options.happyAgents.subscribe(subtasksFollow);
    subtasksFollow();

    return {
        preference,
        appOpened() {
            const count = Number(storageRead(LAUNCH_COUNT_KEY) ?? "0");
            const launchCount = (Number.isSafeInteger(count) && count > 0 ? count : 0) + 1;
            storageWrite(LAUNCH_COUNT_KEY, String(launchCount));
            track(LOCAL_HAPPY_AGENT_ID, "app_opened", { launch_count: launchCount });
        },
        activity(happyAgentId, activity) {
            switch (activity.kind) {
                case "conversationCreated":
                    void modelOf(activity.model).then((model) =>
                        track(happyAgentId, "conversation_created", {
                            source: activity.source,
                            ...model,
                        }),
                    );
                    return;
                case "messageSent":
                    void modelOf(activity.model).then((model) =>
                        client.track("message_sent", {
                            ...common(happyAgentId),
                            client: "desktop",
                            target: activity.target,
                            session_client: "happy_agent",
                            bot_system_key: activity.botSystemKey,
                            task_depth: activity.taskDepth,
                            source: activity.source,
                            ...model,
                        }),
                    );
                    return;
                case "projectAdded":
                    track(happyAgentId, "project_added", {
                        source: activity.source,
                        ...outcomeOf(activity.result),
                    });
                    return;
                case "workspaceCreated":
                    track(happyAgentId, "workspace_created", outcomeOf(activity.result));
                    return;
                case "botCreated":
                    track(happyAgentId, "bot_created", {
                        source: activity.source,
                        ...outcomeOf(activity.result),
                    });
                    return;
            }
        },
        onboardingObserve(store, welcome) {
            let step: AnalyticsEvents["onboarding_step_viewed"]["step"] | undefined;
            let mobile: string | undefined;
            let stage: string | undefined;
            const observe = (snapshot: LocalOnboardingViewSnapshot): void => {
                const view = localOnboardingView(snapshot);
                if (view && view.kind !== "finishing" && welcome.get().welcomeAcknowledged) {
                    const next = stepOf(localOnboardingStage(view));
                    if (next !== step) {
                        step = next;
                        track(LOCAL_HAPPY_AGENT_ID, "onboarding_step_viewed", { step: next });
                    }
                }
                const mobileStatus = snapshot.happyMobile?.status;
                if (mobileStatus !== mobile) {
                    // Only a step this window saw end counts: a pairing or a
                    // skip remembered from an earlier launch is not news.
                    if (mobile !== undefined && mobile !== "checking") {
                        if (mobileStatus === "configured")
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_mobile", { action: "paired" });
                        if (mobileStatus === "skipped")
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_mobile", { action: "skipped" });
                    }
                    mobile = mobileStatus;
                }
                const nextStage = snapshot.onboarding?.stage;
                if (nextStage !== stage) {
                    if (nextStage === "complete" && stage !== undefined && stage !== "inactive")
                        track(LOCAL_HAPPY_AGENT_ID, "onboarding_completed", {});
                    stage = nextStage;
                }
            };
            return {
                ...store,
                subscribe(listener) {
                    const unsubscribe = store.subscribe(() => {
                        observe(store.get());
                        listener();
                    });
                    observe(store.get());
                    return unsubscribe;
                },
                assistantsContinue() {
                    const view = localOnboardingView(store.get());
                    if (view?.kind === "provider-authentication") {
                        for (const assistant of view.assistants) {
                            const status = assistantStatus(assistant.authentication);
                            if (status)
                                track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                    assistant: assistant.id,
                                    status,
                                });
                        }
                        const custom = assistantStatus(view.custom.authentication);
                        if (custom)
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                assistant: "custom",
                                status: custom,
                            });
                    }
                    store.assistantsContinue();
                },
            };
        },
        dispose() {
            directoryUnsubscribe();
        },
    };
}
