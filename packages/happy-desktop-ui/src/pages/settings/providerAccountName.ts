/** The daemon's friendly account name, or a readable configured ID when unnamed. */
export function providerAccountName(providerId: string, configuredName?: string): string {
    if (configuredName !== undefined) return configuredName;
    return (
        providerId
            .split(/[_-]/u)
            .filter(Boolean)
            .map((part) => (part[0] ?? "").toLocaleUpperCase() + part.slice(1))
            .join(" ") || providerId
    );
}
