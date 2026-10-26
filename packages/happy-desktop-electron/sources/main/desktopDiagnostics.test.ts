import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { desktopDiagnosticsRequestValidate, desktopDiagnosticsWrite } from "./desktopDiagnostics";

const roots: string[] = [];
afterEach(async () => {
    const parent = resolve(tmpdir()) + sep;
    for (const root of roots.splice(0)) {
        if (!resolve(root).startsWith(parent) || !root.includes("happy-diagnostics-"))
            throw new Error("Refusing to remove an unexpected fixture directory.");
        await rm(root, { recursive: true, force: true });
    }
});

it("writes each snapshot to its own file under diagnostics and returns its path", async () => {
    const root = await mkdtemp(join(tmpdir(), "happy-diagnostics-"));
    roots.push(root);
    const first = await desktopDiagnosticsWrite(
        root,
        "raw-state",
        "# Models\n{}",
        new Date("2026-10-26T12:00:00.000Z"),
    );
    const second = await desktopDiagnosticsWrite(
        root,
        "state-log",
        "log",
        new Date("2026-10-26T12:00:01.000Z"),
    );
    expect(isAbsolute(first)).toBe(true);
    expect(dirname(first)).toBe(join(root, "diagnostics"));
    expect(first).toMatch(/raw-state-2026-10-26T12-00-00-000Z\.txt$/);
    expect(second).toMatch(/state-log-2026-10-26T12-00-01-000Z\.txt$/);
    expect(await readFile(first, "utf8")).toBe("# Models\n{}");
    expect(await readFile(second, "utf8")).toBe("log");
});

it("refuses an unknown kind or a non-text snapshot", () => {
    expect(() => desktopDiagnosticsRequestValidate("passwords", "x")).toThrow();
    expect(() => desktopDiagnosticsRequestValidate("state-log", 42)).toThrow();
    expect(desktopDiagnosticsRequestValidate("state-log", "x")).toEqual({
        kind: "state-log",
        text: "x",
    });
});
