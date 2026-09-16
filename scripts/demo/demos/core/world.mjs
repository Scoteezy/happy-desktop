import { readFile } from "node:fs/promises";

export const prompt =
    "Add a waveform to the voice agent that animates when speaking. Review control flow with Astra.";
export const stevePrompt =
    "Find a recent GPT-duplex product demo that blew up on X with a Grok sub-agent.";
export const voicePath = "packages/happy-app/sources/components/VoiceAssistantStatusBar.tsx";
export const barsPath = "packages/happy-app/sources/components/VoiceBars.tsx";
export const logicPath = "packages/happy-app/sources/realtime/waveformActive.ts";
export const logicBefore = `export function waveformActive(
    connected: boolean,
    agentSpeaking: boolean,
    userSpeaking: boolean,
): boolean {
    return false;
}
`;
export const logicAfter = `export function waveformActive(
    connected: boolean,
    agentSpeaking: boolean,
    userSpeaking: boolean,
): boolean {
    return connected && (
        agentSpeaking || userSpeaking
    );
}
`;
export const id = "core";
export const seedMode = {
    effort: "high",
    modelId: "openai/gpt-6-astra",
    permissionMode: "workspace_write",
    providerId: "codex",
    serviceTier: null,
};
export const fableMode = {
    ...seedMode,
    effort: "xhigh",
    modelId: "anthropic/fable-5-1",
    providerId: "claude",
};
const asset = (name) => `demos/core/assets/${name}`;
const source = (name) => readFile(new URL(`./assets/${name}`, import.meta.url), "utf8");
const voiceSource = (await source("VoiceAssistantStatusBar.tsx.txt"))
    .replace(
        "import { VoiceBars }",
        "import { waveformActive } from '@/realtime/waveformActive';\nimport { VoiceBars }",
    )
    .replace(
        "const isVoiceSpeaking = realtimeMode === 'agent-speaking' || realtimeMode === 'user-speaking';",
        `const isVoiceSpeaking = waveformActive(
        realtimeStatus === 'connected',
        realtimeMode === 'agent-speaking',
        realtimeMode === 'user-speaking',
    );`,
    )
    .replace(
        `<Ionicons name="mic" size={24} color="#FFFFFF" />`,
        `<VoiceBars isActive={isVoiceSpeaking} color="#FFFFFF" size="medium" />`,
    );

// Read-only machine preferences and the current enabled catalog supplied these six
// routes. The old Fable/Sonnet entries and duplicate Claude account are not staged.
export const models = {
    codex: ["openai/gpt-6-astra", "openai/gpt-5.6-sol", "openai/gpt-5.6-luna"],
    claude: ["anthropic/fable-5-1", "anthropic/opus-5"],
    grok: ["xai/grok-4.6"],
};

export const repository = {
    name: "happy",
    avatar: asset("happy.png"),
    files: {
        "README.md": "# Happy\n\nRemote access to your coding agents.\n",
        [voicePath]: voiceSource,
        [barsPath]: await source("VoiceBars.tsx.txt"),
        [logicPath]: logicBefore,
    },
};
export const backgroundRepositories = [
    {
        name: "happy-desktop",
        avatar: asset("happy-desktop.png"),
        files: {
            "README.md":
                "# Happy Desktop\n\nProjects, workspaces, and conversations in one place.\n",
        },
    },
    {
        name: "travel-vibes",
        avatar: asset("travel-vibes.png"),
        files: {
            "README.md": "# Travel Vibes\n\nA visual trip planner.\n",
            "notes/kyoto.md":
                "# Kyoto\n\nThree quiet days, a morning market, and a walk along the river.\n",
        },
        dirtyFiles: {
            "notes/kyoto.md":
                "# Kyoto\n\nThree quiet days, a morning market, and a walk along the river.\n\nAdd a day in Naoshima.\n",
        },
    },
    {
        name: "bra1nDump",
        avatar: asset("bra1nDump.png"),
        files: { "README.md": "# bra1nDump\n\nNotes, projects, and things worth remembering.\n" },
        dirtyFiles: {
            "notes/voice-interfaces.md":
                "# Voice interfaces\n\nMake the speaking state visible without interrupting the conversation.\n",
        },
    },
];
export const worktrees = ["voice-routing", "message-list"];
export const sessions = [
    {
        id: "routing",
        worktree: "voice-routing",
        title: "Keep voice on the active session",
        recap: "One session identity for voice routing.",
        turns: [
            {
                user: "Check how voice follows the session I’m looking at.",
                response: {
                    text: "Voice tools use the active session ID. Opening another session updates that same routing state, so the next voice action follows the conversation you’re looking at.\n\nThe header and sidebar both read the existing speaking state. There’s no second voice session to keep in sync.",
                },
            },
        ],
    },
    {
        id: "lists",
        worktree: "message-list",
        title: "Preserve scroll while messages arrive",
        recap: "Keep the current message anchored during updates.",
        turns: [
            {
                user: "How should the message list behave when new replies arrive?",
                response: {
                    text: "If you’re at the bottom, follow the new reply. If you’ve scrolled up, keep the same message under your eyes.\n\nStable message IDs preserve selection and local state across updates. Only the visible rows need to be mounted.",
                },
            },
        ],
    },
    {
        id: "travel",
        project: "travel-vibes",
        title: "A slower week in Japan",
        recap: "Kyoto, a morning market, and a day in Naoshima.",
        turns: [
            {
                user: "Make the Japan itinerary feel less rushed. Keep Kyoto and add a day in Naoshima.",
                response: {
                    text: "Give Kyoto three quiet days, leave one morning open for the market, and take the ferry to Naoshima for a full day. Keep the arrival evening free instead of adding another stop.",
                },
            },
        ],
    },
    {
        id: "notes",
        project: "bra1nDump",
        title: "Turn voice notes into a plan",
        recap: "Keep the next action small enough to start today.",
        turns: [
            {
                user: "Pull the next useful step out of my voice-interface notes.",
                response: {
                    text: "Make the speaking state visible without interrupting the conversation. Reuse the existing voice bars, reserve their space while silent, and leave the call timer and tap-to-end action alone.",
                },
            },
        ],
    },
];
export function turnFind(text) {
    for (const session of sessions)
        for (const turn of session.turns) if (text.includes(turn.user)) return { session, turn };
    return undefined;
}

const gates = new Map();
const reached = new Set();
export function release(name) {
    gates.get(name)?.();
    gates.delete(name);
}
export function hasReached(name) {
    return reached.has(name);
}
export function close() {
    for (const name of gates.keys()) release(name);
}
async function gate(name) {
    reached.add(name);
    await new Promise((resolve) => gates.set(name, resolve));
}
const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
const paced = (content, timing = {}) => ({
    content,
    // Complete, readable blocks. Deliberate director holds separate concepts;
    // constant token motion should not consume the viewer's attention budget.
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 300,
    toolCallDeltaDelayMs: 350,
    completionDelayMs: 100,
    ...timing,
});
export const grokTask = "Grok · Research X";
export const astraTask = "Astra · Review control flow";
export const grokFinding =
    "Found OpenAI’s live voice demo: listening while speaking. [Watch the demo on X](https://x.com/OpenAIDevs/status/2098099269551149398).";
export const shipResult = "Pushed to main. New version is being deployed.";
export const firstWorkText = "I’ll reuse the voice bars and ask Astra to review.";
let shippingFinalize;
export function shippingConfigure(finalize) {
    shippingFinalize = finalize;
}

// The copy is a screenplay. Delegation, Read, and Edit are actual daemon tools;
// this isolated fixture does not claim that its inference called live vendors.
export async function reply(payload, emitted) {
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const input = messages
        .filter((message) => message.role === "user" || message.role === "agent")
        .map((message) =>
            typeof message.content === "string"
                ? message.content
                : message.content
                      ?.filter((block) => block.type === "text")
                      .map((block) => block.text)
                      .join("\n"),
        )
        .join("\n");
    if (payload.options?.intent === "compaction") return undefined;
    if (sessionId.endsWith(":title")) {
        if (input.includes(prompt) || input.includes(stevePrompt))
            return {
                content: [
                    text(
                        "<title>Voice waveform</title>\n<recap>Restore the speaking indicator and review the control flow.</recap>",
                    ),
                ],
            };
        return undefined;
    }
    const key = `core:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    if (input.includes("CORE_GROK_RESEARCH")) {
        emitted.set(key, step + 1);
        await gate("grok-running");
        return paced([text(grokFinding)]);
    }
    if (input.includes("CORE_ASTRA_REVIEW")) {
        emitted.set(key, step + 1);
        if (step === 0)
            return paced([
                tool("exec_command", {
                    cmd: `sed -n '1,40p' ${logicPath}`,
                    max_output_tokens: 2000,
                }),
            ]);
        await gate("astra-running");
        return paced([
            text(
                "The waveform activates only while connected, for either speaker, and rests in silence. Connecting and error states cannot animate it. The timer and tap-to-end handler are unchanged.",
            ),
        ]);
    }
    if (
        messages.some(
            (message) =>
                message.role === "user" &&
                (message.content === "ship it" ||
                    (Array.isArray(message.content) &&
                        message.content.some(
                            (block) => block.type === "text" && block.text === "ship it",
                        ))),
        )
    ) {
        if (!shippingFinalize) throw new Error("Prepare the staged shipping fixture first.");
        // The user explicitly permits this shipping/deployment screenplay.
        // No permission-review verdict, Git push, or production deploy is faked
        // into a tool result. Only the owned fixture's edit is restored, then
        // the real Git watcher and encrypted phone projection must reconcile.
        await shippingFinalize();
        return paced([{ type: "thinking", thinking: "Preparing the release." }, text(shipResult)], {
            thinkingDeltaChunkSize: 4096,
            thinkingDeltaDelayMs: 1800,
        });
    }
    if (!input.includes(prompt)) return undefined;
    emitted.set(key, step + 1);
    if (step === 0)
        return paced(
            [
                { type: "thinking", thinking: "Checking the existing waveform and voice state." },
                text(firstWorkText),
                tool("Read", { file_path: voicePath }),
            ],
            { thinkingDeltaChunkSize: 4096, thinkingDeltaDelayMs: 4000, textDeltaDelayMs: 2200 },
        );
    if (step === 1) {
        await gate("reading");
        return paced([tool("Read", { file_path: logicPath })]);
    }
    if (step === 2) {
        await gate("delegation");
        return paced([
            text("On it, Steve. Grok will research X while I make the change."),
            tool("create_agent", {
                title: grokTask,
                model: "xai/grok-4.6",
                provider: "grok",
                effort: "high",
                text: `CORE_GROK_RESEARCH\n${stevePrompt}`,
            }),
        ]);
    }
    if (step === 3) {
        await gate("implementation");
        return paced(
            [
                tool("Edit", {
                    file_path: logicPath,
                    old_string: "    return false;",
                    new_string:
                        "    return connected && (\n        agentSpeaking || userSpeaking\n    );",
                }),
            ],
            { toolCallDeltaDelayMs: 350 },
        );
    }
    if (step === 4) {
        await gate("astra-launch");
        return paced([
            tool("create_agent", {
                title: astraTask,
                model: "openai/gpt-6-astra",
                provider: "codex",
                effort: "high",
                text: `CORE_ASTRA_REVIEW\nReview ${logicPath} and its existing caller in ${voicePath}. Check speaking and idle behavior, connecting and error states. Do not edit.`,
            }),
        ]);
    }
    if (step === 5) {
        await gate("finishing");
        return paced(
            [
                text(
                    `Waveform added for either speaker. Astra reviewed the control flow.\n\nGrok’s research is done. ${grokFinding}`,
                ),
            ],
            { textDeltaDelayMs: 1600 },
        );
    }
    return paced([text("Ready to ship.")], { completionDelayMs: 1200 });
}
