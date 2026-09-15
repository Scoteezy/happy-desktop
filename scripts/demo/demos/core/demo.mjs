import * as world from "./world.mjs";
import { coreProtocolOpen, steveMessageId } from "./protocol.mjs";
import { markersClear, textareaMarker, transcriptMarker } from "./markers.mjs";

let recordedAgentId;

async function until(demo, read, label, timeout = 30000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Core demo: timed out waiting for ${label}.`);
        await demo.hold(200);
    }
}

export default {
    id: "core",
    title: "This is Happy",
    subtitle: "One conversation, shared work",
    transitions: "none",
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: coreProtocolOpen,
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "patches/empty-state.patch" },
    ],
    async run(demo, gym, { phone } = {}) {
        await demo.settle('[data-happy-desktop-ui="sidebar"]', { after: 1800 });
        await demo.page.getByText("happy", { exact: true }).first().click();
        await demo.page.locator('[data-happy-desktop-ui="conversation-view"]').waitFor();
        await demo.page.waitForTimeout(1500);
        await demo.page.getByText("happy", { exact: true }).first().hover();
        await demo.page.getByLabel("New workspace in happy", { exact: true }).click();
        await demo.page.locator('[data-happy-desktop-ui="composer-textarea"]').first().waitFor();
        await demo.page.waitForTimeout(1500);
        // Enter the already-prepared workspace with a fresh catalog bootstrap.
        // The current client registers a new checkout's Git watch before its
        // initialization completes, then otherwise waits two minutes to renew.
        // All preparation stays off camera; no refresh control is filmed.
        await demo.page.reload({ waitUntil: "domcontentloaded" });
        await demo.page.locator('[data-happy-desktop-ui="composer-textarea"]').first().waitFor();
        await demo.page.waitForTimeout(1800);
        // Set the opening choice through the real control, still off camera.
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first()
            .click();
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-row"]')
            .filter({ hasText: "Model" })
            .first()
            .click();
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-choice"]')
            .filter({ hasText: "GPT-6 Astra" })
            .first()
            .click();
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-choice"]')
            .first()
            .waitFor({ state: "hidden" });
        await demo.page.waitForTimeout(650);
        if (phone) {
            await phone.prepare();
            if ((await gym.client.getHappyIntegration()).integration.status !== "connected")
                throw new Error("The phone is not connected to this actual demo daemon.");
            // Set the real phone composer off-camera. The isolated harness
            // defaults to Gym; both visible clients should use Fable / Extra High.
            await phone.simulator.run(
                "- tapOn:\n    text: New chat, .*\n- tapOn:\n    text: MODEL\n    index: 0\n- tapOn:\n    text: Fable 5.1\n- tapOn:\n    text: EFFORT\n    index: 0\n- tapOn:\n    text: Extra High\n- tapOn:\n    point: 38, 88",
            );
            await phone.prepare();
            await phone.start();
        }
        await demo.caption("This is Happy.");
        await demo.hold(2000);
        const composer = demo.page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        await demo.caption("I’m switching from Astra to Fable for this UI task.");
        await demo.zoomTo('[data-happy-desktop-ui="composer"]', { level: 1.25 });
        const model = demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first();
        if (!(await model.innerText()).includes("Astra"))
            throw new Error("The starting model is not Astra.");
        await demo.hold(1300);
        await demo.click(model);
        await demo.click(
            demo.page
                .locator('[data-happy-desktop-ui="composer-model-control-row"]')
                .filter({ hasText: "Model" })
                .first(),
        );
        await demo.click(
            demo.page
                .locator('[data-happy-desktop-ui="composer-model-control-choice"]')
                .filter({ hasText: "Fable 5.1" })
                .first(),
        );
        await demo.hold(650);
        await demo.click(composer);
        const lead = "Add a waveform to the voice agent that animates when speaking. ";
        const review = "Review control flow with Astra.";
        await demo.caption("Add a waveform that animates when speaking.");
        await demo.type(lead, { perKey: 43, after: 450 });
        await demo.caption("Review control flow with Astra.");
        await demo.type(review, {
            perKey: 48,
            after: 700,
            afterCharacter: (length) =>
                textareaMarker(demo.page, lead.length, lead.length + length),
        });
        await demo.hold(700);
        await markersClear(demo.page);
        await demo.caption(undefined);
        const sent = demo.page.waitForResponse(
            (response) =>
                response.request().method() === "POST" &&
                /\/v0\/agents\/[^/]+\/send$/.test(new URL(response.url()).pathname),
        );
        await demo.press("Enter", { after: 300 });
        const submission = await sent;
        const parent = {
            id: new URL(submission.url()).pathname.match(/\/v0\/agents\/([^/]+)\/send$/)[1],
        };
        recordedAgentId = parent.id;
        await demo.zoomOut();
        await until(demo, () => world.hasReached("reading"), "Fable reading the voice files");
        await demo.hold(1800);

        await demo.caption("Steve jumps in while Fable is working.");
        // Submit only the finished collaborator message: no draft synchronization.
        await gym.client.sendMessage(parent.id, {
            id: steveMessageId,
            text: world.stevePrompt,
            mode: world.fableMode,
            delivery: "steer",
        });
        world.release("reading");
        await demo.page.getByText("Steve", { exact: true }).first().waitFor({ timeout: 15000 });
        await demo.zoomTo({ text: world.stevePrompt, exact: true }, { level: 1.35 });
        await transcriptMarker(demo.page, ["Steve", "Grok sub-agent"]);
        await demo.hold(2200);
        await demo.caption("He asks for a Grok sub-agent to research X.");
        await demo.hold(2900);
        await markersClear(demo.page);
        await demo.zoomOut();

        world.release("delegation");
        await until(demo, () => world.hasReached("implementation"), "Grok’s delegation");
        await demo.click('[data-happy-desktop-ui="happy-agent-activity-control"]');
        const grok = demo.page
            .locator('[data-happy-desktop-ui="happy-agent-activity-subagent"]')
            .filter({ hasText: world.grokTask });
        await grok.waitFor();
        await demo.caption("Fable starts the Grok sub-agent.");
        await transcriptMarker(demo.page, [world.grokTask], "body");
        await demo.hold(2700);
        await markersClear(demo.page);
        if (phone) {
            phone.cue("phone-enter", demo);
            await demo.caption("Take the same session with you.");
            await demo.hold(1700);
            await phone.inspect("working-session-list");
            await phone.simulator.run("- tapOn:\n    text: Voice waveform, .*");
            phone.cue("phone-session-open", demo);
            await demo.caption("Fable makes the change…");
            await demo.hold(200);
        } else demo.playbackSpeed(4);
        await demo.caption("Fable makes the change…");
        world.release("implementation");
        await until(demo, () => world.hasReached("astra-launch"), "the file edit");
        if (phone) {
            await until(
                demo,
                async () => {
                    const screen = await phone.inspect("live-inline-diff");
                    return (
                        screen.some((item) => item.id === "diff-syntax-ready") &&
                        screen.some((item) => item.text?.includes("isActive={isVoiceSpeaking}"))
                    );
                },
                "the real inline phone diff",
            );
            await phone.simulator.run(
                "- swipe:\n    start: 90%, 48%\n    end: 30%, 48%\n    duration: 900",
            );
            phone.cue("phone-diff-visible", demo);
            await demo.caption("The diff arrives here, too.");
            await phone.inspect("syntax-highlighted-inline-diff");
            await demo.hold(4500);
            phone.cue("phone-exit", demo);
        }
        if (!phone) await demo.hold(7000);
        await demo.caption("…then brings in Astra to review it.");
        world.release("astra-launch");
        await until(demo, () => world.hasReached("finishing"), "Astra’s delegation");
        await until(demo, () => world.hasReached("astra-running"), "Astra’s review");
        if (phone) {
            world.release("grok-running");
            world.release("astra-running");
            await demo.hold(3500);
        } else await demo.hold(10000);
        world.release("grok-running");
        world.release("astra-running");
        if (!phone) await demo.hold(6000);
        world.release("finishing");
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(parent.id, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed turn",
        );
        demo.playbackSpeed(1);
        const researchLink = demo.page
            .getByRole("link", { name: "Watch the demo on X", exact: true })
            .last();
        await researchLink.waitFor();
        await researchLink.scrollIntoViewIfNeeded();
        await demo.caption("Grok found OpenAI’s live voice demo.");
        await transcriptMarker(demo.page, ["Watch the demo on X"]);
        await demo.hold(4000);
        await markersClear(demo.page);
        await demo.caption("Done. Let’s look at the changes.");
        phone?.cue("desktop-review", demo);
        const panelToggle = demo.page.getByRole("button", { name: "Show panel", exact: true });
        if (await panelToggle.isVisible()) await demo.click(panelToggle);
        await demo.click({ role: "tab", name: "Files" });
        await demo.click({ role: "button", name: "Changes" });
        await demo.hold(1300);
        await demo.click(
            demo.page
                .locator('[data-happy-desktop-ui="file-tree-row"]')
                .filter({ hasText: "VoiceAssistantStatusBar.tsx" }),
        );
        for (const name of ["Unified", "No wrap"]) {
            const choice = demo.page.getByRole("button", { name, exact: true });
            if ((await choice.getAttribute("aria-pressed")) !== "true") await demo.click(choice);
        }
        await demo.caption("Here’s the diff.");
        await demo.hold(5500);
        await demo.click({ role: "button", name: "Wrap", exact: true });
        await demo.caption("That’s a wrap.");
        await demo.hold(2400);
        await demo.click(
            demo.page
                .locator('[data-happy-desktop-ui="tab"]')
                .filter({ hasText: "VoiceAssistantStatusBar.tsx" })
                .getByRole("button", { name: "Close tab", exact: true }),
        );
        await demo.hold(2000);
        await demo.caption(undefined);
        await demo.pointerVisible(false);
        await demo.hold(1000);
    },
    async evidence(page, gym) {
        return {
            fixture: {
                inference: "screenplay",
                collaborator:
                    "Fictional Steve, one explicit protocol-fixture identity; no draft synchronization",
                delivery: "steer",
            },
            health: await gym.client.getHealth(),
            agentId: recordedAgentId,
            steveMessageId,
            history: await gym.client.getMessages(recordedAgentId, { limit: 64 }),
            activity: await gym.client.getAgentActivity(recordedAgentId),
            finalVisibleText: await page.locator("body").innerText(),
        };
    },
};
