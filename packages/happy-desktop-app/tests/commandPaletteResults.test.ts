import { expect, it } from "vitest";
import { commandPaletteResults } from "../sources/commandPaletteResults";
import { happyAgentSettingsCategoryExists } from "../sources/views/AppHappyAgentSettingsView";

it.each([false, true])(
    "searching voice opens the Voice settings route (experimental opt-in: %s)",
    (experimentalFeaturesEnabled) => {
        const result = commandPaletteResults({
            happyAgentId: "local",
            projects: [],
            archivedSessions: [],
            tabs: [],
            sessionCreateAvailable: false,
            workspaceCreateAvailable: false,
            taskCreateAvailable: false,
            query: "voice",
            themeMode: "system",
            scrollbarVisibility: "automatic",
            linkOpenPlacement: "panel",
            titleShimmerEnabled: false,
            experimentalFeaturesEnabled,
        });
        const voice = result.rows.find(
            (row) => row.kind === "command" && row.id === "settings:voice",
        );
        expect(voice).toMatchObject({
            title: "Settings › Voice",
            glyph: { kind: "icon", name: "call" },
            command: { kind: "settingsSectionOpen", section: "voice" },
        });
        expect(happyAgentSettingsCategoryExists("voice")).toBe(true);
        expect(
            result.rows.some((row) => row.kind === "command" && row.id === "settings:experimental"),
        ).toBe(false);
    },
);
