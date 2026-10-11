import { afterEach, expect, it, vi } from "vitest";
import { happyAgentHostServicesCreate } from "./happyAgentHostServices";

// Host services import the app package for its terminal connection only, which
// brings the whole renderer UI with it; no terminal is opened here.
vi.mock("happy-desktop-app", () => ({}));

afterEach(() => {
    vi.unstubAllGlobals();
});

/** The host services of a desktop window whose bridge answers `/artifact-site` with `response`. */
function desktopWith(response: Response) {
    vi.stubGlobal("window", { happyDesktop: {} });
    const fetch = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetch);
    return { services: happyAgentHostServicesCreate("http://127.0.0.1:9/capability"), fetch };
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

it("opens an artifact version as a site where the app serves one", async () => {
    const { services, fetch } = desktopWith(
        json(200, { url: "happy-artifact://k3v8w2m9q4x7z1c5b6n0p2r8-v2/index.html" }),
    );
    await expect(services.artifactSiteOpen?.("k3v8w2m9q4x7z1c5b6n0p2r8", 2)).resolves.toEqual({
        type: "opened",
        url: "happy-artifact://k3v8w2m9q4x7z1c5b6n0p2r8-v2/index.html",
    });
    expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:9/capability/artifact-site?artifactId=k3v8w2m9q4x7z1c5b6n0p2r8&version=2",
    );
});

it("says the app is too old when its bridge has no artifact site route at all", async () => {
    // Exactly what an app from before artifact sites answers an unknown route with.
    const { services } = desktopWith(
        new Response(null, { status: 404, headers: { "cache-control": "no-store" } }),
    );
    await expect(services.artifactSiteOpen?.("k3v8w2m9q4x7z1c5b6n0p2r8", 1)).resolves.toEqual({
        type: "app-outdated",
    });
});

it("reports the app's own refusal, even a 404, as the failure it is", async () => {
    const { services } = desktopWith(json(404, { error: "Artifact version 9 was not found." }));
    await expect(services.artifactSiteOpen?.("k3v8w2m9q4x7z1c5b6n0p2r8", 9)).rejects.toThrow(
        "Artifact version 9 was not found.",
    );
    const unavailable = desktopWith(
        json(501, { error: "This desktop cannot serve an artifact as a page." }),
    );
    await expect(
        unavailable.services.artifactSiteOpen?.("k3v8w2m9q4x7z1c5b6n0p2r8", 1),
    ).rejects.toThrow("This desktop cannot serve an artifact as a page.");
});

it("offers no artifact sites outside the desktop window", () => {
    vi.stubGlobal("window", {});
    expect(happyAgentHostServicesCreate("http://127.0.0.1:9/capability").artifactSiteOpen).toBe(
        undefined,
    );
});
