import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HappyAgentDaemonClient } from "./happyAgentDaemonClient";
import { HappyAgentDataNewerError } from "./happyAgentDataVersion";
import { localHappyAgentConnectorCreate, type HappyAgentProcessHost } from "./localHappyAgent";

const directories: string[] = [];
afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

describe("local Happy Agent connection", () => {
    it("does not restart a stopped daemon during background reconnection", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy-stopped-daemon-"));
        directories.push(root);
        const selectedBinary = vi.fn(async () => {
            throw new Error("Reconnect attempted to start a daemon.");
        });
        const connector = localHappyAgentConnectorCreate({
            environment: { HAPPY_HOME_DIR: join(root, ".happy") },
            daemonBinary: { selectedBinary, launchEnvironment: async () => ({}) },
        });
        await expect(connector.connect({ startIfMissing: false })).rejects.toThrow(
            "no longer running",
        );
        expect(selectedBinary).not.toHaveBeenCalled();
        // A subsequent explicit startup retains the normal launch path.
        await expect(connector.connect()).rejects.toThrow("attempted to start");
        expect(selectedBinary).toHaveBeenCalledOnce();
    });

    it("stops at a start that exits 65 instead of waiting for a daemon that is not coming", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy-newer-data-"));
        directories.push(root);
        const refusal =
            "This data was written by a newer Happy Agent (version 0.4.106); update to continue.";
        const host: HappyAgentProcessHost = {
            execFile: vi.fn(async () => {
                throw Object.assign(new Error("Command failed"), {
                    code: 65,
                    stderr: `${refusal}\n`,
                });
            }),
        };
        const wait = vi.fn(async () => undefined);
        const connector = localHappyAgentConnectorCreate({
            host,
            environment: { HAPPY_HOME_DIR: join(root, ".happy") },
            daemonBinary: {
                selectedBinary: async () => ({ path: "/bin/happy-agent", version: "0.4.104" }),
                launchEnvironment: async () => ({ HAPPY_HOME_DIR: join(root, ".happy") }),
            },
            wait,
        });

        const failure = await connector.connect().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(HappyAgentDataNewerError);
        expect((failure as Error).message).toBe(refusal);
        expect(host.execFile).toHaveBeenCalledOnce();
        expect(wait).not.toHaveBeenCalled();
    });

    it("does not start a selected release older than the data", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy-newer-data-"));
        directories.push(root);
        const home = join(root, ".happy");
        await mkdir(join(home, "agent"), { recursive: true });
        await writeFile(
            join(home, "agent", "data-version.json"),
            JSON.stringify({ version: 1, writtenBy: "0.4.106", minimumVersion: "0.4.106" }),
        );
        const host: HappyAgentProcessHost = {
            execFile: vi.fn(async () => {
                throw new Error("A release older than the data must not be started.");
            }),
        };
        const connector = localHappyAgentConnectorCreate({
            host,
            environment: { HAPPY_HOME_DIR: home },
            daemonBinary: {
                selectedBinary: async () => ({ path: "/bin/happy-agent", version: "0.4.104" }),
                launchEnvironment: async () => ({ HAPPY_HOME_DIR: home }),
            },
            wait: async () => undefined,
        });

        await expect(connector.connect()).rejects.toThrow(
            "Happy Agent 0.4.104 is older than your data, which a newer Happy Agent already updated. It needs Happy Agent 0.4.106 or newer.",
        );
        await expect(connector.connect()).rejects.toBeInstanceOf(HappyAgentDataNewerError);
        expect(host.execFile).not.toHaveBeenCalled();
    });

    it("connects to an exact daemon named by HAPPY_AGENT_SERVER_SOCKET_PATH and HAPPY_AGENT_SERVER_TOKEN_PATH, never discovering or starting Happy Agent", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy-local-happy-agent-"));
        directories.push(root);
        const tokenPath = join(root, "token");
        const socketPath = join(root, "server.sock");
        await writeFile(tokenPath, "existing-token\n");
        const host: HappyAgentProcessHost = {
            execFile: vi.fn(async () => {
                throw new Error("A running daemon must not trigger command discovery.");
            }),
        };
        const health = vi.fn().mockResolvedValue({
            status: "ready",
            healthy: true,
            ready: true,
            version: { daemon: "0.2.19", protocol: 17 },
        });
        const clientCreate = vi.fn(() => ({ health }) as unknown as HappyAgentDaemonClient);
        const wait = vi.fn(async () => undefined);
        const connector = localHappyAgentConnectorCreate({
            host,
            environment: {
                HAPPY_AGENT_SERVER_SOCKET_PATH: socketPath,
                HAPPY_AGENT_SERVER_TOKEN_PATH: tokenPath,
                SHELL: "/bin/zsh",
            },
            configuredShell: "/bin/zsh",
            clientCreate,
            wait,
        });

        const connection = await connector.connect();

        expect(connection.version).toBe("0.2.19");
        expect(clientCreate).toHaveBeenCalledWith({
            socketPath,
            token: "existing-token",
        });
        expect(health).toHaveBeenCalledOnce();
        expect(host.execFile).not.toHaveBeenCalled();
        expect(wait).not.toHaveBeenCalled();
    });
});
