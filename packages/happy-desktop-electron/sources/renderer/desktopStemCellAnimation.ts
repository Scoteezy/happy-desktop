import type { StemCellAnimationDocument, StemCellAnimationPersistence } from "happy-desktop-state";

const STEM_CELL_ANIMATION_KEY = "happy.stem-cell-animation.v1";

/**
 * Where this machine remembers whether the reader turned off new work's icon
 * animation. It is the window's own storage, like the experiments switch: the
 * choice is about how this app draws, so it survives any Happy Agent going away.
 */
export function desktopStemCellAnimationPersistence(): StemCellAnimationPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(STEM_CELL_ANIMATION_KEY);
                return value ? (JSON.parse(value) as StemCellAnimationDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(STEM_CELL_ANIMATION_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still honours the choice for as long
                // as the window stays open.
            }
        },
    };
}
