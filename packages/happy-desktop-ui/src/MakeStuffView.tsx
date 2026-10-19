import { Button } from "./Button";
import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import { Icon } from "./Icon";
import { StemCell } from "./StemCell";

export type MakeStuffStage =
    | {
          kind: "request";
          id: string;
          placement: "automatic" | "section";
          composer: ConversationDockProps;
      }
    | {
          kind: "context";
          text: string;
          project: string;
          related: readonly { id: string; label: string }[];
          placement: string;
          conflict?: { label: string; onOpen: () => void };
          onStart: () => void;
      };

export type MakeStuffViewProps = { stage: MakeStuffStage };

/** One intent becomes work or an artifact after its context has been resolved. */
export function MakeStuffView({ stage }: MakeStuffViewProps) {
    if (stage.kind === "request")
        return (
            <div
                className="happy-make-stuff"
                data-happy-desktop-ui="make-stuff"
                data-stage="request"
            >
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
    return (
        <div
            className="happy-make-stuff"
            data-happy-desktop-ui="make-stuff"
            data-stage={stage.kind}
        >
            <div className="happy-make-stuff__measure">
                <h1 className="happy-make-stuff__title">What would you like to make?</h1>
                <p className="happy-make-stuff__request">{stage.text}</p>
                <div className="happy-make-stuff__context">
                    <div className="happy-make-stuff__context-line">
                        <Icon name="code" size={16} />
                        <strong>{stage.project}</strong>
                    </div>
                    {stage.related.map((related) => (
                        <div className="happy-make-stuff__context-line" key={related.id}>
                            <Icon name="chat" size={16} />
                            {related.label}
                        </div>
                    ))}
                </div>
                {stage.conflict ? (
                    <div className="happy-make-stuff__conflict" role="status">
                        <Icon name="alert" size={14} />
                        <span>Similar work already running: {stage.conflict.label}</span>
                        <Button onClick={stage.conflict.onOpen} size="small" variant="ghost">
                            Open existing
                        </Button>
                    </div>
                ) : null}
                <div className="happy-make-stuff__actions">
                    <p className="happy-make-stuff__placement">{stage.placement}</p>
                    <Button onClick={stage.onStart}>Start</Button>
                </div>
            </div>
        </div>
    );
}
