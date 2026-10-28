import { expect, it, vi } from "vitest";
import {
    projectsVisibilityStoreCreate,
    projectsVisibilityConnection,
    type ProjectsVisibilityCacheDocument,
} from "./projectsVisibilityStore.js";

it("starts shown, hides at once for every subscriber, and writes only the change", () => {
    const write = vi.fn<(document: ProjectsVisibilityCacheDocument) => void>();
    const store = projectsVisibilityStoreCreate({ persistence: { read: () => undefined, write } });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(projectsVisibilityConnection(store.get(), "local").projectsHidden).toBe(false);

    store.projectsHiddenUpdate("local", true);
    expect(projectsVisibilityConnection(store.get(), "local").projectsHidden).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({
        connections: { local: expect.objectContaining({ device: { projectsHidden: true } }) },
    });

    // Saying the same thing again changes nothing.
    store.projectsHiddenUpdate("local", true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
});

it("reads the stored choice back, and treats a malformed or refused record as none", () => {
    expect(
        projectsVisibilityConnection(
            projectsVisibilityStoreCreate({
                persistence: {
                    read: () => ({ connections: { local: { device: { projectsHidden: true } } } }),
                    write: () => undefined,
                },
            }).get(),
            "local",
        ).projectsHidden,
    ).toBe(true);
    expect(
        projectsVisibilityConnection(
            projectsVisibilityStoreCreate({
                persistence: {
                    read: () => ({ connections: { local: { device: { projectsHidden: "yes" } } } }),
                    write: () => undefined,
                },
            }).get(),
            "local",
        ).projectsHidden,
    ).toBe(false);
    const refused = projectsVisibilityStoreCreate({
        persistence: {
            read: () => {
                throw new Error("denied");
            },
            write: () => {
                throw new Error("denied");
            },
        },
    });
    expect(projectsVisibilityConnection(refused.get(), "local").projectsHidden).toBe(false);
    refused.projectsHiddenUpdate("local", true);
    expect(projectsVisibilityConnection(refused.get(), "local").projectsHidden).toBe(true);
});
