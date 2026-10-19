import { Button } from "./Button";
import { Composer } from "./Composer";
import { Icon } from "./Icon";

export type MakeStuffStage =
    | {
          kind: "request";
          text: string;
          onTextChange: (text: string) => void;
          onContinue: () => void;
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
    return (
        <div
            className="happy-make-stuff"
            data-happy-desktop-ui="make-stuff"
            data-stage={stage.kind}
        >
            <div className="happy-make-stuff__measure">
                <h1 className="happy-make-stuff__title">What would you like to make?</h1>
                {stage.kind === "request" ? (
                    <Composer
                        focusOnType={false}
                        onSend={stage.onContinue}
                        onValueChange={stage.onTextChange}
                        placeholder="A task, an idea, a list…"
                        value={stage.text}
                    />
                ) : (
                    <>
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
                            <div className="happy-make-stuff__context-line">
                                <Icon name="check" size={16} />
                                {stage.placement}
                            </div>
                        </div>
                        {stage.conflict ? (
                            <div className="happy-make-stuff__conflict" role="status">
                                <Icon name="alert" size={14} />
                                <span>Similar work already running: {stage.conflict.label}</span>
                                <Button
                                    onClick={stage.conflict.onOpen}
                                    size="small"
                                    variant="ghost"
                                >
                                    Open existing
                                </Button>
                            </div>
                        ) : null}
                        <div className="happy-make-stuff__actions">
                            <Button onClick={stage.onStart}>Start</Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
