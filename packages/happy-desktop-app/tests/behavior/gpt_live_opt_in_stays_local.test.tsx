import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    gptLiveStoreCreate,
    happyAgentSettingsStoreCreate,
    type GptLiveDocument,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas. The unrelated offline model-catalog spinner is covered
// by its own browser tests; the real GPT-Live settings tree remains mounted.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

it("offers and remembers the independent default-off voice switch even with no daemon", () => {
    let document: GptLiveDocument | undefined;
    const persistence = {
        read: () => document,
        write: (next: GptLiveDocument) => {
            document = next;
        },
    };
    const gptLive = gptLiveStoreCreate(persistence);
    const experiments = experimentsStoreCreate();
    experiments.experimentalFeaturesUpdate(true);
    const directory: AppHappyAgentDirectorySnapshot = { happyAgents: [] };
    const appearance = appearanceStoreCreate();
    const settings = happyAgentSettingsStoreCreate();
    const defaults = settings.get();
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            experiments={experiments}
            gptLive={gptLive}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            onCategorySelect={() => {}}
            onClose={() => {}}
            section="general"
            settings={settings}
        />,
    );
    const control = view.getByRole("switch", { name: "Enable GPT-Live voice" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(view.getByText("Choose an account, then explicitly start a call")).toBeTruthy();
    fireEvent.click(control);
    expect(gptLive.get().gptLiveEnabled).toBe(true);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(true);
    expect(view.getByRole("switch", { name: "Enable GPT-Live voice" })).toBe(control);
    expect(settings.get()).toBe(defaults);
    fireEvent.click(control);
    expect(gptLive.get().gptLiveEnabled).toBe(false);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(false);
    expect(experiments.get().experimentalFeaturesEnabled).toBe(true);
    view.unmount();
    appearance[Symbol.dispose]();
});
