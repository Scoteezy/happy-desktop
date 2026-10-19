import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import { StemCell } from "./StemCell";
import { WorkTranscript, type WorkTranscriptRow } from "./WorkTranscript";

export type MakeStuffStage =
    | {
          kind: "request";
          id: string;
          placement: "automatic" | "section";
          composer: ConversationDockProps;
      }
    | {
          kind: "context";
          rows: readonly WorkTranscriptRow[];
          composer: ConversationDockProps;
      };

export type MakeStuffViewProps = { stage: MakeStuffStage };

/** One intent becomes work or an artifact after its context has been resolved. */
export function MakeStuffView({ stage }: MakeStuffViewProps) {
    if (stage.kind === "context")
        return <WorkTranscript rows={stage.rows} composer={stage.composer} />;
    return (
        <div className="happy-make-stuff" data-happy-desktop-ui="make-stuff" data-stage="request">
            <div className="happy-make-stuff__empty">
                <StemCell id={stage.id} size={64} />
                <div className="happy-make-stuff__explanation">
                    <p>
                        {stage.placement === "section"
                            ? "Say what this is — I'll shape it."
                            : "Say what this is — I'll shape it and put it where it belongs."}
                    </p>
                    {stage.placement === "automatic" ? (
                        <p>Want it somewhere specific? Just say “under Release Readiness”.</p>
                    ) : null}
                </div>
            </div>
            <ConversationDock {...stage.composer} />
        </div>
    );
}
