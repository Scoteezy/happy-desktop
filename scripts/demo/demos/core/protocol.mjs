import { createServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const steveMessageId = `coresteve${randomUUID().replaceAll("-", "").slice(0, 20)}`;
export const steve = {
    id: "coresteve",
    name: "Steve",
    photo: null,
    version: 1,
    updatedAt: Date.now(),
};

/**
 * Recording-only identity fixture, not a team authentication implementation.
 * The private daemon accepts the real second message. This transparent Unix
 * proxy supplies the fictional actor's explicit userId at the protocol boundary
 * (both live events and authoritative reads), and answers his user lookup.
 * No production code, credentials, account, or real person's identity is changed.
 */
export async function coreProtocolOpen(gym) {
    const socketPath = join(gym.paths.root, "core.sock");
    const authorization = `Bearer ${(await readFile(gym.paths.tokenPath, "utf8")).trim()}`;
    const author = (message) =>
        message.id === steveMessageId
            ? { ...message, metadata: { ...message.metadata, userId: steve.id } }
            : message;
    const event = (value) =>
        value.type === "message.created" || value.type === "message.updated"
            ? { ...value, payload: { ...value.payload, message: author(value.payload.message) } }
            : value;
    const transform = (url, value) => {
        if (/^\/v0\/agents\/[^/]+\/messages$/.test(url.pathname))
            return {
                ...value,
                runs: value.runs.map((run) => ({ ...run, messages: run.messages.map(author) })),
            };
        if (/^\/v0\/agents\/[^/]+\/bootstrap$/.test(url.pathname))
            return { ...value, pending: value.pending.map(author) };
        if (url.pathname === "/v0/events") return { ...value, events: value.events.map(event) };
        if (
            url.pathname === "/v0/users" &&
            url.searchParams.get("ids")?.split(",").includes(steve.id)
        )
            return {
                ...value,
                users: [...value.users.filter((user) => user.id !== steve.id), steve],
            };
        return value;
    };
    const server = createServer((request, response) => {
        const url = new URL(request.url, "http://core.invalid");
        // Standalone daemons deliberately have no team-user directory. Answer
        // this one declared fictional identity in the authenticated fixture.
        if (
            request.headers.authorization === authorization &&
            url.pathname === "/v0/users" &&
            url.searchParams.get("ids") === steve.id
        ) {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ users: [steve] }));
            return;
        }
        const upstream = httpRequest(
            {
                socketPath: gym.paths.socketPath,
                path: request.url,
                method: request.method,
                headers: request.headers,
            },
            (incoming) => {
                const headers = { ...incoming.headers };
                delete headers["content-length"];
                response.writeHead(incoming.statusCode, headers);
                if (String(headers["content-type"]).includes("text/event-stream")) {
                    let pending = "";
                    incoming.setEncoding("utf8");
                    incoming.on("data", (chunk) => {
                        pending += chunk;
                        let boundary;
                        while ((boundary = pending.indexOf("\n\n")) !== -1) {
                            const packet = pending.slice(0, boundary);
                            pending = pending.slice(boundary + 2);
                            response.write(
                                packet
                                    .split("\n")
                                    .map((line) => {
                                        if (!line.startsWith("data: ")) return line;
                                        return `data: ${JSON.stringify(event(JSON.parse(line.slice(6))))}`;
                                    })
                                    .join("\n") + "\n\n",
                            );
                        }
                    });
                    incoming.on("end", () => response.end(pending));
                } else if (
                    String(headers["content-type"]).includes("application/json") &&
                    incoming.statusCode === 200
                ) {
                    const chunks = [];
                    incoming.on("data", (chunk) => chunks.push(chunk));
                    incoming.on("end", () =>
                        response.end(
                            JSON.stringify(
                                transform(url, JSON.parse(Buffer.concat(chunks).toString("utf8"))),
                            ),
                        ),
                    );
                } else incoming.pipe(response);
                response.on("close", () => incoming.destroy());
            },
        );
        upstream.on("error", () => {
            if (!response.headersSent) response.writeHead(502);
            response.end();
        });
        request.pipe(upstream);
    });
    await unlink(socketPath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
    });
    return {
        viteEnvironment: { ...gym.viteEnvironment, HAPPY_AGENT_SERVER_SOCKET_PATH: socketPath },
        close: () =>
            new Promise((resolve) => {
                server.close(resolve);
                server.closeAllConnections();
            }),
    };
}
