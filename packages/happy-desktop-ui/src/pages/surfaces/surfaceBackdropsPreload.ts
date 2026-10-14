import { todoBackdropDarkUrl, todoBackdropUrl } from "../../assets";

/**
 * The pictures a todo list is laid over, held for the life of the page. A
 * picture a live image element still holds stays decoded in the browser's
 * image cache, so the list's background paints in the same frame as the list.
 */
const held: HTMLImageElement[] = [];

/**
 * Fetches and decodes both todo list backgrounds, the light one and the dark
 * one, so opening a list — or switching appearance with one open — never
 * shows the bare surface first. Calling it again does nothing.
 */
export function happyAgentSurfaceBackdropsPreload(): void {
    if (held.length > 0) return;
    for (const url of [todoBackdropUrl, todoBackdropDarkUrl]) {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        // A picture that fails to load leaves the list on its plain surface.
        void image.decode().catch(() => undefined);
        held.push(image);
    }
}
