/**
 * Product names for the three reserved CLI provider slots. These are display
 * labels only: configured account IDs, including custom accounts and pools,
 * remain unchanged. A manually overridden built-in slot keeps its slot label.
 */
export function happyAgentProviderName(providerId: string): string {
    switch (providerId) {
        case "claude":
            return "Current Claude CLI";
        case "codex":
            return "Current Codex CLI";
        case "grok":
            return "Current Grok CLI";
        default:
            return providerId;
    }
}
