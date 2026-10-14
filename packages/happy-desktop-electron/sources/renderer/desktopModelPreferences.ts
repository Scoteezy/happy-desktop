import {
    happyAgentModelPreferencesOwnedCreate,
    type HappyAgentModelPreferencePersistence,
    type HappyAgentUserSettingsDocument,
} from "happy-desktop-state";

/** Renderer-only cache; the local host's legacy bridge is used only until its daemon supports settings. */
export function desktopModelPreferencesCreate(
    id: string,
    legacy: HappyAgentModelPreferencePersistence,
) {
    const key = `happy.model-settings.v1:${id}`;
    return happyAgentModelPreferencesOwnedCreate({
        legacy,
        cache: {
            read() {
                try {
                    const value = localStorage.getItem(key);
                    return value
                        ? (JSON.parse(value) as HappyAgentUserSettingsDocument)
                        : undefined;
                } catch {
                    return undefined;
                }
            },
            write(document) {
                try {
                    localStorage.setItem(key, JSON.stringify(document));
                } catch {
                    /* Keep the window usable when storage is denied. */
                }
            },
        },
    });
}
