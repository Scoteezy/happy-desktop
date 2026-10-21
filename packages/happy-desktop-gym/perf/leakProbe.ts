/**
 * Memory probe the leak gym preloads into the processes it does not drive through a browser: the
 * perf daemon and the perf web host (`node --expose-gc --import tsx --import <this file> …`).
 * Product code is untouched; the probe only answers the gym over a Unix socket at
 * `$PERF_PROBE_DIR/$PERF_PROBE_ROLE.sock`:
 *
 * - `GET /memory` collects garbage twice, then reports RSS and the V8 heap.
 * - `POST /sampling/start` and `GET /sampling` run V8's sampling heap profiler, whose result holds
 *   only allocations still alive, each with the stack that made it.
 * - `POST /snapshot?path=…` writes a heap snapshot after a collection.
 *
 * In the perf daemon it also bounds the scripted-inference request log, which the gym keeps for
 * assertions and which otherwise retains every full inference context forever: a leak of the harness
 * that the daemon verdict would otherwise measure instead of the product.
 */
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { Session } from "node:inspector/promises";
import { register } from "node:module";
import { join } from "node:path";
import { writeHeapSnapshot } from "node:v8";
import { isMainThread } from "node:worker_threads";

/** Full inference requests the capped log keeps; the perf daemon reads none of them, and each holds a whole context. */
const REQUEST_LOG_CAP = Number(process.env.PERF_REQUEST_LOG_CAP ?? "2");

/** Module hook, run in the loader thread: the request log becomes a bounded array. */
export async function load(
    url: string,
    context: unknown,
    nextLoad: (
        url: string,
        context: unknown,
    ) => Promise<{ source?: string | ArrayBuffer | Uint8Array; format?: string }>,
) {
    const loaded = await nextLoad(url, context);
    if (
        !url.endsWith("/happy-agent-gym/sources/scriptedInference.ts") ||
        loaded.source === undefined
    )
        return loaded;
    const source =
        typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
    const capped = source.replace(
        /const requests(\s*:\s*GymInferenceRequest\[\])?\s*=\s*\[\];/,
        (_match, type: string | undefined) =>
            `const requests${type ?? ""} = globalThis.__perfRequestLog();`,
    );
    return { ...loaded, source: capped };
}

class BoundedLog<T> extends Array<T> {
    // Array methods that build a new array (`map`, `filter`) make plain ones, not bounded logs.
    static override get [Symbol.species]() {
        return Array;
    }
    override push(...items: T[]): number {
        super.push(...items);
        if (this.length > REQUEST_LOG_CAP) this.splice(0, this.length - REQUEST_LOG_CAP);
        return this.length;
    }
}

if (isMainThread) {
    const role = process.env.PERF_PROBE_ROLE ?? "process";
    const directory = process.env.PERF_PROBE_DIR;
    let requestLogCapped = false;
    (globalThis as { __perfRequestLog?: () => unknown[] }).__perfRequestLog = () => {
        requestLogCapped = true;
        return new BoundedLog();
    };
    register(import.meta.url);
    const gc = (globalThis as { gc?: () => void }).gc;
    const inspector = new Session();
    inspector.connect();
    const memory = () => {
        gc?.();
        gc?.();
        const usage = process.memoryUsage();
        return {
            arrayBuffers: usage.arrayBuffers,
            external: usage.external,
            gc: gc !== undefined,
            handles: (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles()
                .length,
            heapUsed: usage.heapUsed,
            pid: process.pid,
            requestLogCapped,
            rss: usage.rss,
        };
    };
    if (directory !== undefined) {
        mkdirSync(directory, { recursive: true });
        const socket = join(directory, `${role}.sock`);
        rmSync(socket, { force: true });
        const server = createServer((request, response) => {
            void (async () => {
                const url = new URL(request.url ?? "/", "http://probe");
                let body: unknown;
                if (url.pathname === "/memory") body = memory();
                else if (url.pathname === "/sampling/start") {
                    await inspector.post("HeapProfiler.enable");
                    await inspector.post("HeapProfiler.startSampling", {
                        samplingInterval: 32_768,
                    });
                    body = { started: true };
                } else if (url.pathname === "/sampling") {
                    body = (await inspector.post("HeapProfiler.getSamplingProfile")).profile;
                } else if (url.pathname === "/snapshot") {
                    gc?.();
                    body = { path: writeHeapSnapshot(url.searchParams.get("path") ?? undefined) };
                } else {
                    response.writeHead(404).end();
                    return;
                }
                response
                    .writeHead(200, { "content-type": "application/json" })
                    .end(JSON.stringify(body));
            })().catch((error: unknown) => response.writeHead(500).end(String(error)));
        });
        server.listen(socket);
        server.unref();
    }
}
