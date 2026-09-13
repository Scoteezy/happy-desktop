import type { HappyAgentClient, HappyIntegration } from "@slopus/happy-agent-client";

/** Refresh the existing native pairing only after the CLI confirms account and RPC readiness. */
export async function happyMobileLegacyLink(
    client: Pick<HappyAgentClient, "getHappyIntegration" | "startHappyIntegration">,
    connectLegacyCli: () => Promise<void>,
    current: () => boolean,
): Promise<HappyIntegration | undefined> {
    await connectLegacyCli();
    if (!current()) return undefined;
    const saved = await client.getHappyIntegration();
    if (!current()) return undefined;
    if (!saved.integration.configured)
        throw new Error(
            "Happy Mobile was disconnected during setup. Reconnect it from Mobile Access settings.",
        );
    const refreshed = await client.startHappyIntegration();
    if (!current()) return undefined;
    if (!refreshed.integration.configured)
        throw new Error("Happy Mobile could not confirm the terminal connection. Try again.");
    return refreshed.integration;
}
