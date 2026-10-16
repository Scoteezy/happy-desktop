import type { ConversationError } from "happy-desktop-state";

/** The card and exact row geometry share these execution/source labels. */
export function conversationErrorDetails(error: ConversationError | undefined): readonly string[] {
    if (!error) return [];
    const details: string[] = [];
    if (error.mode) {
        const mode = error.mode;
        details.push(
            `Provider: ${mode.providerId}${mode.providerType ? ` (${mode.providerType})` : ""}`,
        );
        if (mode.account)
            details.push(
                `Account: ${mode.account.label ? `${mode.account.label} (${mode.account.id})` : mode.account.id}`,
            );
        details.push(`Model: ${error.modelName ?? mode.modelId}`);
    }
    const source = error.credentialSource;
    if (source) {
        const label =
            source.kind === "native_login"
                ? "Native sign-in"
                : source.kind === "configuration"
                  ? "Configuration"
                  : source.kind === "environment"
                    ? "Environment"
                    : "Credential source";
        details.push(`${label}: ${source.location}`);
        if (source.host !== null) details.push(`Host: ${source.host}`);
    }
    return details;
}
