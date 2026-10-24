import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateFuzzResults } from "./validate-interaction-fuzz.mjs";

/** Same concurrent browser schedule that exposed the footer-identity race. */
export async function runInteractionFuzzStress(command, prefix, browsers) {
    const directory = resolve(
        ".context",
        `interaction-fuzz-stress-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await mkdir(directory, { recursive: true });
    const schedule = [
        { browser: "firefox", seeds: [1, 1021, 32749, 214013] },
        { browser: "chromium", seeds: [65521] },
    ].filter((entry) => browsers.includes(entry.browser));
    if (!schedule.length) return;
    const results = [];
    for (let iteration = 1; iteration <= 20; iteration++) {
        const children = [];
        let jobs = [];
        const stop = () => {
            for (const child of children) {
                if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null)
                    continue;
                try {
                    if (process.platform === "win32") child.kill("SIGTERM");
                    else process.kill(-child.pid, "SIGTERM");
                } catch (error) {
                    if (error.code !== "ESRCH") throw error;
                }
            }
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        try {
            jobs = schedule.map(
                ({ browser, seeds }) =>
                    new Promise((done, reject) => {
                        const pattern = `holds transcript geometry.*seed (${seeds.join("|")})\\)`;
                        const child = spawn(
                            command,
                            [
                                ...prefix,
                                "exec",
                                "vitest",
                                "run",
                                "src/ConversationInteractionFuzz.test.tsx",
                                "--project",
                                browser,
                                "-t",
                                pattern,
                            ],
                            {
                                env: {
                                    ...process.env,
                                    HAPPY_TEST_DEPTH: "full",
                                    VITE_CHAT_FUZZ_SEED: undefined,
                                },
                                detached: process.platform !== "win32",
                                stdio: ["ignore", "pipe", "pipe"],
                            },
                        );
                        children.push(child);
                        let log = "";
                        for (const stream of [child.stdout, child.stderr])
                            stream.on("data", (chunk) => {
                                log += chunk;
                            });
                        child.once("error", reject);
                        child.once("close", async (code) => {
                            try {
                                const file = `${iteration.toString().padStart(2, "0")}-${browser}.log`;
                                await writeFile(resolve(directory, file), log);
                                const report = validateFuzzResults(
                                    log,
                                    "full",
                                    [browser],
                                    seeds.map((seed) => ({ seed, short: false })),
                                );
                                results.push({ iteration, browser, code, file, ...report });
                                if (code !== 0 || !report.valid)
                                    throw new Error(
                                        `Interaction stress failed: ${resolve(directory, file)}`,
                                    );
                                done();
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }),
            );
            await Promise.all(jobs);
        } finally {
            stop();
            await Promise.allSettled(jobs);
            process.removeListener("SIGINT", stop);
            process.removeListener("SIGTERM", stop);
            await writeFile(resolve(directory, "results.json"), JSON.stringify(results, null, 2));
        }
        console.log(`Interaction stress ${iteration}/20 passed: ${directory}`);
    }
}
