import { haptic, type HapticSignal } from "./haptics";
import type { StoryHapticMoment } from "./storyTypes";

/**
 * The haptic every client plays at each Stories moment, from the API's table.
 * iOS names system feedback; here each moment maps to the nearest signal this
 * window has, which today plays nothing on macOS (see `haptics.ts`). A host
 * that can reach the trackpad's actuator installs a player with
 * `storyHapticPlayerSet` and receives the moment itself, so it can choose its
 * own pattern for each one.
 */
const SIGNALS: Record<StoryHapticMoment | "error", HapticSignal> = {
    "story.open": "impact",
    "story.advance": "selection",
    "story.post": "impact",
    "story.delete": "impact",
    "story.react": "impact",
    "sticker.drop": "impact",
    "overlay.snap": "selection",
    "overlay.trash": "impact",
    error: "impact",
};

let player: ((moment: StoryHapticMoment | "error") => void) | undefined;

/** Installs the host's own haptic player, or removes it with `undefined`. */
export function storyHapticPlayerSet(
    next: ((moment: StoryHapticMoment | "error") => void) | undefined,
) {
    player = next;
}

/** Plays a Stories moment where the hardware can; silent everywhere else. */
export function storyHaptic(moment: StoryHapticMoment | "error"): void {
    if (player) {
        try {
            player(moment);
        } catch {
            // A host that cannot play right now is the "not supported" case.
        }
        return;
    }
    haptic(SIGNALS[moment]);
}
