import type { WorkTranscriptRow } from "../../src/WorkTranscript";

export const dayPairingAnswer = "Keep the existing response and defer the attachment field.";

export function dayCoordination(resolved: boolean, onBackendOpen: () => void): WorkTranscriptRow {
    return {
        id: "pairing-contract",
        kind: "coordination",
        title: "Tailcat pairing contract",
        text: resolved
            ? "Existing pairing response confirmed. Steve's connector is continuing; the attachment field is deferred."
            : "Steve's connector is waiting. Keep the existing pairing response and defer the attachment field?",
        links: [{ id: "backend", label: "Open Surfaces backend", onOpen: onBackendOpen }],
    };
}
