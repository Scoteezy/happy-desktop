import * as world from "./world.mjs";
import { coreProtocolOpen, steveMessageId } from "./protocol.mjs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

let recordedAgentId;
let framing;
const cues = [];
const cue = (name, demo, phone) => {
    cues.push({ name, seconds: demo.timing.frames / demo.timing.fps });
    phone?.cue(name, demo);
};

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
    title: "One conversation, shared work",
    subtitle: "One conversation, shared work",
    transitions: "none",
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: coreProtocolOpen,
    phoneFrame: {
        frame: "assets/device/iphone-16-pro-black.png",
        alpha: "assets/device/screen-alpha.png",
        width: 1406,
        height: 2822,
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
    },
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "patches/empty-state.patch" },
        { scope: "demo", source: "patches/model-order.patch" },
    ],
    async run(demo, gym, { phone, output } = {}) {
        // These are only prior takes in this private fixture project. Preserve
        // its explicitly declared background workspaces and archive rehearsals.
        const { workspaces } = await gym.client.listWorkspaces({
            projectId: gym.world.projectId,
            limit: 50,
        });
        for (const workspace of workspaces) {
            if (workspace.id === gym.world.projectId || world.worktrees.includes(workspace.name))
                continue;
            await gym.client.archiveWorkspace(workspace.id, { ifMatch: workspace.version });
        }
        await demo.page.locator('[data-happy-desktop-ui="sidebar"]').waitFor();
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
        const hidePanel = demo.page.getByRole("button", { name: "Hide panel", exact: true });
        if (await hidePanel.isVisible()) await hidePanel.click();
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
        framing = await demo.framingPrepare(
            demo.page.locator('[data-happy-desktop-ui="conversation-view"]').first(),
        );
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        if (phone) {
            await phone.prepare({ sessionTitle: "New chat", relaunch: true });
            if ((await gym.client.getHappyIntegration()).integration.status !== "connected")
                throw new Error("The phone is not connected to this actual demo daemon.");
            // Configure this private session's native composer before any work
            // arrives, then return home. Later results genuinely become unread.
            for (const command of [
                "- tapOn:\n    text: New chat, .*",
                "- tapOn:\n    text: MODEL\n    index: 0",
                "- tapOn:\n    text: Fable 5.1",
                "- tapOn:\n    text: EFFORT\n    index: 0",
                "- tapOn:\n    text: Extra High",
            ]) {
                await phone.simulator.run(command);
                // Native menus have a dismissal animation after the action
                // reports success. Do not send the next tap into that layer.
                await demo.page.waitForTimeout(650);
            }
            await phone.screenshot("phone-configured");
            await phone.simulator.run("- tapOn:\n    point: 38, 88");
            await phone.prepare();
            await phone.start();
        }
        await demo.hold(1600);
        cue("center-enter", demo, phone);
        await demo.frameTo(framing.crop, { duration: 1100 });
        cue("center-locked", demo, phone);
        const composer = demo.page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        const model = demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first();
        if (!(await model.innerText()).includes("Astra"))
            throw new Error("The starting model is not Astra.");
        await demo.hold(500);
        await demo.click(model);
        await demo.click(
            demo.page
                .locator('[data-happy-desktop-ui="composer-model-control-row"]')
                .filter({ hasText: "Model" })
                .first(),
        );
        cue("picker-open", demo, phone);
        const choices = demo.page.locator(
            '[data-happy-desktop-ui="composer-model-control-choice"]',
        );
        const fable = choices.filter({ hasText: "Fable 5.1" }).first();
        const opus = choices.filter({ hasText: "Opus 5" }).first();
        const fableBox = await fable.boundingBox();
        const opusBox = await opus.boundingBox();
        if (!fableBox || !opusBox || fableBox.y >= opusBox.y)
            throw new Error("Fable must appear above Opus in the actual model menu.");
        await demo.moveTo(choices.filter({ hasText: "GPT-6 Astra" }).first(), { duration: 700 });
        await demo.hold(400);
        await demo.moveTo(opus, { duration: 850 });
        await demo.hold(450);
        await demo.moveTo(fable, { duration: 450 });
        await demo.hold(850);
        await demo.page.screenshot({ path: join(output, "picker-hover.png") });
        await demo.click(fable, { after: 550 });
        cue("picker-chosen", demo, phone);
        await demo.click(composer, { after: 150 });
        await demo.type(world.prompt, { perKey: 49, after: 500 });
        const sent = demo.page.waitForResponse(
            (response) =>
                response.request().method() === "POST" &&
                /\/v0\/agents\/[^/]+\/send$/.test(new URL(response.url()).pathname),
        );
        await demo.press("Enter", { badge: 0, before: 0, after: 200 });
        const submission = await sent;
        const parent = {
            id: new URL(submission.url()).pathname.match(/\/v0\/agents\/([^/]+)\/send$/)[1],
        };
        recordedAgentId = parent.id;
        await demo.pointerVisible(false);
        cue("work-started", demo, phone);
        await until(demo, () => world.hasReached("reading"), "Fable reading the voice files");
        await demo.hold(1400);
        // Submit only the finished collaborator message: no draft synchronization.
        await gym.client.sendMessage(parent.id, {
            id: steveMessageId,
            text: world.stevePrompt,
            mode: world.fableMode,
            delivery: "steer",
        });
        world.release("reading");
        await demo.page.getByText("Steve", { exact: true }).first().waitFor({ timeout: 15000 });
        cue("steve-steers", demo, phone);
        await demo.hold(3000);

        world.release("delegation");
        await until(demo, () => world.hasReached("implementation"), "Grok’s delegation");
        cue("grok-spawned", demo, phone);
        await demo.hold(2000);
        world.release("implementation");
        await until(demo, () => world.hasReached("astra-launch"), "the file edit");
        cue("logic-edited", demo, phone);
        await demo.hold(800);
        world.release("astra-launch");
        await until(demo, () => world.hasReached("finishing"), "Astra’s delegation");
        await until(demo, () => world.hasReached("astra-running"), "Astra’s review");
        await demo.hold(1800);
        world.release("grok-running");
        world.release("astra-running");
        await until(
            demo,
            async () =>
                (await gym.client.getAgentActivity(parent.id)).subagents.every(
                    (agent) => agent.status === "idle",
                ),
            "completed delegates",
        );
        world.release("finishing");
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(parent.id, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed turn",
        );
        const researchLink = demo.page
            .getByRole("link", { name: "Watch the demo on X", exact: true })
            .last();
        await researchLink.waitFor();
        cue("response-settled", demo, phone);
        await demo.pointerVisible(false);
        await demo.hold(3000);
        cue("center-exit", demo, phone);
        await demo.zoomOut({ duration: 1100 });
        if (phone) {
            const screen = await phone.inspect("completed-unread-session-list");
            if (
                !screen.some(
                    (item) =>
                        item.text?.startsWith("Voice waveform,") &&
                        item.text.includes("new results"),
                )
            )
                throw new Error("The completed phone session must show its actual unread status.");
            await phone.screenshot("phone-home");
            cue("phone-enter", demo, phone);
            await demo.hold(1800);
            await phone.simulator.run("- tapOn:\n    text: Voice waveform, .*");
            cue("phone-session-open", demo, phone);
            await phone.simulator.run(
                "- scrollUntilVisible:\n    element:\n      id: diff-syntax-ready\n    direction: UP\n    timeout: 15000\n    centerElement: true",
            );
            await phone.simulator.run(
                "- swipe:\n    start: 50%, 65%\n    end: 50%, 30%\n    duration: 700",
            );
            await phone.inspect("concise-syntax-highlighted-diff");
            cue("phone-diff-visible", demo, phone);
            await demo.hold(4000);
            await phone.simulator.run("- tapOn:\n    text: Type a message ...");
            const keyboard = await phone.inspect("native-keyboard-visible");
            const keyboardStart = keyboard.findIndex(
                (item) => item.id === "UIKeyboardLayoutStar Preview",
            );
            if (keyboardStart < 0) throw new Error("The actual iPhone keyboard is missing.");
            const keys = keyboard.slice(keyboardStart);
            cue("phone-typing", demo, phone);
            // Tap the actual native keys, including their pressed/key-preview
            // states. Resolve their physical positions from iOS accessibility.
            const commands = keys.some((item) => item.text === "S")
                ? ["- tapOn:\n    id: shift"]
                : [];
            for (const character of "ship it") {
                const key = keys.find((item) =>
                    character === " "
                        ? item.id === "space"
                        : item.text?.toLowerCase() === character,
                );
                const rectangle = key?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
                if (!rectangle) throw new Error(`Native keyboard key is missing: ${character}`);
                const [, left, top, right, bottom] = rectangle.map(Number);
                commands.push(
                    `- tapOn:\n    point: ${Math.round((left + right) / 2)}, ${Math.round((top + bottom) / 2)}`,
                );
            }
            await phone.simulator.run(commands.join("\n"));
            await phone.inspect("native-ship-it-typed");
            await demo.hold(600);
            await phone.simulator.run("- tapOn:\n    text: Send\n    index: 0");
            cue("phone-sent", demo, phone);
            await until(
                demo,
                async () =>
                    JSON.stringify(await gym.client.getMessages(parent.id, { limit: 64 })).includes(
                        "Got it — the waveform change is ready to ship.",
                    ),
                "the actual phone send and acknowledgement",
            );
            await phone.inspect("phone-acknowledged");
            await demo.hold(1800);
            cue("phone-exit", demo, phone);
        }
        await demo.hold(2500);
        await demo.finish();
        // Separate honest still: completed edit and actual picker, after the movie ends.
        await demo.page.setViewportSize({ width: 720, height: 664 });
        await demo.page
            .getByText("waveformActive.ts", { exact: true })
            .first()
            .scrollIntoViewIfNeeded();
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first()
            .click();
        await demo.page
            .locator('[data-happy-desktop-ui="composer-model-control-row"]')
            .filter({ hasText: "Model" })
            .first()
            .click();
        await choices.filter({ hasText: "Fable 5.1" }).first().hover();
        await demo.page.screenshot({ path: join(output, "mobile-desktop-still.png") });
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
    },
    async evidence(page, gym) {
        return {
            fixture: {
                inference: "screenplay",
                collaborator:
                    "Fictional Steve, one explicit protocol-fixture identity; no draft synchronization",
                delivery: "steer",
                logic: "Small real waveform predicate and pre-wired call site, curated for a narrow phone diff",
                spawn: "Assistant announcement followed by real create_agent; no fabricated tool presentation",
            },
            framing,
            cues,
            health: await gym.client.getHealth(),
            agentId: recordedAgentId,
            steveMessageId,
            history: await gym.client.getMessages(recordedAgentId, { limit: 64 }),
            activity: await gym.client.getAgentActivity(recordedAgentId),
            finalVisibleText: await page.locator("body").innerText(),
        };
    },
};
