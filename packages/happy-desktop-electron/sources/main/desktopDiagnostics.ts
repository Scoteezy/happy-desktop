import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DesktopDiagnosticsKind } from "../shared/desktopContract";

/** A diagnostics snapshot larger than this is refused rather than written. */
export const DESKTOP_DIAGNOSTICS_MAX_BYTES = 64 * 1024 * 1024;

const KINDS: readonly DesktopDiagnosticsKind[] = ["raw-state", "state-log"];

/** The kind and text a renderer sent, or an error naming what is wrong with them. */
export function desktopDiagnosticsRequestValidate(
    kind: unknown,
    text: unknown,
): { readonly kind: DesktopDiagnosticsKind; readonly text: string } {
    if (!KINDS.includes(kind as DesktopDiagnosticsKind))
        throw new Error("Unknown diagnostics kind.");
    if (typeof text !== "string") throw new Error("Diagnostics must be text.");
    if (Buffer.byteLength(text) > DESKTOP_DIAGNOSTICS_MAX_BYTES)
        throw new Error("Diagnostics snapshot is too large to save.");
    return { kind: kind as DesktopDiagnosticsKind, text };
}

/**
 * Writes one fresh snapshot of Dev tools' raw state or state log under
 * `<root>/diagnostics/` and returns its absolute path. Every call is a new file
 * named for its kind and moment, so an earlier copied path keeps its contents.
 */
export async function desktopDiagnosticsWrite(
    root: string,
    kind: DesktopDiagnosticsKind,
    text: string,
    now: Date = new Date(),
): Promise<string> {
    const directory = join(root, "diagnostics");
    await mkdir(directory, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const path = join(directory, `${kind}-${stamp}.txt`);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, text, "utf8");
    await rename(temporary, path);
    return path;
}
