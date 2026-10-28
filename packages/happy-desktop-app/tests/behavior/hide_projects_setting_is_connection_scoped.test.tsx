import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    projectsVisibilityStoreCreate,
    projectsVisibilityConnection,
    type ProjectsVisibilityCacheDocument,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/* The General setting remains editable offline for the known host connection. */

it("queues Hide projects for the host connection while it is offline", () => {
    let stored: ProjectsVisibilityCacheDocument | undefined;
    const persistence = {
        read: () => stored,
        write: (next: ProjectsVisibilityCacheDocument) => {
            stored = next;
        },
    };
    const projectsVisibility = projectsVisibilityStoreCreate({ persistence });
    const directory: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                id: "local",
                label: "Local",
                status: "disconnected",
                projects: [],
                bots: [],
                projectsStatus: "loading",
            },
        ],
    };
    const appearance = appearanceStoreCreate();
    const settings = happyAgentSettingsStoreCreate();
    const defaults = settings.get();
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            onCategorySelect={() => {}}
            onClose={() => {}}
            projectsVisibility={projectsVisibility}
            section="general"
            settings={settings}
        />,
    );
    const control = view.getByRole("switch", { name: "Hide projects" });
    expect(control.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(control);
    expect(projectsVisibilityConnection(projectsVisibility.get(), "local").projectsHidden).toBe(
        true,
    );
    expect(view.getByRole("switch", { name: "Hide projects" }).getAttribute("aria-checked")).toBe(
        "true",
    );
    // A window opened later reads the same choice back.
    expect(
        projectsVisibilityConnection(projectsVisibilityStoreCreate({ persistence }).get(), "local")
            .projectsHidden,
    ).toBe(true);
    // Unrelated machine settings are untouched.
    expect(settings.get()).toBe(defaults);

    fireEvent.click(view.getByRole("switch", { name: "Hide projects" }));
    expect(stored?.connections["local"]?.device).toEqual({ projectsHidden: false });
    view.unmount();
    appearance[Symbol.dispose]();
});
