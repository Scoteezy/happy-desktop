/**
 * Serves the built renderer (`dist/renderer`) with the browser development bridge in front of it,
 * so an ordinary browser runs the production renderer against one exact daemon
 * (HAPPY_AGENT_SERVER_SOCKET_PATH / HAPPY_AGENT_SERVER_TOKEN_PATH). Used by the session-speed gym.
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

import { browserLocalHappyAgentPlugin } from "../sources/main/browserDevServer";

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

const port = Number(process.env.PORT ?? "5199");
const host = "127.0.0.1";
const root = process.env.PERF_RENDERER_DIR ?? join(import.meta.dirname, "..", "dist", "renderer");
const desktopConfigPath = process.env.PERF_DESKTOP_CONFIG;
const middlewares: Middleware[] = [];
const server = createServer((request, response) => {
    let index = 0;
    const next = (): void => {
        const middleware = middlewares[index++];
        if (middleware === undefined) {
            void serveStatic(request, response);
            return;
        }
        middleware(request, response, next);
    };
    next();
});
const plugin = browserLocalHappyAgentPlugin(
    desktopConfigPath === undefined ? {} : { desktopConfigPath },
);
(plugin.configureServer as (server: unknown) => void)({
    config: { server: { host, port } },
    httpServer: server,
    middlewares: { use: (middleware: Middleware) => middlewares.push(middleware) },
});

const types: Record<string, string> = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
};

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${host}`);
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) {
        response.writeHead(403).end();
        return;
    }
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || info.isDirectory()) path = join(root, "index.html");
    if (path.endsWith("index.html")) {
        const html = (await readFile(path, "utf8")).replace(
            "<head>",
            '<head><meta name="happy-browser-local" content="1">',
        );
        response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
        response.end(html);
        return;
    }
    response.writeHead(200, {
        "cache-control": "max-age=31536000, immutable",
        "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(response);
}

server.listen(port, host, () => console.log(`perf web at http://${host}:${String(port)}`));
