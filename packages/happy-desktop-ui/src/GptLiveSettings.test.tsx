import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { gptLiveStoreCreate } from "happy-desktop-state";
import "./styles.css";
import { GptLiveSettings } from "./GptLiveSettings";
import { createRenderer } from "./testing";

it("renders the default-off opt-in and preserves switch identity and focus when changed", async () => {
    const store = gptLiveStoreCreate();
    let subscriptions = 0;
    const subscribe = (listener: () => void) => {
        subscriptions++;
        const unsubscribe = store.subscribe(listener);
        return () => {
            subscriptions--;
            unsubscribe();
        };
    };
    function Fixture() {
        const snapshot = useSyncExternalStore(subscribe, store.get, store.get);
        return (
            <GptLiveSettings
                enabled={snapshot.gptLiveEnabled}
                onEnabledChange={store.gptLiveEnabledUpdate}
            />
        );
    }
    const view = createRenderer();
    view.render(() => <Fixture />, { width: 720, height: 340, padding: 24 });
    await view.ready();

    expect(window.devicePixelRatio).toBe(2);
    expect(subscriptions).toBe(1);
    const control = view.$('[role="switch"]').element as HTMLButtonElement;
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-label")).toBe("Enable GPT-Live voice");
    const section = view.$('[data-happy-desktop-ui="happy-agent-settings-section"]');
    expect(section.element.textContent).toContain("GPT-Live calling is not available yet");
    expect(section.element.textContent).toContain("Running tasks are unaffected");
    expect(section.computedStyle("display")).toBe("flex");
    expect(section.computedStyle("gap")).toBe("12px");
    expect(section.bounds().width).toBe(672);
    const row = view.$('[data-happy-desktop-ui="form-row"]');
    const switchBox = view.$('[role="switch"]').bounds();
    expect(switchBox.width).toBe(28);
    expect(switchBox.height).toBe(16);
    expect(switchBox.x + switchBox.width).toBe(row.bounds().x + row.bounds().width);
    const label = view.$('[data-happy-desktop-ui="form-row-label"]');
    expect(label.computedStyle("font-size")).toBe("13px");
    expect(label.computedStyle("line-height")).toBe("20px");
    expect(label.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const ink = await label.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    expect(ink.bounds.x).toBeGreaterThanOrEqual(0);
    expect(ink.bounds.y).toBeGreaterThanOrEqual(0);
    expect(ink.bounds.y + ink.bounds.height).toBeLessThanOrEqual(label.bounds().height);
    await view.screenshot("GptLiveSettings.off.test");

    await userEvent.click(control);
    await expect.poll(() => control.getAttribute("aria-checked")).toBe("true");
    expect(view.$('[role="switch"]').element).toBe(control);
    expect(document.activeElement).toBe(control);
    expect(subscriptions).toBe(1);
    expect(store.get().gptLiveEnabled).toBe(true);
    // The shared switch animates its thumb; measure the settled on state.
    await expect
        .poll(
            () =>
                view.$('[data-happy-desktop-ui="switch-thumb"]').bounds().x -
                view.$('[data-happy-desktop-ui="switch-track"]').bounds().x,
        )
        .toBe(14);
    await view.screenshot("GptLiveSettings.on.test");
    await userEvent.keyboard(" ");
    await expect.poll(() => control.getAttribute("aria-checked")).toBe("false");
    expect(store.get().gptLiveEnabled).toBe(false);
    expect(document.activeElement).toBe(control);
    view.destroy();
    expect(subscriptions).toBe(0);
});
