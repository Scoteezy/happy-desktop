import type {
    HappyAgentModelPreferenceDocument,
    HappyAgentModelPreferencePersistence,
    HappyAgentPermissionMode,
    HappyAgentServiceTier,
    HappyAgentSettingsDesktop,
    HappyAgentSettingsInitial,
    HappyAgentSettingsSnapshot,
    HappyAgentThinkingLevel,
    TitleShimmerPersistence,
} from "happy-desktop-state";
import { HAPPY_AGENT_DEFAULT_THINKING_LEVEL } from "happy-desktop-state";
import type {
    DesktopAppearanceMode,
    DesktopConfig,
    DesktopKeepAwakeMode,
    DesktopModelPreference,
    DesktopScrollbarVisibility,
    HappyDesktopBridge,
} from "../shared/desktopContract";

const THINKING_LEVELS: ReadonlySet<string> = new Set([
    "off",
    "on",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
]);

export interface DesktopPreferences {
    readonly initialAppearance: DesktopAppearanceMode;
    /** Absent until the reader has chosen; the store then applies the product default. */
    readonly initialKeepAwake: DesktopKeepAwakeMode | undefined;
    readonly initialScrollbarVisibility: DesktopScrollbarVisibility;
    readonly initialSettings: HappyAgentSettingsInitial;
    readonly preferencePersistence: HappyAgentModelPreferencePersistence;
    readonly titleShimmerPersistence: TitleShimmerPersistence;
    appearanceChanged(
        mode: DesktopAppearanceMode,
        scrollbarVisibility: DesktopScrollbarVisibility,
    ): void;
    keepAwakeChanged(mode: DesktopKeepAwakeMode): void;
    settingsChanged(snapshot: HappyAgentSettingsSnapshot): void;
    configReceived(
        config: DesktopConfig,
        apply: (settings: HappyAgentSettingsDesktop) => void,
    ): void;
}

/**
 * Adapts the desktop's one JSON document to the framework-independent product
 * stores that consume it: appearance, title motion, explicit defaults, and
 * per-model picker memory. One adapter owns the current document so concurrent
 * store changes preserve each other's fields before the main process serializes
 * their writes.
 */
export function desktopPreferencesCreate(
    bridge: HappyDesktopBridge,
    initial: DesktopConfig,
): DesktopPreferences {
    let config = initial;
    let receiving = false;
    const preferenceListeners = new Set<() => void>();

    const commit = (next: DesktopConfig): void => {
        // Model persistence listeners may synchronously publish a settings
        // projection before the other config fields have reached that store.
        // Authoritative reconciliation must never turn that intermediate
        // notification into a write of the previous preferences.
        if (receiving) return;
        const previous = config;
        config = next;
        for (const listener of preferenceListeners) listener();
        // Invoke immediately; the privileged store is the single serialization
        // authority, so every quick selection enters its ordered write queue.
        const write =
            bridge.desktopConfigUpdate?.(previous, next) ?? bridge.desktopConfigWrite(next);
        void write.catch((error: unknown) => {
            console.error("Could not save desktop preferences.", error);
        });
    };

    const preferencePersistence: HappyAgentModelPreferencePersistence = {
        read: () => preferenceDocument(config),
        write(document) {
            commit(configFromPreferenceDocument(config, document));
        },
        subscribe(listener) {
            preferenceListeners.add(listener);
            return () => preferenceListeners.delete(listener);
        },
    };

    const titleShimmerPersistence: TitleShimmerPersistence = {
        read: () =>
            config.titleShimmerEnabled === undefined
                ? undefined
                : { titleShimmerEnabled: config.titleShimmerEnabled },
        write(document) {
            const enabled = document.titleShimmerEnabled;
            if (enabled === undefined || config.titleShimmerEnabled === enabled) return;
            commit({ ...config, titleShimmerEnabled: enabled });
        },
    };

    return {
        configReceived(next, apply) {
            config = next;
            receiving = true;
            try {
                apply(settingsDesktop(next));
                for (const listener of preferenceListeners) listener();
            } finally {
                receiving = false;
            }
        },
        initialAppearance: config.appearance,
        initialKeepAwake: config.keepAwake,
        initialScrollbarVisibility: config.scrollbarVisibility,
        initialSettings: settingsInitial(config),
        preferencePersistence,
        titleShimmerPersistence,
        appearanceChanged(mode, scrollbarVisibility) {
            if (config.appearance === mode && config.scrollbarVisibility === scrollbarVisibility)
                return;
            commit({ ...config, appearance: mode, scrollbarVisibility });
        },
        keepAwakeChanged(mode) {
            if (config.keepAwake === mode) return;
            commit({ ...config, keepAwake: mode });
        },
        settingsChanged(snapshot) {
            const nextLinkOpen = snapshot.linkOpenPlacement;
            if (
                (config.linkOpen ?? "panel") === nextLinkOpen &&
                (config.previewUpdatesEnabled === true) === snapshot.previewUpdatesEnabled
            )
                return;

            commit({
                ...config,
                linkOpen: nextLinkOpen,
                previewUpdatesEnabled: snapshot.previewUpdatesEnabled,
            });
        },
    };
}

function settingsDesktop(config: DesktopConfig): HappyAgentSettingsDesktop {
    return {
        ...(config.linkOpen === undefined ? {} : { linkOpenPlacement: config.linkOpen }),
        previewUpdatesEnabled: config.previewUpdatesEnabled === true,
    };
}

function settingsInitial(config: DesktopConfig): HappyAgentSettingsInitial {
    const effort =
        thinkingLevel(config.defaultEffort) ??
        thinkingLevel(config.defaultModel?.effort) ??
        HAPPY_AGENT_DEFAULT_THINKING_LEVEL;
    return {
        ...(config.defaultModel ? { defaultModelId: config.defaultModel.modelId } : {}),
        defaultEffort: effort,
        defaultPermissionMode: permissionMode(config.defaultPermissionMode),
        ...settingsDesktop(config),
    };
}

function preferenceDocument(config: DesktopConfig): HappyAgentModelPreferenceDocument {
    const preferences: {
        [providerId: string]: {
            [modelId: string]: {
                effort: HappyAgentThinkingLevel | null;
                serviceTier: HappyAgentServiceTier | null;
            };
        };
    } = {};
    for (const preference of config.modelPreferences) {
        const provider = preferences[preference.providerId] ?? {};
        provider[preference.modelId] = {
            effort: thinkingLevel(preference.lastEffort) ?? null,
            serviceTier: preference.lastSpeed,
        };
        preferences[preference.providerId] = provider;
    }
    return {
        defaultEffort:
            thinkingLevel(config.defaultEffort) ??
            thinkingLevel(config.defaultModel?.effort) ??
            HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
        ...(config.defaultModel ? { defaultModelId: config.defaultModel.modelId } : {}),
        ...(config.lastPickedModel
            ? { lastPickedProviderId: config.lastPickedModel.providerId }
            : {}),
        defaultPermissionMode: permissionMode(config.defaultPermissionMode),
        preferences,
    };
}

function configFromPreferenceDocument(
    current: DesktopConfig,
    document: HappyAgentModelPreferenceDocument,
): DesktopConfig {
    const modelPreferences: DesktopModelPreference[] = [];
    for (const [providerId, models] of Object.entries(document.preferences)) {
        if (!models) continue;
        for (const [modelId, preference] of Object.entries(models)) {
            if (!preference) continue;
            modelPreferences.push({
                providerId,
                modelId,
                ...(preference.effort ? { lastEffort: preference.effort } : {}),
                lastSpeed: preference.serviceTier ?? null,
            });
        }
    }
    modelPreferences.sort(
        (left, right) =>
            left.providerId.localeCompare(right.providerId) ||
            left.modelId.localeCompare(right.modelId),
    );
    // This document qualifies both models by provider. The default model is
    // stored on the provider picked last, and the last pick keeps the model it
    // was made with while its provider stays the same.
    const providerId =
        document.lastPickedProviderId ??
        current.lastPickedModel?.providerId ??
        current.defaultModel?.providerId;
    const defaultModel =
        document.defaultModelId && providerId
            ? { providerId, modelId: document.defaultModelId }
            : undefined;
    const lastPickedModelId =
        current.lastPickedModel?.providerId === document.lastPickedProviderId
            ? current.lastPickedModel?.modelId
            : document.defaultModelId;
    const lastPickedModel =
        document.lastPickedProviderId && lastPickedModelId
            ? { providerId: document.lastPickedProviderId, modelId: lastPickedModelId }
            : undefined;
    return {
        appearance: current.appearance,
        ...(current.customTheme ? { customTheme: current.customTheme } : {}),
        defaultEffort: document.defaultEffort ?? HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
        ...(defaultModel ? { defaultModel } : {}),
        ...(lastPickedModel ? { lastPickedModel } : {}),
        defaultPermissionMode: document.defaultPermissionMode ?? "auto",
        ...(current.linkOpen === undefined ? {} : { linkOpen: current.linkOpen }),
        ...(current.keepAwake === undefined ? {} : { keepAwake: current.keepAwake }),
        ...(current.previewUpdatesEnabled === undefined
            ? {}
            : { previewUpdatesEnabled: current.previewUpdatesEnabled }),
        modelPreferences,
        scrollbarVisibility: current.scrollbarVisibility,
        ...(current.titleShimmerEnabled === undefined
            ? {}
            : { titleShimmerEnabled: current.titleShimmerEnabled }),
        version: 1,
    };
}

function thinkingLevel(value: string | undefined): HappyAgentThinkingLevel | undefined {
    return value && THINKING_LEVELS.has(value) ? (value as HappyAgentThinkingLevel) : undefined;
}

function permissionMode(value: string | undefined): HappyAgentPermissionMode {
    switch (value) {
        case "workspace_write":
        case "read_only":
        case "full_access":
            return value;
        default:
            return "auto";
    }
}
