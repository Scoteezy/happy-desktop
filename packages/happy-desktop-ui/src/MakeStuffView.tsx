import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import { StemCell } from "./StemCell";
import { WorkTranscript, type WorkTranscriptRow } from "./WorkTranscript";

export type MakeStuffStage =
    | {
          kind: "request";
          id: string;
          composer: ConversationDockProps;
      }
    | {
          kind: "context";
          rows: readonly WorkTranscriptRow[];
          composer: ConversationDockProps;
      };

export type MakeStuffViewProps = { stage: MakeStuffStage };

export type MakeStuffIntroProps = {
    /** The new item's identity, so its stem cell is the one its row wears. */
    id: string;
};

/** C-302 — new work before its first message: its stem cell and one short line. */
export function MakeStuffIntro(props: MakeStuffIntroProps) {
    return (
        <div className="happy-make-stuff__empty" data-happy-desktop-ui="make-stuff-intro">
            <StemCell id={props.id} size={64} />
            <div className="happy-make-stuff__explanation">
                <p>Say what it is — it’ll find its place.</p>
            </div>
        </div>
    );
}

/** One intent becomes work or an artifact after its context has been resolved. */
export function MakeStuffView({ stage }: MakeStuffViewProps) {
    if (stage.kind === "context")
        return <WorkTranscript rows={stage.rows} composer={stage.composer} />;
    return (
        <div className="happy-make-stuff" data-happy-desktop-ui="make-stuff" data-stage="request">
            <MakeStuffIntro id={stage.id} />
            <ConversationDock {...stage.composer} />
        </div>
    );
}
