import { SidebarHeaderControls } from "../../src/SidebarHeaderControls";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

export function SidebarHeaderControlsPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The two controls at the trailing edge of the sidebar's heading: a search that filters the list to the sessions it names, and a bell that switches the list to what is waiting. The bell wears the count."
            title="SidebarHeaderControls"
        >
            <Specimen detail="Nothing waiting, nothing on." label="At rest" number="01">
                <SidebarHeaderControls
                    attentionOn={false}
                    onAttentionToggle={() => undefined}
                    onSearchToggle={() => undefined}
                    searchOpen={false}
                />
            </Specimen>
            <Specimen detail="Three waiting; the bell says so." label="Waiting" number="02">
                <SidebarHeaderControls
                    attentionCount={3}
                    attentionOn={false}
                    onAttentionToggle={() => undefined}
                    onSearchToggle={() => undefined}
                    searchOpen={false}
                />
            </Specimen>
            <Specimen
                detail="Attention on takes the accent; search open is a pressed control."
                label="Both on"
                number="03"
            >
                <SidebarHeaderControls
                    attentionCount={12}
                    attentionOn
                    onAttentionToggle={() => undefined}
                    onSearchToggle={() => undefined}
                    searchOpen
                />
            </Specimen>
        </ComponentPage>
    );
}
