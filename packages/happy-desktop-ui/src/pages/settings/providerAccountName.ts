import { happyAgentProviderName } from "happy-desktop-state";

/** Settings share the built-in CLI names and retain custom account title casing. */
export function providerAccountName(providerId: string): string {
    const name = happyAgentProviderName(providerId);
    if (name !== providerId) return name;
    return (
        providerId
            .split(/[_-]/u)
            .filter(Boolean)
            .map((part) => (part[0] ?? "").toLocaleUpperCase() + part.slice(1))
            .join(" ") || providerId
    );
}
