import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import { agentAuthor } from "happy-desktop-state";
import {
    conversationRegressionHarness,
    regressionFrames,
    regressionOwn,
} from "./testing/conversationRegressionHarness";

it.skipIf(server.browser !== "chromium")(
    "models an offscreen resumed answer after local sends change its closing padding (seed 305419896)",
    async () => {
        const h = conversationRegressionHarness("resume-context", 65);
        try {
            await h.ready();
            await h.resize(820, 360, 0.67);
            h.wheel(-h.viewport().scrollHeight);
            await regressionFrames();
            const message = regressionOwn("resumed", "sent");
            if (message.kind !== "message") throw new Error("Expected own message fixture");
            h.extras = [
                {
                    kind: "notice",
                    id: "separator",
                    sequence: "separator",
                    variant: "notice",
                    level: "info",
                    text: "The provider changed.",
                },
                {
                    ...message,
                    sentHere: false,
                    message: {
                        ...message.message,
                        sender: agentAuthor,
                        text:
                            "The resumed turn is streaming." +
                            "\n\nThe resumed turn continues streaming. ".repeat(8),
                        generationStatus: "streaming",
                    },
                },
            ];
            h.publish();
            await regressionFrames();
            h.queue(1);
            await regressionFrames();
            h.extras = [
                ...h.extras,
                regressionOwn("send:0", "sending"),
                regressionOwn("send:1", "sending"),
            ];
            h.publish();
            await regressionFrames();
            const viewport = h.viewport();
            viewport.tabIndex = 0;
            viewport.focus();
            await userEvent.keyboard("{End}");
            await new Promise<void>((resolve) => setTimeout(resolve, 450));
            await regressionFrames();
            const row = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].find((node) => node.textContent?.includes("The resumed turn is streaming."))!;
            expect(row, "resumed reply is not mounted after End").toBeDefined();
            const next = viewport.querySelector<HTMLElement>(
                `.happy-message-list__virtual-row[data-index="${Number(row.dataset.index) + 1}"]`,
            )!;
            expect(next).toBeDefined();
            const modeled =
                Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                Number.parseFloat(row.style.transform.slice("translateY(".length));
            expect(
                Math.abs(modeled - row.getBoundingClientRect().height),
                `resumed row model=${modeled} paint=${row.getBoundingClientRect().height}`,
            ).toBeLessThanOrEqual(1);
        } finally {
            await h.close();
        }
    },
);
