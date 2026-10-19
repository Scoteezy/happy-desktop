import { changeCountLabel, compactCount } from "./countText";

export interface ChangeStatsProps {
    readonly added: number;
    readonly deleted: number;
    readonly className?: string;
    readonly "data-happy-desktop-ui"?: string;
}

/**
 * Git line totals as the compact pair a row ends with: `+12 −3`, a side that
 * changed nothing left out. Abbreviated for the column, exact for the reader
 * who is listening rather than looking. The owning row colours the pair when it
 * is selected or focused, the way a sidebar row does.
 */
export function ChangeStats(props: ChangeStatsProps) {
    return (
        <span
            className={["happy-change-stats", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui={props["data-happy-desktop-ui"] ?? "change-stats"}
        >
            {props.added > 0 ? (
                <span aria-hidden="true" data-tone="added">
                    +{compactCount(props.added)}
                </span>
            ) : null}
            {props.deleted > 0 ? (
                <span aria-hidden="true" data-tone="deleted">
                    −{compactCount(props.deleted)}
                </span>
            ) : null}
            {/* Out of flow, so the row's flex gap still falls between the two
                visible marks alone, and so the count stays readable to
                assistive technology while the marks are covered. */}
            <span className="happy-visually-hidden">
                {changeCountLabel(props.added, props.deleted)}
            </span>
        </span>
    );
}
