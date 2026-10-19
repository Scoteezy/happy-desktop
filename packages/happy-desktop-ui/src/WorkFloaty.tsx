import { Icon, type IconName } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { Spinner } from "./Spinner";

export type WorkFloatyItem = {
    id: string;
    label: string;
    icon: IconName;
    imageMark?: { src: string; alt?: string };
    detail?: string;
} & (
    | { kind: "helper"; status: "running" | "waiting" | "complete" | "replaced" | "failed" }
    | { kind: "artifact" }
);

export type WorkFloatyProps = {
    open: boolean;
    activeItems: readonly WorkFloatyItem[];
    historyItems: readonly WorkFloatyItem[];
    historyExpanded: boolean;
    onHistoryExpandedChange: (expanded: boolean) => void;
    onItemOpen: (id: string) => void;
};

/** A task's current collaborators and outputs, with past activity one level down. */
export function WorkFloaty(props: WorkFloatyProps) {
    if (!props.open) return null;
    const row = (item: WorkFloatyItem) => (
        <button
            className="happy-work-floaty__item"
            key={item.id}
            onClick={() => props.onItemOpen(item.id)}
            type="button"
        >
            {item.imageMark ? (
                <img
                    alt={item.imageMark.alt ?? ""}
                    className="happy-work-floaty__mark"
                    src={item.imageMark.src}
                />
            ) : (
                <Icon name={item.icon} size={16} />
            )}
            <span className="happy-work-floaty__identity">
                <span className="happy-work-floaty__name">{item.label}</span>
                {item.detail ? (
                    <span className="happy-work-floaty__detail">{item.detail}</span>
                ) : null}
            </span>
            {item.kind === "helper" && item.status === "running" ? (
                <Spinner frame={0} size={12} tone="muted" label={`${item.label} is working`} />
            ) : item.kind === "helper" && item.status === "waiting" ? (
                <Icon name="clock" size={12} aria-label={`${item.label} is waiting`} />
            ) : null}
        </button>
    );
    return (
        <aside
            aria-label="Task activity"
            className="happy-work-floaty"
            data-happy-desktop-ui="work-floaty"
        >
            <ScrollArea>
                <div className="happy-work-floaty__content">
                    <div className="happy-work-floaty__items">{props.activeItems.map(row)}</div>
                    <button
                        aria-expanded={props.historyExpanded}
                        className="happy-work-floaty__history-toggle"
                        onClick={() => props.onHistoryExpandedChange(!props.historyExpanded)}
                        type="button"
                    >
                        <Icon
                            name={props.historyExpanded ? "chevron-down" : "chevron-right"}
                            size={12}
                        />
                        History
                    </button>
                    {props.historyExpanded ? (
                        <div className="happy-work-floaty__items">
                            {props.historyItems.map(row)}
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}
