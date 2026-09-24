import { SidebarSearchField } from "../../src/SidebarSearchField";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-286";

export function SidebarSearchFieldPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The row under the sidebar's heading when search is on: one field on the rows' inset. Escape closes it, and so does leaving it empty."
            title="SidebarSearchField"
        >
            <Specimen detail="Nothing typed yet." label="Empty" number="01">
                <div style={{ width: 260 }}>
                    <SidebarSearchField
                        onClose={() => undefined}
                        onValueChange={() => undefined}
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen detail="A query in the field." label="Typed" number="02">
                <div style={{ width: 260 }}>
                    <SidebarSearchField
                        onClose={() => undefined}
                        onValueChange={() => undefined}
                        value="token rotation"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
