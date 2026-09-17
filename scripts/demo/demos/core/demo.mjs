import * as world from "./world.mjs";
import { releaseCoordinatorName, releaseCoordinatorPrepare } from "./bots.mjs";
import { coreProtocolOpen, steve, stevePhoneMessage } from "./protocol.mjs";
import { shipCommand, shippingPrepare, shippingVerify } from "./shipping.mjs";
import { execFile as exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(exec);

/** The whole app, delivered as one static window: a narrow sidebar beside a compact main pane. */
const viewport = { width: 780, height: 664 };

let recordedAgentId;
let framing;
let shippingFixture;
let shippingEvidence;
let releaseCoordinator;
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

const settled = (locator) =>
    locator.evaluate((element) =>
        element
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== "running"),
    );

export default {
    id: "core",
    title: "One conversation, shared work",
    subtitle: "One conversation, shared work",
    transitions: "none",
    rawWindow: true,
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: coreProtocolOpen,
    phoneFrame: {
        frame: "assets/device/iphone-16-pro-black.png",
        alpha: "assets/device/screen-alpha.png",
        framing:
            "Apple iPhone 16 Pro Black Titanium frame via Device Mockups; original 1406×2822 geometry",
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
        releaseCoordinator = await releaseCoordinatorPrepare(gym);
        // These are only prior takes in this private fixture project. Preserve
        // its explicitly declared background workspaces and archive rehearsals.
        const { workspaces } = await gym.client.listWorkspaces({
            projectId: gym.world.projectId,
            limit: 50,
        });
        for (const workspace of workspaces) {
            if (workspace.id === gym.world.projectId || world.worktrees.includes(workspace.name))
                continue;
            // A crashed rehearsal can leave its agents mid-turn; archiving an
            // agent aborts its run, so a stale take cannot consume this one's cues.
            for (const agent of workspace.agents ?? []) {
                if (agent.archived) continue;
                await gym.client.archiveAgent(agent.id).catch(() => undefined);
            }
            // Preserve the old take under its unique identity before archiving.
            // Archived names stay reserved, so leaving the generated name on
            // a rehearsal would add a numeric suffix to the next filmed take.
            const { workspace: previous } = await gym.client.getWorkspace(workspace.id);
            const { workspace: current } = await gym.client.renameWorkspace(
                workspace.id,
                { name: `take-${workspace.id}` },
                { ifMatch: previous.version },
            );
            await gym.client.archiveWorkspace(workspace.id, { ifMatch: current.version });
        }
        shippingFixture = await shippingPrepare(gym, {
            path: world.logicPath,
            before: world.logicBefore,
            after: world.logicAfter,
        });
        await demo.page.setViewportSize(viewport);
        await demo.page.locator('[data-happy-desktop-ui="sidebar"]').waitFor();
        await demo.page.getByText(releaseCoordinatorName, { exact: true }).first().waitFor();
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
        // The real sidebar splitter, taken to the product's own minimum width.
        const splitter = demo.page.getByRole("separator", { name: "Resize sidebar", exact: true });
        await splitter.focus();
        await demo.page.keyboard.press("Home");
        await demo.page.waitForTimeout(400);
        const sidebarWidth = (
            await demo.page.locator('[data-happy-desktop-ui="sidebar"]').boundingBox()
        ).width;
        if (sidebarWidth !== Number(await splitter.getAttribute("aria-valuemin")))
            throw new Error("The sidebar is not at the product's minimum width.");
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
            { rawWindow: true },
        );
        framing.sidebarWidth = sidebarWidth;
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        if (phone) {
            // Apple's own recording status bar; a relaunched Simulator forgets it.
            await execFile("xcrun", [
                "simctl",
                "status_bar",
                phone.simulator.udid,
                "override",
                "--time",
                "9:41",
                "--dataNetwork",
                "wifi",
                "--wifiMode",
                "active",
                "--wifiBars",
                "3",
                "--batteryState",
                "charged",
                "--batteryLevel",
                "100",
            ]);
            await phone.prepare({ sessionTitle: "New chat", relaunch: true });
            if (
                (await phone.inspect("home-before-preparation")).some((item) =>
                    /What's new/i.test(item.text ?? ""),
                )
            ) {
                await phone.simulator.run("- tapOn:\n    text: .*What's new.*");
                await demo.page.waitForTimeout(1300);
                await phone.simulator.run("- tapOn:\n    point: 38, 88");
                await phone.prepare({ sessionTitle: "New chat" });
            }
            if (
                (await phone.inspect("home-changelog-read")).some((item) =>
                    /What's new/i.test(item.text ?? ""),
                )
            )
                throw new Error("Dismiss What's New normally before recording the session list.");
            if ((await gym.client.getHappyIntegration()).integration.status !== "connected")
                throw new Error("The phone is not connected to this actual demo daemon.");
            // Configure this private session's native composer before any work
            // arrives, then return home. Later results genuinely become unread.
            // The composer mirrors the session's latest mode. Both messages
            // must stay in Auto; no permission-menu interaction is filmed.
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
            // The chip's accessibility label names the control, not its value;
            // the message's own mode is asserted once Steve's message arrives.
            await phone.inspect("phone-configured");
            await phone.screenshot("phone-configured");
            await phone.simulator.run("- tapOn:\n    point: 38, 88");
            await phone.prepare();
            if (
                !(await phone.inspect("release-coordinator-on-phone")).some((item) =>
                    item.text?.startsWith(`${releaseCoordinatorName},`),
                )
            )
                throw new Error("The real Release Coordinator bot is missing from the phone.");
            await phone.start();
        }
        await demo.hold(1600);
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
        const { agent } = await gym.client.getAgent(parent.id);
        await demo.pointerVisible(false);
        cue("work-started", demo, phone);
        // Reasoning details are intentionally collapsed/hidden by preference;
        // the authoritative run-status footer still shows Thinking.
        await demo.page.getByText("Thinking", { exact: true }).first().waitFor();
        cue("thinking-visible", demo, phone);
        await until(
            demo,
            async () => {
                const { workspace } = await gym.client.getWorkspace(agent.workspaceId);
                return workspace.name === world.workspaceSlug;
            },
            "the automatic workspace name",
        );
        cue("workspace-named", demo, phone);
        await until(demo, () => world.hasReached("reading", parent.id), "the first file read");
        cue("first-read-visible", demo, phone);
        await demo.hold(1000);
        world.release("reading", parent.id);
        await until(
            demo,
            () => world.hasReached("implementation", parent.id),
            "the second file read",
        );
        await demo.hold(900);
        world.release("implementation", parent.id);
        await until(demo, () => world.hasReached("astra-launch", parent.id), "the file edit");
        cue("logic-edited", demo, phone);
        // The edit is real: the daemon's own Git read model must see exactly
        // this one changed file, which is what the sidebar counters show.
        await until(
            demo,
            async () => {
                const { git } = await gym.client.getWorkspaceGit(agent.workspaceId);
                if (
                    git.changedFiles > 1 ||
                    (git.files ?? []).some((f) => f.path !== world.logicPath)
                )
                    throw new Error(
                        `Unexpected changes in the checkout: ${JSON.stringify(git.files)}`,
                    );
                return git.changedFiles === 1;
            },
            "the edit to reach the checkout's Git state",
            15000,
        );
        await demo.hold(1600);
        world.release("astra-launch", parent.id);
        await until(demo, () => world.hasReached("finishing", parent.id), "Astra’s delegation");
        const spawned = demo.page.getByText(/Astra.*sub-agent/u).first();
        await spawned.waitFor();
        await until(demo, () => settled(spawned), "the complete, visibly typed Astra spawn label");
        cue("astra-spawned", demo, phone);
        await demo.hold(2800);
        world.release("finishing", parent.id);
        await demo.page.getByText(world.completionText.slice(0, 48)).first().waitFor();
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(parent.id, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed first turn",
        );
        cue("response-settled", demo, phone);
        await demo.hold(3000);
        let phoneHome = Promise.resolve();
        if (phone) {
            const screen = await phone.inspect("completed-unread-session-list");
            if (
                !screen.some(
                    (item) =>
                        item.text?.startsWith(`${world.sessionTitle},`) &&
                        item.text.includes("new results"),
                )
            )
                throw new Error("The completed phone session must show its actual unread status.");
            await phone.screenshot("phone-home");
            cue("phone-enter", demo, phone);
            await demo.hold(2200);
            await phone.simulator.run(`- tapOn:\n    text: ${world.sessionTitle}, .*`);
            cue("phone-session-open", demo, phone);
            await phone.simulator.run(
                "- scrollUntilVisible:\n    element:\n      id: diff-syntax-ready\n    direction: UP\n    timeout: 15000\n    centerElement: true",
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
            const characters = [
                ...(keys.some((item) => item.text === "S") ? ["shift"] : []),
                ...stevePhoneMessage,
            ];
            const points = characters.map((character) => {
                const key = keys.find((item) =>
                    character === "shift"
                        ? item.id === "shift"
                        : character === " "
                          ? item.id === "space"
                          : item.text?.toLowerCase() === character,
                );
                const rectangle = key?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
                if (!rectangle) throw new Error(`Native keyboard key is missing: ${character}`);
                const [, left, top, right, bottom] = rectangle.map(Number);
                return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
            });
            const taps = await phone.simulator.tapPoints(points);
            await writeFile(join(output, "native-key-taps.json"), JSON.stringify(taps, null, 2));
            const typed = await phone.inspect("native-ship-it-typed");
            if (!typed.some((item) => item.text === stevePhoneMessage))
                throw new Error("The native keyboard did not type the exact requested message.");
            const sendBounds = typed
                .find((item) => item.text === "Send")
                ?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
            if (!sendBounds) throw new Error("The actual native Send control is missing.");
            const [, sendLeft, sendTop, sendRight, sendBottom] = sendBounds.map(Number);
            await phone.simulator.tapPoints([
                {
                    x: Math.round((sendLeft + sendRight) / 2),
                    y: Math.round((sendTop + sendBottom) / 2),
                },
            ]);
            cue("phone-sent", demo, phone);
            await demo.hold(500);
            // Steve returns to the session list; the parked phone shows the
            // session working, not the keyboard. The list is verified while
            // the desktop carries on, so the reply's timing stays on camera.
            await phone.simulator.run("- tapOn:\n    point: 38, 88");
            cue("phone-exit", demo, phone);
            phoneHome = phone.prepare({ sessionTitle: world.sessionTitle });
            phoneHome.catch(() => undefined);
        } else {
            await gym.client.sendMessage(parent.id, {
                text: stevePhoneMessage,
                mode: { ...world.fableMode, permissionMode: "auto" },
            });
        }
        // Steve's message and the reply land on the desktop.
        await demo.page.getByText(steve.name, { exact: true }).first().waitFor({ timeout: 15000 });
        cue("steve-message-visible", demo, phone);
        const steveMessage = (await gym.client.getMessages(parent.id, { limit: 64 })).runs
            .flatMap((run) => run.messages)
            .findLast((message) => message.role === "user");
        if (steveMessage?.mode?.permissionMode !== "auto")
            throw new Error("Steve's phone message must stay in Auto.");
        const greeting = demo.page.getByText(world.shipGreeting.slice(0, 32)).first();
        await greeting.waitFor({ timeout: 20000 });
        await until(demo, () => settled(greeting), "the greeting to finish arriving");
        cue("greeting", demo, phone);
        // The Bash process runs the declared offline Git/CI screenplay in the
        // normal Auto sandbox. It never pushes or edits Git control files.
        const shell = demo.page
            .locator('[data-happy-desktop-ui="agent-activity-call"][data-status="running"]')
            .filter({ hasText: "Bash" })
            .last();
        await shell.waitFor({ timeout: 20000 });
        cue("ship-running", demo, phone);
        await until(demo, () => world.hasReached("astra-running"), "Astra's review");
        world.release("astra-running");
        await until(
            demo,
            async () => {
                const { subagents } = await gym.client.getAgentActivity(parent.id);
                return (
                    subagents.length > 0 &&
                    subagents.every(
                        (child) =>
                            child.status === "idle" &&
                            child.subagents.running === 0 &&
                            child.processes.running === 0,
                    )
                );
            },
            "Astra's completed review",
        );
        cue("astra-completed", demo, phone);
        await until(
            demo,
            async () =>
                (await gym.client.getWorkspaceGit(agent.workspaceId)).git.changedFiles === 0,
            "the staged fixture checkout to read clean",
            60000,
        );
        cue("changes-cleared", demo, phone);
        await until(
            demo,
            () => world.hasReached("review-finished", parent.id),
            "the completed shipping command",
        );
        world.release("review-finished", parent.id);
        const deployed = demo.page.getByText(world.shipResult.slice(0, 24)).first();
        await deployed.waitFor({ timeout: 60000 });
        await until(demo, () => settled(deployed), "the deploy result to finish arriving");
        cue("deployed", demo, phone);
        demo.confetti({ duration: 3200 });
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(parent.id, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed shipping turn",
        );
        await until(
            demo,
            async () =>
                !(await demo.page.getByText("Working in subagents", { exact: true }).count()),
            "the completed collaborator status to reach the UI",
        );
        await demo.hold(3600);
        cue("end", demo, phone);
        await phoneHome;
        await demo.finish();
        // Off camera: check what the command did; Astra already completed on camera.
        shippingEvidence = await shippingVerify(gym, agent.workspaceId, {
            origin: shippingFixture.origin,
            baseline: shippingFixture.baseline,
            path: world.logicPath,
            before: world.logicBefore,
        });
        await writeFile(
            join(output, "shipping-verified.json"),
            JSON.stringify(shippingEvidence, null, 2),
        );
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
    },
    async evidence(page, gym) {
        return {
            fixture: {
                inference: "screenplay",
                collaborator:
                    "Fictional Steve, one explicit protocol-fixture identity attached to the real message typed on the paired phone",
                logic: "Small real waveform predicate and pre-wired call site, curated for a narrow phone diff",
                spawn: "Real create_agent; Astra's review completes during shipping, before Deployed. The take asserts the actual child is idle and the UI no longer shows Working in subagents.",
                shipping:
                    "Auto throughout. The Bash process executes offline Git and gh screenplay fixtures. The simulated push restores only the prepared waveform file to its baseline, so the real Git watcher clears the counters. No real commit, push, deployment, or permission-review verdict.",
                shipCommand,
            },
            framing,
            releaseCoordinator: {
                id: releaseCoordinator.id,
                agentId: releaseCoordinator.agent.id,
                name: releaseCoordinator.name,
                avatar: releaseCoordinator.avatar,
                source: "DiceBear Adventurer Neutral, Celia; user-selected image",
            },
            viewport,
            cues,
            shipping: shippingEvidence,
            health: await gym.client.getHealth(),
            agentId: recordedAgentId,
            history: await gym.client.getMessages(recordedAgentId, { limit: 64 }),
            activity: await gym.client.getAgentActivity(recordedAgentId),
            finalVisibleText: await page.locator("body").innerText(),
        };
    },
};
