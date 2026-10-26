/** Bound display work for a domain even when its metadata has thousands of accounts. */
export function browserImportMetadataSummary(values: readonly string[]): string {
    const visible = values.slice(0, 3).join(", ");
    return values.length > 3 ? `${visible} + ${String(values.length - 3)} more` : visible;
}
