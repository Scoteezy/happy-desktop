import { expect, it } from "vitest";
import {
    conversationRegressionHarness,
    regressionFrames,
} from "./testing/conversationRegressionHarness";

it("keeps a short transcript visible after its tall shell collapses (seed 101)", async () => {
    const h = conversationRegressionHarness("blank-shell", 2);
    try {
        await h.ready();
        h.extras = [
            {
                kind: "agentActivity",
                id: "shell",
                sequence: "shell",
                activity: {
                    kind: "shell",
                    command: "cat build.log",
                    output: "Build passed\n".repeat(80),
                    exitCode: 0,
                    running: false,
                    timedOut: false,
                },
            },
        ];
        h.publish();
        await regressionFrames();
        const viewport = h.viewport();
        const button = viewport.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
        expect(button).toBeDefined();
        const bounds = viewport.getBoundingClientRect(),
            control = button.getBoundingClientRect();
        if (control.top < bounds.top || control.bottom > bounds.bottom) {
            h.wheel(control.top - bounds.top - 20);
            await regressionFrames();
        }
        expect(button.getAttribute("aria-expanded")).toBe("true");
        button.click();
        await regressionFrames();
        expect(button.getAttribute("aria-expanded")).toBe("false");
        const after = viewport.getBoundingClientRect();
        const visible = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.height > 0 && rect.bottom > after.top && rect.top < after.bottom;
        });
        expect(visible.length, "shell collapse left the viewport blank").toBeGreaterThan(0);
    } finally {
        await h.close();
    }
});
