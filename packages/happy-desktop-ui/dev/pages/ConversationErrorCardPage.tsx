import { ConversationErrorCard } from "../../src/ConversationErrorCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-283";

export function ConversationErrorCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Full diagnostic text stays readable in the transcript: paragraphs and indentation are preserved, long identifiers wrap, and Copy retains the original text."
            title="Conversation error card"
        >
            <Specimen
                detail="Heading and reason stay separate; hover or focus reveals the full-text copy action."
                label="Short failure"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: "760px" }}>
                    <ConversationErrorCard
                        reason="The provider connection closed."
                        title="Failure"
                    />
                    <DimensionRule label="760 px wide · 14/20 text · 4 px heading gap" />
                </div>
            </Specimen>
            <Specimen
                detail="Hard breaks, blank paragraphs, and indentation remain visible."
                label="Full multiline diagnostic"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", width: "760px" }}>
                    <ConversationErrorCard
                        reason={
                            "The provider could not complete this request.\n\nDetails:\n  The selected account is no longer signed in.\n  The conversation and unsent draft have been preserved.\n\nSign in to the provider, then submit your message again."
                        }
                        title="Failure"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Warning treatment, a wrapped heading, and an unbroken request identifier."
                label="Retry in a narrow conversation pane"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: "360px" }}>
                    <ConversationErrorCard
                        reason={
                            "The connection was interrupted while waiting for a response.\n\nRequest: provider-request-with-an-unbroken-identifier-that-must-stay-fully-readable-without-horizontal-scrolling"
                        }
                        title="Connection Error (Attempt 2)"
                        tone="warning"
                    />
                    <DimensionRule label="360 px pane · wraps without a horizontal scrollport" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
