import { randomBytes } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { customThemeParse } from "happy-desktop-state/customTheme";
import type {
    DesktopAppearanceMode,
    DesktopConfig,
    DesktopDefaultModel,
    DesktopKeepAwakeMode,
    DesktopLinkOpenPlacement,
    DesktopModelIdentity,
    DesktopModelPreference,
    DesktopPermissionMode,
    DesktopScrollbarVisibility,
} from "../shared/desktopContract";

const MAXIMUM_MODEL_PREFERENCES = 1_000;
const MAXIMUM_VALUE_LENGTH = 500;
const SETTLE_MS = 80;
const CONFIG_FIELDS = [
    "appearance",
    "customTheme",
    "defaultEffort",
    "defaultModel",
    "defaultPermissionMode",
    "keepAwake",
    "lastPickedModel",
    "linkOpen",
    "modelPreferences",
    "previewUpdatesEnabled",
    "scrollbarVisibility",
    "titleShimmerEnabled",
    "version",
] as const satisfies readonly (keyof DesktopConfig)[];
const EXPECTED: Record<keyof DesktopConfig, string> = {
    appearance: '"system", "light", "dark", "midnight", or "custom"',
    customTheme: "an object with base and colors",
    defaultEffort: "a nonempty string of at most 500 characters",
    defaultModel:
        "an object with nonempty providerId/modelId strings and optional effort string (at most 500 characters each)",
    defaultPermissionMode: '"auto", "workspace_write", "read_only", or "full_access"',
    keepAwake: '"on", "agent", or "off"',
    lastPickedModel: "an object with nonempty providerId/modelId strings of at most 500 characters",
    linkOpen: '"panel" or "browser"',
    modelPreferences:
        "at most 1000 uniquely provider/model-qualified entries, with lastSpeed string or null and optional lastEffort string (nonempty strings, at most 500 characters)",
    previewUpdatesEnabled: "a boolean",
    scrollbarVisibility: '"always" or "automatic"',
    titleShimmerEnabled: "a boolean",
    version: "1",
};

export const desktopConfigEmpty: DesktopConfig = {
    appearance: "system",
    defaultEffort: "medium",
    defaultPermissionMode: "auto",
    modelPreferences: [],
    scrollbarVisibility: "automatic",
    version: 1,
};

export function desktopConfigPath(homeDirectory = homedir()): string {
    return join(homeDirectory, ".happy", "desktop", "config.json");
}

/** One owner for the document: file reads, app writes, and notifications share a queue. */
export class DesktopConfigStore {
    private operation = Promise.resolve();
    private value: DesktopConfig = desktopConfigEmpty;
    private watcher: FSWatcher | undefined;
    private settle: NodeJS.Timeout | undefined;
    private closed = false;
    private readonly listeners = new Set<(config: DesktopConfig) => void>();
    private lastDiagnostic = "";

    private constructor(
        private readonly path: string,
        private readonly report: (message: string) => void,
    ) {}

    static async create(
        path: string,
        report: (message: string) => void = console.error,
    ): Promise<DesktopConfigStore> {
        const store = new DesktopConfigStore(path, report);
        await mkdir(dirname(path), { mode: 0o700, recursive: true });
        // A directory watch survives atomic replacement. Install it BEFORE the
        // first read: changes during startup must schedule another queued read.
        store.watcher = watch(dirname(path), (_event, name) => {
            if (name !== null && name !== basename(path)) return;
            clearTimeout(store.settle);
            store.settle = setTimeout(() => {
                void store
                    .enqueue(() => store.reload())
                    .catch((error: unknown) =>
                        report(`Desktop config reload failed: ${String(error)}`),
                    );
            }, SETTLE_MS);
            store.settle.unref();
        });
        store.watcher.unref();
        store.watcher.on("error", (error) =>
            report(`Desktop config watch failed: ${error.message}`),
        );
        await store.enqueue(() => store.reload());
        return store;
    }

    get(): DesktopConfig {
        return this.value;
    }

    flush(): Promise<void> {
        return this.operation;
    }

    subscribe(listener: (config: DesktopConfig) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Legacy callers still merge against the value they last read from this store. */
    write(candidate: unknown): Promise<void> {
        return this.update(this.value, candidate);
    }

    /** Explicit before/after snapshots identify intent even if a watcher read raced the IPC. */
    update(previousCandidate: unknown, nextCandidate: unknown): Promise<void> {
        const previous = desktopConfigValidate(previousCandidate);
        const next = desktopConfigValidate(nextCandidate);
        return this.enqueue(async () => {
            if (same(previous, next)) return;
            // Retrying a changed source preserves edits made while the temporary
            // file was being written. rename has no CAS against arbitrary external
            // writers in the final check/rename gap; agents should serialize edits.
            for (let attempt = 0; attempt < 8; attempt++) {
                const source = await documentRead(this.path);
                const parsed = desktopConfigParse(source.document, this.value);
                await this.accept(parsed);
                if (!parsed.mergeable)
                    throw new Error(
                        "Desktop config cannot be safely merged; correct config.json first.",
                    );
                const merged = configMerge(source.document, previous, next);
                const temporary = `${this.path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
                try {
                    await writeFile(temporary, `${JSON.stringify(merged, undefined, 2)}\n`, {
                        flag: "wx",
                        mode: 0o600,
                    });
                    if ((await documentTextRead(this.path)) !== source.text) continue;
                    await rename(temporary, this.path);
                    // Re-read, rather than publishing our own candidate: an agent
                    // may already have made another accepted edit after the rename.
                    await this.reload();
                    return;
                } finally {
                    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
                        if (error.code !== "ENOENT")
                            this.report(`Could not remove config temporary file: ${error.message}`);
                    });
                }
            }
            throw new Error(
                "Desktop config kept changing during the save; no app write was applied.",
            );
        });
    }

    close(): void {
        this.closed = true;
        clearTimeout(this.settle);
        this.watcher?.close();
        this.watcher = undefined;
        this.listeners.clear();
    }

    private enqueue(action: () => Promise<void>): Promise<void> {
        if (this.closed) return Promise.reject(new Error("Desktop config store is closed."));
        const operation = this.operation.then(action);
        this.operation = operation.catch(() => undefined);
        return operation;
    }

    private async reload(): Promise<void> {
        try {
            const source = await documentRead(this.path);
            await this.accept(desktopConfigParse(source.document, this.value));
        } catch (error) {
            await this.diagnostics([
                `Could not read config.json: ${String(error)}; keeping the last accepted config.`,
            ]);
        }
    }

    private async accept(parsed: ConfigParseResult): Promise<void> {
        await this.diagnostics(parsed.issues);
        if (this.closed || same(this.value, parsed.config)) return;
        this.value = parsed.config;
        for (const listener of this.listeners) listener(this.value);
    }

    private async diagnostics(issues: readonly string[]): Promise<void> {
        const text = issues.length
            ? `config.json diagnostics (the source file was not repaired):\n${issues.join("\n")}\n`
            : "";
        if (text && text !== this.lastDiagnostic) this.report(text.trimEnd());
        this.lastDiagnostic = text;
        const path = join(dirname(this.path), "config.error.txt");
        try {
            if (text) await writeFile(path, text, { mode: 0o600 });
            else await unlink(path);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                this.report(`Could not update config.error.txt: ${String(error)}`);
        }
    }
}

interface ConfigParseResult {
    readonly config: DesktopConfig;
    readonly issues: readonly string[];
    readonly mergeable: boolean;
}

/** Disk input is lenient per field. No read ever repairs or rewrites the document. */
export function desktopConfigParse(
    candidate: unknown,
    previous = desktopConfigEmpty,
): ConfigParseResult {
    if (!isRecord(candidate))
        return {
            config: previous,
            mergeable: false,
            issues: [
                "config.json must contain a valid JSON object; keeping the last accepted config or defaults.",
            ],
        };
    const issues: string[] = [];
    const document = candidate;
    unknownFields(candidate, CONFIG_FIELDS, "", issues);
    function field<T>(
        name: keyof DesktopConfig,
        parse: (value: unknown) => T | undefined,
        fallback: T,
        initial: T,
    ): T {
        if (document[name] === undefined) return initial;
        const value = parse(document[name]);
        if (value !== undefined) return value;
        issues.push(
            `"${name}" must be ${EXPECTED[name]}; keeping its last accepted value or default.`,
        );
        return fallback;
    }
    const defaultModel = field("defaultModel", defaultModelParse, previous.defaultModel, undefined);
    const lastPickedModel = field(
        "lastPickedModel",
        modelIdentityParse,
        previous.lastPickedModel,
        undefined,
    );
    const modelPreferences = field(
        "modelPreferences",
        modelPreferencesParse,
        previous.modelPreferences,
        [],
    );
    if (isRecord(candidate.defaultModel))
        unknownFields(
            candidate.defaultModel,
            ["providerId", "modelId", "effort"],
            "defaultModel.",
            issues,
        );
    if (isRecord(candidate.lastPickedModel))
        unknownFields(
            candidate.lastPickedModel,
            ["providerId", "modelId"],
            "lastPickedModel.",
            issues,
        );
    if (Array.isArray(candidate.modelPreferences))
        candidate.modelPreferences.forEach((value: unknown, index: number) => {
            if (isRecord(value))
                unknownFields(
                    value,
                    ["providerId", "modelId", "lastEffort", "lastSpeed"],
                    `modelPreferences[${index}].`,
                    issues,
                );
        });
    let customTheme = previous.customTheme;
    if (candidate.customTheme === undefined) customTheme = undefined;
    else {
        const parsed = customThemeParse(candidate.customTheme, previous.customTheme);
        if (parsed.ok) {
            customTheme = parsed.theme;
            issues.push(...parsed.issues);
        } else issues.push(parsed.error);
    }
    const config: DesktopConfig = {
        appearance: field("appearance", appearanceModeParse, previous.appearance, "system"),
        ...(customTheme ? { customTheme } : {}),
        defaultEffort: field(
            "defaultEffort",
            preferenceValueParse,
            previous.defaultEffort,
            defaultModel?.effort ?? "medium",
        ),
        ...(defaultModel ? { defaultModel } : {}),
        defaultPermissionMode: field(
            "defaultPermissionMode",
            permissionModeParse,
            previous.defaultPermissionMode,
            "auto",
        ),
        keepAwake: field("keepAwake", keepAwakeModeParse, previous.keepAwake, undefined),
        ...(lastPickedModel ? { lastPickedModel } : {}),
        linkOpen: field("linkOpen", linkOpenPlacementParse, previous.linkOpen, undefined),
        modelPreferences,
        previewUpdatesEnabled: field(
            "previewUpdatesEnabled",
            booleanParse,
            previous.previewUpdatesEnabled,
            undefined,
        ),
        scrollbarVisibility: field(
            "scrollbarVisibility",
            scrollbarVisibilityParse,
            previous.scrollbarVisibility,
            "automatic",
        ),
        titleShimmerEnabled: field(
            "titleShimmerEnabled",
            booleanParse,
            previous.titleShimmerEnabled,
            undefined,
        ),
        version: field("version", (value) => (value === 1 ? (1 as const) : undefined), 1, 1),
    };
    return { config, issues, mergeable: true };
}

/** Renderer input remains strict at the privileged mutation boundary. */
export function desktopConfigValidate(candidate: unknown): DesktopConfig {
    const parsed = desktopConfigParse(candidate);
    if (!parsed.mergeable || parsed.issues.length)
        throw new Error(`Desktop config update is invalid: ${parsed.issues.join(" ")}`);
    return parsed.config;
}

async function documentTextRead(path: string): Promise<string | undefined> {
    try {
        return await readFile(path, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

async function documentRead(
    path: string,
): Promise<{ text: string | undefined; document: unknown }> {
    const text = await documentTextRead(path);
    if (text === undefined) return { text, document: {} };
    try {
        return { text, document: JSON.parse(text) };
    } catch {
        return { text, document: undefined };
    }
}

function same(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

/** Raw JSON only lives at the disk boundary. Known snapshots determine exactly which leaves changed. */
function objectMerge(raw: unknown, previous: unknown, next: unknown): unknown {
    if (same(previous, next)) return raw;
    if (!isRecord(next)) return next;
    const before = isRecord(previous) ? previous : {};
    const result = { ...(isRecord(raw) ? raw : {}) };
    for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
        if (same(before[key], next[key])) continue;
        if (next[key] === undefined) delete result[key];
        else
            Object.defineProperty(result, key, {
                value: objectMerge(result[key], before[key], next[key]),
                enumerable: true,
                configurable: true,
                writable: true,
            });
    }
    return result;
}

function configMerge(raw: unknown, previous: DesktopConfig, next: DesktopConfig): unknown {
    const merged = objectMerge(raw, previous, next);
    if (!isRecord(merged) || same(previous.modelPreferences, next.modelPreferences)) return merged;
    // The only dynamic config collection has a provider-qualified identity.
    // Preserve agent-added entries and unknown fields in each unchanged model.
    const disk = isRecord(raw) && Array.isArray(raw.modelPreferences) ? raw.modelPreferences : [];
    const identity = (value: unknown): string | undefined => {
        const model = modelIdentityParse(value);
        return model ? JSON.stringify([model.providerId, model.modelId]) : undefined;
    };
    const before = new Map(previous.modelPreferences.map((value) => [identity(value), value]));
    const after = new Map(next.modelPreferences.map((value) => [identity(value), value]));
    const seen = new Set<string | undefined>();
    const result: unknown[] = [];
    for (const entry of disk) {
        const id = identity(entry);
        if (id === undefined) {
            result.push(entry);
            continue;
        }
        seen.add(id);
        if (before.has(id) && !after.has(id)) continue;
        result.push(after.has(id) ? objectMerge(entry, before.get(id), after.get(id)) : entry);
    }
    for (const [id, entry] of after)
        if (!seen.has(id) && !same(before.get(id), entry)) result.push(entry);
    merged.modelPreferences = result;
    return merged;
}

function unknownFields(
    value: Record<string, unknown>,
    allowed: readonly string[],
    prefix: string,
    issues: string[],
): void {
    for (const key of Object.keys(value))
        if (!allowed.includes(key))
            issues.push(`"${prefix}${key}" is unknown; ignored by the app and preserved on disk.`);
}

function appearanceModeParse(value: unknown): DesktopAppearanceMode | undefined {
    return value === "custom" ||
        value === "dark" ||
        value === "light" ||
        value === "midnight" ||
        value === "system"
        ? value
        : undefined;
}
function linkOpenPlacementParse(value: unknown): DesktopLinkOpenPlacement | undefined {
    return value === "panel" || value === "browser" ? value : undefined;
}
function keepAwakeModeParse(value: unknown): DesktopKeepAwakeMode | undefined {
    return value === "on" || value === "agent" || value === "off" ? value : undefined;
}
function scrollbarVisibilityParse(value: unknown): DesktopScrollbarVisibility | undefined {
    return value === "always" || value === "automatic" ? value : undefined;
}
function booleanParse(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}
function defaultModelParse(candidate: unknown): DesktopDefaultModel | undefined {
    const identity = modelIdentityParse(candidate);
    if (
        !identity ||
        !isRecord(candidate) ||
        (candidate.effort !== undefined && !preferenceValueParse(candidate.effort))
    )
        return undefined;
    return {
        ...identity,
        ...(typeof candidate.effort === "string" ? { effort: candidate.effort } : {}),
    };
}
function modelPreferencesParse(candidate: unknown): readonly DesktopModelPreference[] | undefined {
    if (!Array.isArray(candidate) || candidate.length > MAXIMUM_MODEL_PREFERENCES) return undefined;
    const parsed: DesktopModelPreference[] = [];
    const identities = new Set<string>();
    for (const value of candidate) {
        const identity = modelIdentityParse(value);
        if (
            !identity ||
            !isRecord(value) ||
            (value.lastSpeed !== null && !preferenceValueParse(value.lastSpeed)) ||
            (value.lastEffort !== undefined && !preferenceValueParse(value.lastEffort))
        )
            return undefined;
        const key = JSON.stringify(identity);
        if (identities.has(key)) return undefined;
        identities.add(key);
        parsed.push({
            ...identity,
            lastSpeed: value.lastSpeed as string | null,
            ...(typeof value.lastEffort === "string" ? { lastEffort: value.lastEffort } : {}),
        });
    }
    return parsed;
}
function modelIdentityParse(candidate: unknown): DesktopModelIdentity | undefined {
    if (!isRecord(candidate)) return undefined;
    const providerId = preferenceValueParse(candidate.providerId);
    const modelId = preferenceValueParse(candidate.modelId);
    return providerId && modelId ? { providerId, modelId } : undefined;
}
function preferenceValueParse(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 && value.length <= MAXIMUM_VALUE_LENGTH
        ? value
        : undefined;
}
function permissionModeParse(value: unknown): DesktopPermissionMode | undefined {
    return value === "auto" ||
        value === "workspace_write" ||
        value === "read_only" ||
        value === "full_access"
        ? value
        : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
