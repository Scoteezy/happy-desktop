import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/splash-cover.css";
import { SplashCover } from "./SplashCover";
import { createRenderer } from "./testing";

function readyStore() {
    let ready = false;
    const listeners = new Set<() => void>();
    return {
        get: () => ready,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set: () => {
            ready = true;
            for (const listener of listeners) listener();
        },
    };
}

const veil = '[data-happy-desktop-ui="splash-cover-veil"]';

it("keeps the app it fades off mounted once the veil is gone", async () => {
    const store = readyStore();
    let mounts = 0;
    function Cover() {
        const ready = useSyncExternalStore(store.subscribe, store.get);
        return (
            <SplashCover quiet ready={ready}>
                <div
                    data-testid="app"
                    ref={(node) => {
                        if (node !== null) mounts += 1;
                    }}
                >
                    App
                </div>
            </SplashCover>
        );
    }
    const view = createRenderer();
    view.render(() => <Cover />, { width: 320, height: 200 });
    await view.ready();
    expect(view.container.querySelector('[data-testid="app"]')).toBeNull();

    store.set();
    await vi.waitFor(() => expect(view.container.querySelector(veil)).toBeNull(), {
        timeout: 2_000,
    });
    expect(view.container.querySelector('[data-testid="app"]')?.textContent).toBe("App");
    expect(mounts).toBe(1);
});

it("shows an app that had already started without a veil", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <SplashCover quiet ready uncovered>
                <div data-testid="app">App</div>
            </SplashCover>
        ),
        { width: 320, height: 200 },
    );
    await view.ready();
    expect(view.container.querySelector(veil)).toBeNull();
    expect(view.container.querySelector('[data-testid="app"]')?.textContent).toBe("App");
});
