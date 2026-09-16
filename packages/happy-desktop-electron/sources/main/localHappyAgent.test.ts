import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HappyAgentDaemonClient } from "./happyAgentDaemonClient";
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
