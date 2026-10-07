/** An opaque service-tier ID supplied by Happy Agent, submitted unchanged. */
export type HappyAgentServiceTier = string;

/** Projects the wire's nullable default into an optional product selection. */
export function happyAgentServiceTierFromWire(
    value: string | null | undefined,
): HappyAgentServiceTier | undefined {
    return value ?? undefined;
}

/** Sends the exact selected ID, or null to select the agent's default route. */
export function happyAgentServiceTierToWire(
    value: HappyAgentServiceTier | undefined,
): string | null {
    return value ?? null;
}
