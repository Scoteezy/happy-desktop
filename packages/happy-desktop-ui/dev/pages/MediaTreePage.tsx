import { ConversationMedia } from "../../src/ConversationMedia";
import { conversationMediaHeight } from "../../src/conversationRowHeight";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { treeLayout, treeTool } from "./conversationMediaLayoutFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-304";

const items = treeTool.presentation?.type === "media" ? treeTool.presentation.items : [];

export function MediaTreePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A layout an agent wrote, drawn from closed typed nodes as React elements in a contained box; its height is measured off-screen at the row's width."
            title="MediaTree"
        >
            {[720, 420].map((measure, index) => (
                <Specimen
                    detail="heading, captioned two-up grid, full-width figure · tones and type steps from the theme"
                    key={measure}
                    label={`${String(measure)}px measure`}
                    number={String(index + 1).padStart(2, "0")}
                    stage="surface"
                >
                    <div style={{ width: `${String(measure)}px` }}>
                        <ConversationMedia
                            items={items}
                            layout={treeLayout}
                            onItemOpen={() => {}}
                        />
                    </div>
                    <DimensionRule
                        label={`${String(Math.round(conversationMediaHeight(items, measure, treeLayout) * 100) / 100)}px measured`}
                    />
                </Specimen>
            ))}
        </ComponentPage>
    );
}
