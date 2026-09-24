import {
    request as httpRequest,
    type IncomingHttpHeaders,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import { pipeline } from "node:stream/promises";
import { HappyAgentDaemonClient } from "../main/happyAgentDaemonClient";
import { happyAgentProxyHandle } from "../main/happyAgentProxyHandle";
import { happyAgentRendererProxyCreate } from "../main/happyAgentRendererProxy";
import { happyAgentRequestTimingCreate } from "../main/happyAgentRequestTiming";
import type {
    RendererUtilityInput,
    RendererUtilityOutput,
} from "../shared/happyAgentRendererUtilityContract";

const LOCAL_ROUTES = new Set([
    "/open-in-targets",
    "/open-in",
    "/attachment",
    "/attachment-source-reachable",
    "/workspace-file-bytes",
    "/workspace-file-media",
    "/html-preview",
]);

/** Local-only desktop operations and terminal upgrades stay on the capability bridge. */
function localRoute(path: string): boolean {
    if (LOCAL_ROUTES.has(path)) return true;
    const remote = /^\/connections\/[a-z][a-z0-9_-]{0,63}(\/[^/]+)$/u.exec(path);
    return remote !== null && LOCAL_ROUTES.has(remote[1]!);
}

function localForward(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    bridgeUrl: string,
): void {
    const headers: IncomingHttpHeaders = { ...request.headers, host: new URL(bridgeUrl).host };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const outgoing = httpRequest(
        `${bridgeUrl}${url.pathname}${url.search}`,
        {
            method: request.method,
            headers,
        },
        (incoming) => {
            response.writeHead(incoming.statusCode ?? 502, incoming.headers);
            void pipeline(incoming, response).catch(() => response.destroy());
        },
    );
    outgoing.on("error", () => {
        if (response.headersSent) response.destroy();
        else response.writeHead(502, { "cache-control": "no-store" }).end();
    });
    request.once("aborted", () => outgoing.destroy());
    response.once("close", () => outgoing.destroy());
    request.pipe(outgoing);
}

export async function happyAgentRendererUtilityServerCreate(
    send: (message: RendererUtilityOutput) => void,
    debugEnabled: boolean,
) {
    const debug = debugEnabled ? (text: string) => send({ type: "debug", text }) : undefined;
    const proxy = await happyAgentRendererProxyCreate(debug, "transport");
    let detach: (() => void) | undefined;
    let activeId: number | undefined;
    return {
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        async receive(message: RendererUtilityInput): Promise<void> {
            if (message.type === "detach") {
                if (activeId === message.id) {
                    detach?.();
                    activeId = undefined;
                    detach = undefined;
                }
                return;
            }
            const client = new HappyAgentDaemonClient(message.transport);
            const id = message.id;
            const next = await proxy.targetSet({
                url: message.bridgeUrl,
                terminalCapability: message.terminalCapability,
                requestHandle(request, response, url) {
                    const path = url.pathname;
                    if (localRoute(path)) {
                        localForward(request, response, url, message.bridgeUrl);
                        return;
                    }
                    if (path !== "/health" && path !== "/v0" && !path.startsWith("/v0/")) {
                        response.writeHead(404, { "cache-control": "no-store" }).end();
                        return;
                    }
                    const origin = request.headers.origin;
                    const crossOrigin =
                        message.allowedOrigin !== undefined && origin === message.allowedOrigin;
                    if (
                        origin !== undefined &&
                        origin !== "null" &&
                        !origin.startsWith("file:") &&
                        !crossOrigin
                    ) {
                        response.writeHead(403).end();
                        return;
                    }
                    if (crossOrigin) {
                        response.setHeader("access-control-allow-origin", message.allowedOrigin!);
                        response.setHeader("access-control-expose-headers", "*");
                        response.setHeader("vary", "origin");
                    }
                    if (request.method === "OPTIONS") {
                        if (!crossOrigin) {
                            response.writeHead(403).end();
                            return;
                        }
                        const method = request.headers["access-control-request-method"]?.trim();
                        const headers = request.headers["access-control-request-headers"]?.trim();
                        response
                            .writeHead(204, {
                                "access-control-allow-headers":
                                    headers ||
                                    "authorization, content-type, if-match, x-happy-agent-mutation-id",
                                "access-control-allow-methods": method
                                    ? `${method}, OPTIONS`
                                    : "DELETE, GET, HEAD, PATCH, POST, PUT, OPTIONS",
                                ...(request.headers["access-control-request-private-network"] ===
                                "true"
                                    ? { "access-control-allow-private-network": "true" }
                                    : {}),
                                "access-control-max-age": "600",
                            })
                            .end();
                        return;
                    }
                    const onTiming = happyAgentRequestTimingCreate(response, debug);
                    void happyAgentProxyHandle({
                        client,
                        method: request.method ?? "GET",
                        path,
                        query: url.searchParams,
                        request,
                        response,
                        ...(onTiming ? { onTiming } : {}),
                        onConnectionError: () => {
                            if (activeId === id) send({ type: "unavailable", id });
                        },
                    }).then(
                        (handled) => {
                            if (!handled && !response.headersSent) response.writeHead(404).end();
                        },
                        () => {
                            if (response.headersSent) response.destroy();
                            else response.writeHead(502, { "cache-control": "no-store" }).end();
                        },
                    );
                },
            });
            detach = next;
            activeId = id;
            send({ type: "attached", id });
        },
        close(): void {
            detach?.();
            proxy.close();
        },
    };
}
