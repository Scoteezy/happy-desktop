import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, expect, it } from "vitest";
import type { ArtifactPageScriptsCase } from "./artifactPageScripts.electron";

/*
 * An HTML artifact's page runs every common kind of script in the guest the
 * desktop shows it in: inline, external, deferred, module, inline module, an
 * event-handler attribute, and a worker — under the app window's own policy,
 * through the webview the renderer draws, with main's admission, preferences,
 * and site binding. That is the whole point of serving it as a site rather
 * than drawing it statically, so this runs in a real Electron.
 */

const page: ArtifactPageScriptsCase["files"] = [
    {
        path: "index.html",
        mimeType: "text/html",
        text: `<!doctype html><html><head><meta charset="utf-8"><title>page</title>
<script>
window.ran = { inline: true };
const report = () => "done " + JSON.stringify({ ran: window.ran, node: [typeof require, typeof process] });
window.finish = () => {
    const expected = ["externalClassic", "deferred", "externalModule", "inlineModule", "eventHandler", "load", "worker"];
    if (expected.every((name) => name in window.ran)) document.title = report();
};
setTimeout(() => { document.title = report(); }, 10000);
</script>
<script src="classic.js"></script>
<script defer src="js/deferred.js"></script>
<script type="module" src="module.js"></script>
<script type="module">import { mark } from "./lib/mark.js"; mark("inlineModule");</script>
</head><body onload="window.ran.load = true; window.finish()">
<button id="button" onclick="window.ran.eventHandler = true">Run</button>
<script>
document.getElementById("button").click();
const worker = new Worker("worker.js");
worker.onmessage = (event) => { window.ran.worker = event.data; window.finish(); };
</script>
</body></html>`,
    },
    { path: "classic.js", mimeType: "text/javascript", text: "window.ran.externalClassic = true;" },
    {
        path: "js/deferred.js",
        mimeType: "text/javascript",
        text: "window.ran.deferred = true; window.finish();",
    },
    {
        path: "module.js",
        mimeType: "text/javascript",
        text: 'import { mark } from "./lib/mark.js"; mark("externalModule");',
    },
    {
        path: "lib/mark.js",
        mimeType: "text/javascript",
        text: "export function mark(name) { window.ran[name] = true; window.finish(); }",
    },
    { path: "worker.js", mimeType: "text/javascript", text: "postMessage(true);" },
];

let directory: string | undefined;

afterEach(async () => {
    if (directory) await rm(directory, { force: true, recursive: true });
    directory = undefined;
});

it("runs an artifact page's scripts in the guest the desktop shows it in", async () => {
    directory = await mkdtemp(join(tmpdir(), "happy-artifact-scripts-"));
    await build({
        configFile: false,
        logLevel: "silent",
        publicDir: false,
        build: {
            ssr: fileURLToPath(new URL("./artifactPageScripts.electron.ts", import.meta.url)),
            outDir: directory,
            emptyOutDir: false,
            rollupOptions: { external: ["electron"], output: { entryFileNames: "main.mjs" } },
        },
        ssr: { noExternal: true },
    });
    const indexHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u.exec(indexHtml)?.[1];
    expect(policy).toBeDefined();
    const reportPath = join(directory, "report.json");
    const electron = createRequire(import.meta.url)("electron") as string;
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        HAPPY_ARTIFACT_PAGE_SCRIPTS: JSON.stringify({
            artifactId: "k3v8w2m9q4x7z1c5b6n0p2r8",
            files: page,
            policy: policy!,
        } satisfies ArtifactPageScriptsCase),
        HAPPY_ARTIFACT_PAGE_SCRIPTS_REPORT: reportPath,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    let errors = "";
    await new Promise<void>((resolve, reject) => {
        const child = spawn(
            electron,
            [
                // A CI container has neither a display nor the setuid sandbox helper.
                ...(process.platform === "linux"
                    ? ["--no-sandbox", "--ozone-platform=headless", "--disable-gpu"]
                    : []),
                `--user-data-dir=${join(directory!, "user-data")}`,
                join(directory!, "main.mjs"),
            ],
            { env: environment, stdio: ["ignore", "ignore", "pipe"] },
        );
        child.stderr.on("data", (chunk: Buffer) => {
            errors = `${errors}${chunk.toString()}`.slice(-4_000);
        });
        child.once("error", reject);
        child.once("exit", () => resolve());
    });
    const report = JSON.parse(
        await readFile(reportPath, "utf8").catch(() => {
            throw new Error(`Electron left no report.\n${errors}`);
        }),
    ) as unknown;
    expect(report).toEqual({
        refused: [],
        page: {
            ran: {
                inline: true,
                externalClassic: true,
                deferred: true,
                externalModule: true,
                inlineModule: true,
                eventHandler: true,
                load: true,
                worker: true,
            },
            // The page runs as a web page and nothing more.
            node: ["undefined", "undefined"],
        },
    });
}, 120_000);
