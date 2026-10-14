import {
    happyAgentHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouter,
} from "happy-desktop-app";
import {
    commandPaletteStoreCreate,
    happyAgentNavigationOrderStoreCreate,
    happyAgentSidebarCollapseStoreCreate,
    happyAgentSidebarSearchStoreCreate,
    happyAgentSettingsStoreOwnedCreate,
    type CommandPaletteStore,
    type HappyAgentNavigationOrderStore,
    type HappyAgentSidebarCollapseStore,
    type HappyAgentSidebarSearchStore,
    type HappyAgentSidebarVisibilityStore,
    type HappyAgentSettingsStore,
    type HappyAgentModelPreferencePersistence,
    type HappyAgentModelPreferenceDocument,
} from "happy-desktop-state";
import type {
    HappyAgentDirectoryStore,
    HappyAgentDirectorySnapshot,
} from "./happyAgentDirectoryStore";

export interface DesktopConnectionUi {
    readonly router: HappyAgentRouter;
    readonly commandPalette: CommandPaletteStore;
    readonly navigationOrder: HappyAgentNavigationOrderStore;
    readonly sidebarCollapse: HappyAgentSidebarCollapseStore;
    readonly sidebarSearch: HappyAgentSidebarSearchStore;
    readonly sidebarVisibility: HappyAgentSidebarVisibilityStore;
    readonly settings: HappyAgentSettingsStore;
    readonly directory: HappyAgentDirectoryStore;
    dispose(): void;
}

/** A stable renderer composition lifetime, with an ordinary router and isolated stores. */
export function desktopConnectionUiCreate(input: {
    readonly id: string;
    readonly directory: HappyAgentDirectoryStore;
    readonly preferences: HappyAgentModelPreferencePersistence;
    /** The window's own fold of its left side, shared by every connection. */
    readonly sidebarVisibility: HappyAgentSidebarVisibilityStore;
    readonly main?: Omit<DesktopConnectionUi, "directory" | "dispose" | "sidebarVisibility"> & {
        readonly modelPreferencesChanged: (document: HappyAgentModelPreferenceDocument) => void;
    };
}): DesktopConnectionUi {
    const { id } = input;
    const key = `happy.connection-history.v1:${id}`;
    const history =
        input.main?.router.history ??
        happyAgentHistoryCreate({
            browser: false,
            persistence: {
                read() {
                    try {
                        const value = localStorage.getItem(key);
                        return value ? (JSON.parse(value) as unknown) : undefined;
                    } catch {
                        return undefined;
                    }
                },
                write(document) {
                    try {
                        localStorage.setItem(key, JSON.stringify(document));
                    } catch {
                        /* In-memory navigation still works. */
                    }
                },
            },
        });
    const router = input.main?.router ?? happyAgentRouterCreate(history);
    let entry = input.directory.get().happyAgents.find((item) => item.id === id);
    let snapshot: HappyAgentDirectorySnapshot = {
        activeHappyAgentId: id,
        happyAgents: entry ? [entry] : [],
    };
    const listeners = new Set<() => void>();
    const unsubscribe = input.directory.subscribe(() => {
        const next = input.directory.get().happyAgents.find((item) => item.id === id);
        if (next === entry) return;
        const materialized = next?.session !== entry?.session;
        entry = next;
        snapshot = { activeHappyAgentId: id, happyAgents: next ? [next] : [] };
        for (const listener of listeners) listener();
        if (materialized) void router.invalidate();
    });
    const stored = input.preferences.read();
    const ownedSettings = input.main
        ? {
              store: input.main.settings,
              modelPreferencesChanged: input.main.modelPreferencesChanged,
          }
        : happyAgentSettingsStoreOwnedCreate({
              ...(stored?.defaultSelection
                  ? {
                        defaultProviderId: stored.defaultSelection.providerId,
                        defaultModelId: stored.defaultSelection.modelId,
                    }
                  : {}),
              ...(stored?.defaultEffort ? { defaultEffort: stored.defaultEffort } : {}),
              ...(stored?.defaultPermissionMode
                  ? { defaultPermissionMode: stored.defaultPermissionMode }
                  : {}),
          });
    const { store: settings, modelPreferencesChanged } = ownedSettings;
    let reconciling = false;
    const reconcilePreferences = (): void => {
        reconciling = true;
        try {
            modelPreferencesChanged(input.preferences.read() ?? { preferences: {} });
        } finally {
            reconciling = false;
        }
    };
    reconcilePreferences();
    const unsubscribePreferences = input.preferences.subscribe?.(reconcilePreferences);
    const unsubscribeSettings = settings.subscribe(() => {
        if (reconciling) return;
        const value = settings.get();
        const current = input.preferences.read();
        const modelChanged =
            value.defaultProviderId !== current?.defaultSelection?.providerId ||
            value.defaultModelId !== current?.defaultSelection?.modelId;
        const effortChanged = value.defaultEffort !== current?.defaultEffort;
        const identity =
            value.defaultProviderId && value.defaultModelId
                ? { providerId: value.defaultProviderId, modelId: value.defaultModelId }
                : undefined;
        let preferences = current?.preferences ?? {};
        if (identity && (modelChanged || effortChanged)) {
            preferences = {
                ...preferences,
                [identity.providerId]: {
                    ...preferences[identity.providerId],
                    [identity.modelId]: {
                        ...preferences[identity.providerId]?.[identity.modelId],
                        effort: value.defaultEffort,
                    },
                },
            };
        }
        input.preferences.write({
            ...current,
            preferences,
            defaultEffort: value.defaultEffort,
            defaultPermissionMode: value.defaultPermissionMode,
            defaultSelection: modelChanged || effortChanged ? identity : current?.defaultSelection,
            ...(modelChanged && identity ? { lastPickedModel: identity } : {}),
        });
    });
    return {
        router,
        settings,
        commandPalette: input.main?.commandPalette ?? commandPaletteStoreCreate(),
        navigationOrder: input.main?.navigationOrder ?? happyAgentNavigationOrderStoreCreate(),
        sidebarCollapse: input.main?.sidebarCollapse ?? happyAgentSidebarCollapseStoreCreate(),
        sidebarSearch: input.main?.sidebarSearch ?? happyAgentSidebarSearchStoreCreate(),
        sidebarVisibility: input.sidebarVisibility,
        directory: {
            get: () => snapshot,
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            // Routing within an inactive connection must not select it globally.
            happyAgentActivate: () => undefined,
            happyAgentReorder: input.directory.happyAgentReorder,
        },
        dispose() {
            unsubscribe();
            unsubscribeSettings?.();
            unsubscribePreferences?.();
            listeners.clear();
            if (!input.main) history.destroy();
        },
    };
}
