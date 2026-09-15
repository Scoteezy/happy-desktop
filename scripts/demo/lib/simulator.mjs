import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

/** Local native taps and accessibility reads; no injected app state or RPC stubs. */
export async function simulatorOpen({
    udid,
    executable = join(homedir(), ".maestro", "bin", "maestro"),
}) {
    const child = spawn(executable, ["mcp"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "true" },
    });
    let next = 0;
    let diagnostics = "";
    const pending = new Map();
    child.stderr.on("data", (chunk) => {
        diagnostics = (diagnostics + chunk).slice(-2000);
    });
    const fail = (error) => {
        for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(error);
        }
        pending.clear();
    };
    child.on("error", fail);
    child.on("exit", (code) =>
        fail(new Error(`Native interaction process exited (${code}): ${diagnostics}`)),
    );
    createInterface({ input: child.stdout }).on("line", (line) => {
        let message;
        try {
            message = JSON.parse(line);
        } catch {
            return;
        }
        const operation = pending.get(message.id);
        if (!operation) return;
        pending.delete(message.id);
        clearTimeout(operation.timer);
        if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
        else operation.resolve(message.result);
    });
    const call = (method, params) =>
        new Promise((resolve, reject) => {
            const id = ++next;
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`Native interaction timed out: ${method}`));
            }, 60000);
            pending.set(id, { resolve, reject, timer });
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        });
    let queue = Promise.resolve();
    let lastOperation = Date.now();
    const invoke = async (name, args) => {
        lastOperation = Date.now();
        const result = await call("tools/call", { name, arguments: { device_id: udid, ...args } });
        if (result.isError)
            throw new Error(
                result.content
                    .filter((item) => item.type === "text")
                    .map((item) => item.text)
                    .join("\n"),
            );
        return result;
    };
    const tool = (name, args) => {
        const operation = queue.then(() => invoke(name, args));
        queue = operation.catch(() => {});
        return operation;
    };
    try {
        await call("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "happy-demo-recorder", version: "1" },
        });
        child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
        );
    } catch (error) {
        child.kill("SIGTERM");
        throw error;
    }
    // Keep the local accessibility driver warm during the desktop-only opening.
    // Reads share the interaction queue and never change the phone's UI.
    const heartbeat = setInterval(() => {
        // A threshold equal to the interval can miss one tick and leave a
        // sixteen-second gap. Keep idle accessibility reads comfortably bounded.
        if (Date.now() - lastOperation > 4000) void tool("inspect_screen", {}).catch(() => {});
    }, 3000);
    heartbeat.unref();
    return {
        udid,
        async run(commands) {
            await tool("run", { yaml: `appId: com.slopus.happy.dev\n---\n${commands}` });
        },
        async inspect() {
            const result = await tool("inspect_screen", {});
            const payload = result.content.find(
                (item) => item.type === "text" && item.text.startsWith("{"),
            );
            const screen = JSON.parse(payload.text);
            const visit = (nodes) =>
                nodes.flatMap((node) => [
                    ...(node.a11y || node.txt || node.rid
                        ? [{ bounds: node.b, text: node.a11y || node.txt, id: node.rid }]
                        : []),
                    ...visit(node.c ?? []),
                ]);
            return visit(screen.elements);
        },
        async close() {
            clearInterval(heartbeat);
            if (child.exitCode !== null || child.signalCode !== null) return;
            const exited = new Promise((resolve) => child.once("exit", resolve));
            child.kill("SIGTERM");
            let timeout;
            try {
                await Promise.race([
                    exited,
                    new Promise((resolve) => {
                        timeout = setTimeout(() => {
                            child.kill("SIGKILL");
                            resolve();
                        }, 5000);
                    }),
                ]);
            } finally {
                clearTimeout(timeout);
            }
        },
    };
}
