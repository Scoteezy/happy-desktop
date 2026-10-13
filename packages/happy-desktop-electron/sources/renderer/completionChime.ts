import {
    happyAgentAttentionConnection,
    type HappyAgentAttentionSnapshot,
    type ProjectsVisibilitySnapshot,
} from "happy-desktop-state";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectorySnapshot } from "./happyAgentDirectoryStore";
import { happyAgentDirectoryNotifies } from "./happyAgentListed";

/**
 * Plays a short two-note completion chime. The oscillator keeps the sound local
 * and avoids shipping or decoding an asset for a sub-second desktop cue.
 */
export function completionChimePlay(): void {
    try {
        const AudioContextConstructor = window.AudioContext;
        const context = new AudioContextConstructor();
        const gain = context.createGain();
        gain.connect(context.destination);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);

        for (const [frequency, delay] of [
            [659.25, 0],
            [880, 0.11],
        ] as const) {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            oscillator.connect(gain);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.28);
        }
        window.setTimeout(() => void context.close(), 500);
    } catch {
        // A missing or policy-blocked audio device must not interrupt reconciliation.
    }
}

/**
 * Whether one finished top-level conversation should chime, by the person's
 * choices for its connection and for the bot it belongs to, if any.
 *
 * `focused` means the reader is looking at that connection right now: it is
 * the one selected in the rail and the window has focus. A muted or hidden
 * bot never chimes, whatever its connection says.
 */
export function completionChimeWanted(input: {
    readonly attention: HappyAgentAttentionSnapshot;
    readonly projectsVisibility: ProjectsVisibilitySnapshot;
    readonly directory: HappyAgentDirectorySnapshot;
    readonly happyAgentId: string;
    readonly sessionId: string;
    readonly windowFocused: boolean;
}): boolean {
    const sound = happyAgentAttentionConnection(
        input.attention,
        input.happyAgentId,
    ).completionSound;
    if (sound === "never") return false;
    if (sound === "focused") {
        const selected = input.directory.activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID;
        if (!input.windowFocused || selected !== input.happyAgentId) return false;
    }
    return happyAgentDirectoryNotifies(input.directory, input.projectsVisibility, input.attention, input.happyAgentId, input.sessionId);
}
