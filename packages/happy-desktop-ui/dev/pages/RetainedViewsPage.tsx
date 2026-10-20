import { EmptyState } from "../../src/EmptyState";
import { RetainedViews } from "../../src/RetainedViews";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-300";

const VIEWS = [
    {
        id: "first",
        content: (
            <EmptyState
                description="Kept mounted while another view is on screen."
                icon="chat"
                size="panel"
                title="First conversation"
            />
        ),
    },
    {
        id: "second",
        content: (
            <EmptyState
                description="Shown again as it was left, without being built anew."
                icon="chat"
                size="panel"
                title="Second conversation"
            />
        ),
    },
];

function Stage(props: { activeId?: string }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "280px",
                width: "560px",
            }}
        >
            <RetainedViews
                {...(props.activeId === undefined ? {} : { activeId: props.activeId })}
                views={VIEWS}
            />
        </div>
    );
}

export function RetainedViewsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Keeps recently shown views mounted out of sight, so showing one again reveals it as it was left."
            title="Retained views"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="two views mounted · the second on screen fills the column"
                    label="One on screen"
                    number="T-01"
                    stage="surface"
                >
                    <div style={{ padding: "24px" }}>
                        <Stage activeId="second" />
                        <DimensionRule label="560 × 280 · one view takes the whole column" />
                    </div>
                </Specimen>
                <Specimen
                    detail="no active view · every view kept out of sight, leaving no box"
                    label="All out of sight"
                    number="T-02"
                    stage="surface"
                >
                    <div style={{ padding: "24px" }}>
                        <Stage />
                        <DimensionRule label="nothing on screen, nothing unmounted" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
