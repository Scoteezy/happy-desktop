/**
 * What a reference inside a Markdown or HTML entry points at.
 *
 * - `file` — a file of the same version, by its path in the artifact.
 * - `web` — an absolute `http:`, `https:`, or `mailto:` address outside it.
 * - `fragment` — a place inside the entry itself.
 * - `none` — anything else: a reference that leaves the version's files, a
 *   `javascript:` or `data:` address, or text that is not a URL at all.
 */
export type HappyAgentArtifactReference =
    | { readonly type: "file"; readonly path: string; readonly fragment?: string }
    | { readonly type: "web"; readonly url: string }
    | { readonly type: "fragment"; readonly fragment: string }
    | { readonly type: "none" };

/*
 * Every file of a version is served under one prefix,
 * `/v0/artifacts/:id/versions/:number/files/`, so the daemon defines a relative
 * reference as the browser resolving it against the entry's own URL. This
 * resolves against a stand-in origin laid out the same way — `.invalid` is
 * reserved and never resolves — which gives exactly the browser's answer
 * (`./`, `../`, `?query`, percent-encoding and all) and then reads the path
 * back out of the files prefix. A reference the browser would take outside
 * that prefix is outside the artifact.
 */
const REFERENCE_ORIGIN = "https://artifact.invalid";
const FILES_PREFIX = "/files/";
const WEB_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function pathEncode(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Resolves one reference written in the entry at `entryPath` the way a browser
 * would resolve it against the entry's file URL.
 */
export function happyAgentArtifactReferenceResolve(
    entryPath: string,
    reference: string,
): HappyAgentArtifactReference {
    const trimmed = reference.trim();
    if (trimmed.length === 0) return { type: "none" };
    if (trimmed.startsWith("#")) return { type: "fragment", fragment: trimmed.slice(1) };
    let url: URL;
    try {
        url = new URL(trimmed, `${REFERENCE_ORIGIN}${FILES_PREFIX}${pathEncode(entryPath)}`);
    } catch {
        return { type: "none" };
    }
    if (url.origin !== REFERENCE_ORIGIN)
        return WEB_PROTOCOLS.has(url.protocol) ? { type: "web", url: url.href } : { type: "none" };
    if (!url.pathname.startsWith(FILES_PREFIX)) return { type: "none" };
    const segments: string[] = [];
    for (const encoded of url.pathname.slice(FILES_PREFIX.length).split("/")) {
        let segment: string;
        try {
            segment = decodeURIComponent(encoded);
        } catch {
            return { type: "none" };
        }
        // An empty segment is a folder or a doubled slash, and a decoded slash
        // would name a different path than the one written: neither is a file
        // the daemon will serve, so neither is offered as one.
        if (segment.length === 0 || segment.includes("/")) return { type: "none" };
        segments.push(segment);
    }
    const path = segments.join("/");
    if (path === entryPath && url.hash.length > 1)
        return { type: "fragment", fragment: url.hash.slice(1) };
    return url.hash.length > 1
        ? { type: "file", path, fragment: url.hash.slice(1) }
        : { type: "file", path };
}
