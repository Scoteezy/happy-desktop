import { execFile as execFileCallback, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/** Local native taps and accessibility reads; no injected app state or RPC stubs. */
export async function simulatorOpen({
    udid,
    executable = join(homedir(), ".maestro", "bin", "maestro"),
}) {
    const childEnvironment = Object.fromEntries(
        [
            "PATH",
            "HOME",
            "TMPDIR",
            "TMP",
            "TEMP",
            "LANG",
            "LC_ALL",
            "TERM",
            "CI",
            "JAVA_HOME",
            "DEVELOPER_DIR",
        ].flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
    );
    const child = spawn(executable, ["mcp"], {
        // Own the whole driver lifetime, including xcodebuild's restart loop.
        // Killing only Java leaves XCTest alive to collide with the next take.
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        // Maestro is a third-party child process. Do not hand it ambient
        // GitHub, cloud, vendor, EXPO_PUBLIC, VITE, or Happy credentials.
        env: { ...childEnvironment, MAESTRO_CLI_NO_ANALYTICS: "true" },
    });
    let next = 0;
    let diagnostics = "";
    let closing = false;
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
        if (closing) throw new Error("The recorder's native driver is closing.");
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
    const signalGroup = (signal) => {
        if (child.pid === undefined) return false;
        try {
            process.kill(-child.pid, signal);
            return true;
        } catch (error) {
            if (error.code === "ESRCH") return false;
            throw error;
        }
    };
    const groupAlive = async () => {
        if (child.pid === undefined) return false;
        // On macOS kill(-pgid, 0) can report EPERM after XCTest exits, even
        // when the owned group has no live members. Inspect process state
        // read-only; zombies cannot hold a driver port or need another signal.
        const { stdout } = await execFile("/bin/ps", ["-axo", "pgid=,stat="]);
        return stdout.split("\n").some((line) => {
            const [group, state] = line.trim().split(/\s+/u);
            return Number(group) === child.pid && state && !state.startsWith("Z");
        });
    };
    const closeDriver = async () => {
        closing = true;
        fail(new Error("The recorder's native driver is closing."));
        if (!signalGroup("SIGTERM")) return;
        const deadline = Date.now() + 5000;
        // The parent can exit before its children. Wait for the owned group,
        // not just Java's exit event, before allowing another native driver.
        while ((await groupAlive()) && Date.now() < deadline) await delay(50);
        if (!(await groupAlive())) return;
        signalGroup("SIGKILL");
        const killDeadline = Date.now() + 2000;
        while ((await groupAlive()) && Date.now() < killDeadline) await delay(50);
        if (await groupAlive()) throw new Error("The recorder's native driver group did not stop.");
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
        await closeDriver();
        throw error;
    }
    // Keep the local accessibility driver warm during the desktop-only opening.
    // Reads share the interaction queue and never change the phone's UI.
    const heartbeat = setInterval(() => {
        // A threshold equal to the interval can miss one tick and leave a
        // sixteen-second gap. Keep idle accessibility reads comfortably bounded.
        if (Date.now() - lastOperation > 4000)
            void tool("inspect_screen", {}).catch((error) => {
                if (!closing) process.stderr.write(`Native driver heartbeat failed: ${error}\n`);
            });
    }, 3000);
    heartbeat.unref();
    return {
        udid,
        async run(commands) {
            await tool("run", { yaml: `appId: com.slopus.happy.dev\n---\n${commands}` });
        },
        async tapPoints(points) {
            const operation = queue.then(async () => {
                // Use the same Maestro-owned XCTest driver, without its
                // per-key app-settling delay. These are real native touches.
                // The caller has just inspected the actual keyboard/control.
                // Re-reading the whole native hierarchy here adds a visible
                // idle pause; listener ownership below is the safety check.
                const { stdout } = await execFile("/usr/sbin/lsof", [
                    "-nP",
                    "-iTCP:22087",
                    "-sTCP:LISTEN",
                    "-t",
                ]);
                const pids = [...new Set(stdout.trim().split(/\s+/))];
                if (pids.length !== 1 || !/^\d+$/.test(pids[0]))
                    throw new Error("Expected one native keyboard touch listener.");
                const { stdout: command } = await execFile("/bin/ps", [
                    "-p",
                    pids[0],
                    "-o",
                    "command=",
                ]);
                if (
                    !command.includes(`/Devices/${udid}/`) ||
                    !command.includes("maestro-driver-iosUITests-Runner")
                )
                    throw new Error("The native touch listener belongs to another simulator.");
                const timings = [];
                for (const point of points) {
                    if (closing) throw new Error("The recorder's native driver is closing.");
                    if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
                        throw new Error("Invalid native keyboard coordinates.");
                    lastOperation = Date.now();
                    // Maestro 2.6.1 XCTestDriverClient.tap / TouchRequest.
                    // Never retry an ambiguous touch: it may already have typed.
                    const response = await fetch("http://127.0.0.1:22087/touch", {
                        method: "POST",
                        redirect: "error",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...point, duration: 0.01 }),
                        signal: AbortSignal.timeout(5000),
                    });
                    await response.text();
                    if (!response.ok)
                        throw new Error(`Native keyboard touch failed: ${response.status}`);
                    timings.push({ ...point, milliseconds: Date.now() - lastOperation });
                }
                return timings;
            });
            queue = operation.catch(() => {});
            return await operation;
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
            await closeDriver();
        },
    };
}
