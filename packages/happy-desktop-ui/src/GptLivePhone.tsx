import type { GptLiveSnapshot } from "happy-desktop-state";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

export interface GptLivePhoneProps {
    state: GptLiveSnapshot;
    onStart(): void;
    onEnd(): void;
    onMessageConfirm(actionId: string): void;
    onMessageCancel(actionId: string): void;
}

/** A footer phone and the exact message awaiting the person's Send decision. */
export function GptLivePhone(props: GptLivePhoneProps) {
    const { state } = props;
    const connecting = state.status === "connecting" || state.status === "checking";
    const active = state.status === "active";
    const label = active ? "End voice call" : connecting ? "Cancel voice call" : "Start voice call";
    const confirmation = state.confirmation;
    return (
        <>
            <Tooltip label={state.error ?? label}>
                <Button
                    aria-label={label}
                    aria-pressed={active}
                    className="happy-gpt-live-phone"
                    data-status={state.status}
                    iconOnly
                    onClick={(event) => {
                        if (event.isTrusted) (active || connecting ? props.onEnd : props.onStart)();
                    }}
                    size="small"
                    variant="ghost"
                >
                    {connecting ? <Spinner size={14} /> : <Icon name="call" size={14} />}
                </Button>
            </Tooltip>
            {confirmation ? (
                <div
                    aria-label="Review voice message"
                    className="happy-gpt-live-phone__confirmation"
                    data-happy-desktop-ui="gpt-live-confirmation"
                    role="dialog"
                >
                    <span className="happy-gpt-live-phone__target">
                        {confirmation.connectionLabel} · {confirmation.targetLabel}
                    </span>
                    <p className="happy-gpt-live-phone__message">{confirmation.text}</p>
                    <div className="happy-gpt-live-phone__actions">
                        <Button
                            disabled={state.confirmationSending}
                            onClick={() => props.onMessageCancel(confirmation.actionId)}
                            size="small"
                            variant="ghost"
                        >
                            Keep as draft
                        </Button>
                        <Button
                            loading={state.confirmationSending}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") event.preventDefault();
                            }}
                            onClick={(event) => {
                                if (event.isTrusted) props.onMessageConfirm(confirmation.actionId);
                            }}
                            size="small"
                        >
                            Send
                        </Button>
                    </div>
                </div>
            ) : null}
        </>
    );
}
