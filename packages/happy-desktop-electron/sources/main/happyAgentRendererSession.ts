import type {
    OnBeforeRequestListenerDetails,
    Session,
    UtilityProcess,
    WebContents,
} from "electron";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { happyAgentRendererOrigin, type HappyAgentRendererProxy } from "./happyAgentRendererProxy";
import { happyAgentRendererUtilityProxyCreate } from "./happyAgentRendererUtilityProxy";
import { rendererNavigationAllowed } from "./navigation";
import { mediaPreviewAddressAllowed } from "./mediaPreviewWindow";

export interface HappyAgentRendererSession {
    readonly proxy: HappyAgentRendererProxy;
    windowRegister(
        contents: WebContents,
        document: string,
        development: boolean,
        mediaOnly?: boolean,
    ): void;
    close(): void;
}

/** The stable origin belongs only to registered app documents, never to guests or subframes. */
export async function happyAgentRendererSessionCreate(
    session: Session,
    fork: () => UtilityProcess,
    debug?: (message: string) => void,
): Promise<HappyAgentRendererSession> {
    let active = false;
    let closed = false;
    let proxyOperation = Promise.resolve();
    const configure = (port: number) => {
        // Never allow a direct connection to the virtual origin, even if the
        // utility is restarting or the proxy configuration fails to install.
        const pac = `function FindProxyForURL(url, host) { return host === "happy-agent" ? "PROXY 127.0.0.1:${String(port)}" : "DIRECT"; }`;
        proxyOperation = proxyOperation
            .catch(() => undefined)
            .then(async () => {
                await session.setProxy({
                    mode: "pac_script",
                    pacScript: `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac).toString("base64")}`,
                });
                // Chromium may reuse sockets opened under the previous PAC route.
                // Cut them before the new utility is made available to the frame gate.
                await session.closeAllConnections();
            });
        return proxyOperation;
    };
    const proxy = await happyAgentRendererUtilityProxyCreate({
        fork,
        ready: async ({ port }) => {
            await configure(port);
            if (!closed) active = true;
        },
        offline: () => {
            active = false;
            if (!closed) void configure(9).catch(() => undefined);
        },
        ...(debug ? { debug } : {}),
    });
    const windows = new Map<
        number,
        {
            readonly contents: WebContents;
            readonly document: string;
            readonly development: boolean;
            readonly mediaOnly: boolean;
        }
    >();
    // No DNS lookup or DIRECT fallback for happy-agent. Other origins use the
    // renderer's ordinary network path; guest sessions have their own proxies.
    const filter = { urls: ["*://happy-agent/*", "ws://happy-agent/*", "wss://happy-agent/*"] };
    const requestAllowed = (
        details: Pick<OnBeforeRequestListenerDetails, "url" | "webContentsId" | "frame">,
    ): boolean => {
        const window =
            details.webContentsId === undefined ? undefined : windows.get(details.webContentsId);
        const frame = details.frame;
        const url = new URL(details.url);
        return (
            active &&
            window !== undefined &&
            !window.contents.isDestroyed() &&
            frame !== null &&
            frame !== undefined &&
            !frame.detached &&
            frame === window.contents.mainFrame &&
            rendererNavigationAllowed(frame.url, window.document, window.development) &&
            (url.protocol === "http:" || url.protocol === "ws:") &&
            url.port === "" &&
            (!window.mediaOnly ||
                mediaPreviewAddressAllowed(details.url, [happyAgentRendererOrigin]))
        );
    };
    const gateTiming = (started: number, name: string) => {
        const elapsed = performance.now() - started;
        if (elapsed >= 20) debug?.(`Happy Agent main ${name} gate=${elapsed.toFixed(0)}ms`);
    };
    session.webRequest.onBeforeRequest(filter, (details, callback) => {
        const started = performance.now();
        callback({ cancel: !requestAllowed(details) });
        gateTiming(started, "request");
    });
    // Chromium suppresses interactive auth challenges for cross-origin images.
    // Authenticate trusted requests before sending them so the first image works
    // even if no API request has warmed the proxy's authentication cache yet.
    session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        const started = performance.now();
        if (!requestAllowed(details)) {
            callback({ cancel: true });
            gateTiming(started, "headers");
            return;
        }
        const requestHeaders = { ...details.requestHeaders };
        for (const name of Object.keys(requestHeaders))
            if (name.toLowerCase() === "proxy-authorization") delete requestHeaders[name];
        requestHeaders["Proxy-Authorization"] =
            `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
        callback({ requestHeaders });
        gateTiming(started, "headers");
    });
    const eventLoop = debug ? monitorEventLoopDelay({ resolution: 10 }) : undefined;
    eventLoop?.enable();
    const interval =
        eventLoop &&
        setInterval(() => {
            const maximumMs = eventLoop.max / 1e6;
            if (maximumMs >= 100)
                debug?.(`Happy Agent main event-loop stall max=${maximumMs.toFixed(0)}ms`);
            eventLoop.reset();
        }, 10_000);
    interval?.unref();
    return {
        proxy,
        windowRegister(contents, document, development, mediaOnly = false) {
            if (contents.session !== session)
                throw new Error("Happy Agent renderer session mismatch.");
            const id = contents.id;
            windows.set(id, { contents, document, development, mediaOnly });
            contents.once("destroyed", () => windows.delete(id));
            contents.on("login", (event, _details, authInfo, callback) => {
                if (
                    !active ||
                    !authInfo.isProxy ||
                    authInfo.host !== "127.0.0.1" ||
                    authInfo.port !== proxy.port
                )
                    return;
                event.preventDefault();
                // The request gate runs even after Chromium caches credentials.
                callback(proxy.username, proxy.password);
            });
        },
        close() {
            closed = true;
            active = false;
            if (interval) clearInterval(interval);
            eventLoop?.disable();
            windows.clear();
            proxy.close();
        },
    };
}
