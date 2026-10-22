import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
    customThemeEmpty,
    customThemeEqual,
    customThemeParse,
    type CustomTheme,
} from "happy-desktop-state";

/** Where the custom theme lives: beside config.json, edited by hand or by an agent. */
export function desktopCustomThemePath(homeDirectory = homedir()): string {
    return join(homeDirectory, ".happy", "desktop", "theme.json");
}

/** How long a burst of writes settles before the file is read again. */
const SETTLE_MS = 80;

/**
 * Owns the custom theme document and follows it while the app runs, so a
 * change an agent writes reaches the window without a restart.
 *
 * The theme is kept apart from config.json on purpose: that document is
 * validated whole, and one mistyped colour must not reset every other
 * preference. A missing file is the empty theme; an unreadable or invalid one
 * keeps the last good theme on screen, and the reason it was refused is written
 * to theme.error.txt beside it — the one place the agent that wrote it can look.
 * That file is removed again as soon as a theme is accepted.
 */
export class DesktopCustomThemeStore {
    private watcher: FSWatcher | undefined;
    private settle: NodeJS.Timeout | undefined;
    private readonly listeners = new Set<(theme: CustomTheme) => void>();

    private constructor(
        private readonly path: string,
        private value: CustomTheme,
        private readonly report: (message: string) => void,
    ) {}

    static async create(
        path: string,
        report: (message: string) => void,
    ): Promise<DesktopCustomThemeStore> {
        const store = new DesktopCustomThemeStore(path, customThemeEmpty, report);
        await store.reload();
        return store;
    }

    get(): CustomTheme {
        return this.value;
    }

    subscribe(listener: (theme: CustomTheme) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Watches the directory rather than the file: an atomic replacement swaps
     * the file's inode, which ends a watch held on the file itself.
     */
    async watch(): Promise<void> {
        if (this.watcher) return;
        await mkdir(dirname(this.path), { mode: 0o700, recursive: true });
        const name = basename(this.path);
        this.watcher = watch(dirname(this.path), (_event, file) => {
            if (file !== null && file !== name) return;
            clearTimeout(this.settle);
            this.settle = setTimeout(() => void this.reload(), SETTLE_MS);
        });
        this.watcher.on("error", (error) => this.report(`Theme watch failed: ${error.message}`));
    }

    close(): void {
        clearTimeout(this.settle);
        this.watcher?.close();
        this.watcher = undefined;
    }

    private async reload(): Promise<void> {
        const next = await this.read();
        if (next === undefined) return;
        await unlink(this.errorPath()).catch(() => undefined);
        if (customThemeEqual(next, this.value)) return;
        this.value = next;
        for (const listener of this.listeners) listener(next);
    }

    private async read(): Promise<CustomTheme | undefined> {
        let text: string;
        try {
            text = await readFile(this.path, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return customThemeEmpty;
            return this.refuse(`Could not read ${this.path}: ${String(error)}`);
        }
        let document: unknown;
        try {
            document = JSON.parse(text);
        } catch {
            return this.refuse(`${this.path} is not valid JSON.`);
        }
        const parsed = customThemeParse(document);
        if (!parsed.ok) return this.refuse(parsed.error);
        return parsed.theme;
    }

    private async refuse(reason: string): Promise<undefined> {
        this.report(`Custom theme refused: ${reason}`);
        await writeFile(
            this.errorPath(),
            `theme.json was refused, so the previous theme stays on screen.\n${reason}\n`,
        ).catch(() => undefined);
        return undefined;
    }

    private errorPath(): string {
        return join(dirname(this.path), "theme.error.txt");
    }
}
