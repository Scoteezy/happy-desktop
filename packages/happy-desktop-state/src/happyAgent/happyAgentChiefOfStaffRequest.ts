import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/**
 * Something the reader asks the Chief of Staff for from outside its
 * conversation. Each is written into that conversation's draft as a labelled
 * request, never sent on the reader's behalf.
 */
export type HappyAgentChiefOfStaffRequest =
    | {
          /** A conversation is set to an account that no longer serves it. */
          readonly kind: "accountUnavailable";
          readonly providerId: string;
          readonly modelId: string;
          /** Whether the account was switched off or removed from the configuration. */
          readonly reason: "disabled" | "missing";
          /** The conversation set to it; absent for a conversation not yet started. */
          readonly sessionId?: HappyAgentSessionId;
      }
    | { readonly kind: "accountsManage" };

/** The exact draft text a request adds, so a surface can show it before asking. */
export function happyAgentChiefOfStaffRequestText(request: HappyAgentChiefOfStaffRequest): string {
    switch (request.kind) {
        case "accountUnavailable":
            return [
                `Troubleshooting: account unavailable (${request.providerId})`,
                request.reason === "disabled"
                    ? `A conversation is set to the ${request.providerId} account, which is switched off on this Happy Agent, so nothing is routed to it.`
                    : `A conversation is set to the ${request.providerId} account, which is no longer configured on this Happy Agent.`,
                [
                    `Account: ${request.providerId}, model ${request.modelId}`,
                    ...(request.sessionId === undefined ? [] : [`Agent: ${request.sessionId}`]),
                ].join("\n"),
                "Please help me manage my connected accounts: bring this account back, or tell me which account to move the conversation to. Use the multiple accounts recipe, and ask before changing anything.",
            ].join("\n\n");
        case "accountsManage":
            return [
                "Manage connected accounts",
                "I want to manage my connected accounts: add an account, pool accounts, or hide some from the picker. Use the multiple accounts recipe and help me set it up.",
            ].join("\n\n");
    }
}
