import { Button } from "./Button";

export type WorkTabControlsProps = {
    /** Whether the work floaty is showing over the conversation. */
    floatyOpen: boolean;
    onFloatyOpenChange: (open: boolean) => void;
};

/**
 * C-301 — the trailing controls of an integrated tab band: the work floaty's
 * list toggle. The shell owns the pane toggle at the window's far edge.
 */
export function WorkTabControls(props: WorkTabControlsProps) {
    return (
        <span className="happy-work-tab-controls" data-happy-desktop-ui="work-tab-controls">
            <Button
                aria-label={props.floatyOpen ? "Hide task activity" : "Show task activity"}
                aria-pressed={props.floatyOpen}
                className="happy-work-tab-controls__toggle"
                icon="list"
                iconOnly
                onClick={() => props.onFloatyOpenChange(!props.floatyOpen)}
                size="small"
                variant="ghost"
            />
        </span>
    );
}
