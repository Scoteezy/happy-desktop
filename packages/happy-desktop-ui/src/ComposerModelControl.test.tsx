import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { Composer } from "./Composer";
import {
    ComposerModelControl,
    type ComposerModelSelection,
    type ComposerModelService,
} from "./ComposerModelControl";
import { createRenderer } from "./testing";

const EFFORTS = [
    { id: "standard", label: "Standard" },
    { id: "extra-high", label: "Extra High" },
];
const MODELS = [
    { id: "sol", label: "5.6 Sol", efforts: EFFORTS },
    { id: "terra", label: "5.6 Terra", efforts: EFFORTS },
    { id: "luna", label: "5.6 Luna", efforts: EFFORTS },
];
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "codex",
        label: "Codex",
        account: "personal",
        accounts: [
            { id: "personal", label: "personal", models: MODELS },
            { id: "work", label: "work", models: MODELS },
        ],
    },
];
function Fixture() {
    const [selection, setSelection] = useState<ComposerModelSelection>({
        service: "codex",
        account: "personal",
        model: "sol",
        effort: "extra-high",
    });
    return (
        <div className="happy-theme-dark" style={{ marginTop: "280px" }}>
            <Composer
                data-testid="composer"
                modelControl={
                    <ComposerModelControl
                        data-testid="control"
                        onSelect={setSelection}
                        selection={selection}
                        services={SERVICES}
                    />
                }
                onSend={() => undefined}
                onValueChange={() => undefined}
                value=""
            />
            <button data-testid="outside" type="button">
                Outside
            </button>
        </div>
    );
}

it("composes the controlled model picker into the composer and navigates its menu", async () => {
    const view = createRenderer().render(() => <Fixture />, {
        width: 760,
        height: 500,
        padding: 20,
    });
    await view.ready();
    const slot = view.$('[data-testid="composer"] [data-happy-desktop-ui="composer-model"]');
    const control = view.$('[data-testid="control"]');
    const trigger = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-trigger"]',
    );
    const send = view.$('[data-testid="composer"] [aria-label="Send message"]');
    expect(slot.element.contains(control.element)).toBe(true);
    expect(trigger.bounds().height).toBe(32);
    expect(trigger.bounds().width).toBeGreaterThanOrEqual(160);
    expect(trigger.bounds().width).toBeLessThan(240);
    expect(trigger.bounds().x + trigger.bounds().width).toBeCloseTo(send.bounds().x - 8, 1);
    expect(trigger.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "999px",
        color: "rgb(255, 255, 255)",
    });
    expect(trigger.element.textContent).toContain("5.6 Sol");
    expect(trigger.element.textContent).toContain("Extra High");
    await userEvent.hover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    expect(trigger.computedStyle("background-color")).toBe("rgba(255, 255, 255, 0.08)");
    expect(trigger.computedStyle("transform")).toBe("none");
    expect(trigger.computedStyle("box-shadow")).toBe("none");
    await userEvent.unhover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    await userEvent.click(trigger.element);
    await userEvent.click(view.$('[data-testid="outside"]').element);
    expect(
        view.container.querySelector(
            '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-menu"]',
        ),
    ).toBeNull();
    await userEvent.click(trigger.element);
    const menu = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-menu"]',
    );
    expect(menu.bounds().width).toBe(360);
    expect(menu.bounds().x + menu.bounds().width).toBeCloseTo(
        control.bounds().x + control.bounds().width,
        1,
    );
    expect(menu.computedStyle("box-shadow")).toBe("none");
    expect(trigger.bounds().y - (menu.bounds().y + menu.bounds().height)).toBeCloseTo(8, 1);
    expect(menu.element.textContent).toContain("5.6 Terra");
    const header = view.$('[data-testid="control"] [data-service-header="codex"]');
    await userEvent.hover(header.element);
    for (const animation of header.element.getAnimations()) animation.finish();
    expect(header.computedStyle("transform")).toBe("none");
    await userEvent.click(header.element);
    const choices = view.$(
        '[data-testid="control"] [data-happy-desktop-ui="composer-model-control-accounts"]',
    );
    expect(choices.element.textContent).toContain("work");
    // The composer places this selector against its right edge. Its account
    // submenu must therefore open left of the menu and remain in-view.
    const submenuGap = menu.bounds().x - (choices.bounds().x + choices.bounds().width);
    expect(submenuGap).toBeGreaterThanOrEqual(7);
    expect(submenuGap).toBeLessThanOrEqual(8);
    expect(choices.bounds().x).toBeGreaterThanOrEqual(20);
    expect(choices.bounds().x + choices.bounds().width).toBeLessThanOrEqual(740);
    const terra = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-testid="control"] .happy-composer-model-control__row-main',
        ),
    ).find((choice) => choice.textContent === "5.6 Terra");
    await userEvent.click(terra!);
    expect(trigger.element.textContent).toContain("5.6 Terra");
    expect(view.container.querySelector('[aria-label="Advanced reasoning budget"]')).toBeNull();
    expect(view.container.textContent).not.toContain("Speed");
    await view.screenshot("ComposerModelControl.test");
}, 120000);
