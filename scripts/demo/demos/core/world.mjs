import { readFile } from "node:fs/promises";
import { shipCommand } from "./shipping.mjs";
import { stevePhoneMessage } from "./protocol.mjs";

export const prompt =
    "Add a waveform to the voice agent that animates when speaking. Review control flow with Astra.";
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

// Gates are scoped by the session that reached them, so a stale agent from an
// earlier take can never consume the cue meant for the one being filmed. A
// release without a session opens that gate for every session.
const gates = new Map();
const reached = new Set();
const gateKey = (session, name) => `${session}:${name}`;
export function release(name, session) {
    for (const key of [...gates.keys()]) {
        const matches =
            session === undefined ? key.endsWith(`:${name}`) : key === gateKey(session, name);
        if (!matches) continue;
        gates.get(key)?.();
        gates.delete(key);
    }
}
export function hasReached(name, session) {
    return session === undefined
        ? [...reached].some((key) => key.endsWith(`:${name}`))
        : reached.has(gateKey(session, name));
}
export function close() {
    for (const key of [...gates.keys()]) {
        gates.get(key)?.();
        gates.delete(key);
    }
}
async function gate(session, name) {
    reached.add(gateKey(session, name));
    await new Promise((resolve) => gates.set(gateKey(session, name), resolve));
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
export const astraTask = "Astra · Review control flow";
export const shipGreeting = "Hi Steve, pushing to main. Waiting for CI to deploy.";
export const shipResult = "Deployed. The waveform is live.";
export const shipFailure = "The push did not go through. Leaving main untouched.";

// The daemon's own verdict on the ship command: the tool message that answers
// the Bash call, which it flags as an error and closes with the exit code.
function shipCommandFailed(messages) {
    const call = messages.findLastIndex(
        (message) =>
            message.role === "assistant" &&
            Array.isArray(message.content) &&
            message.content.some((block) => block.type === "tool_call" && block.name === "Bash"),
    );
    const result = messages[call + 1];
    if (call < 0 || result?.role !== "tool") return true;
    const output = (result.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    const exit = output.match(/exited with code (\d+)/u);
    return result.isError === true || (exit !== null && exit[1] !== "0");
}
export const completionText =
    "Waveform animates for either speaker while connected. Astra is reviewing the control flow.";

const fromSteve = (message) =>
    message.role === "user" &&
    (message.content === stevePhoneMessage ||
        (Array.isArray(message.content) &&
            message.content.some(
                (block) => block.type === "text" && block.text === stevePhoneMessage,
            )));

// The copy is a screenplay. Delegation, Read, Edit, and Bash are actual daemon
// tools; this isolated fixture does not claim that its inference called live vendors.
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
        if (input.includes(prompt))
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
    if (input.includes("CORE_ASTRA_REVIEW")) {
        emitted.set(key, step + 1);
        if (step === 0)
            return paced([
                tool("exec_command", {
                    cmd: `sed -n '1,40p' ${logicPath}`,
                    max_output_tokens: 2000,
                }),
            ]);
        // The review keeps running until the take releases it after the end,
        // so its report never adds a collaborator row to the filmed transcript.
        await gate(sessionId, "astra-running");
        return paced([
            text(
                "The waveform activates only while connected, for either speaker, and rests in silence. Connecting and error states cannot animate it. The timer and tap-to-end handler are unchanged.",
            ),
        ]);
    }
    if (messages.some(fromSteve)) {
        const shipKey = `${key}:ship`;
        const shipStep = emitted.get(shipKey) ?? 0;
        emitted.set(shipKey, shipStep + 1);
        // Steve's message arrives with Full access from the phone. The command
        // is real: the commit and push land in the gym's own bare origin and the
        // deploy run comes from the offline gh fixture on the gym's PATH.
        if (shipStep === 0)
            return paced(
                [
                    text(shipGreeting),
                    tool("Bash", {
                        command: shipCommand,
                        description: "Commit, push to main, and wait for the deploy run",
                        timeout: 120000,
                    }),
                ],
                // The greeting waits for the phone to settle back into the
                // shot; the command follows once the wave has landed.
                { delayMs: 2200, textDeltaDelayMs: 1400, toolCallDeltaDelayMs: 400 },
            );
        // The screenplay only claims a deploy the daemon actually reported.
        if (shipCommandFailed(messages))
            return paced([text(shipFailure)], { textDeltaDelayMs: 700, completionDelayMs: 800 });
        return paced([text(shipResult)], { textDeltaDelayMs: 700, completionDelayMs: 800 });
    }
    if (!input.includes(prompt)) return undefined;
    emitted.set(key, step + 1);
    if (step === 0)
        return paced(
            [
                { type: "thinking", thinking: "Checking the existing waveform and voice state." },
                tool("Read", { file_path: voicePath }),
            ],
            { thinkingDeltaChunkSize: 4096, thinkingDeltaDelayMs: 4000, toolCallDeltaDelayMs: 600 },
        );
    if (step === 1) {
        await gate(sessionId, "reading");
        return paced([tool("Read", { file_path: logicPath })]);
    }
    if (step === 2) {
        await gate(sessionId, "implementation");
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
    if (step === 3) {
        await gate(sessionId, "astra-launch");
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
    await gate(sessionId, "finishing");
    return paced([text(completionText)], { textDeltaDelayMs: 1200, completionDelayMs: 900 });
}
