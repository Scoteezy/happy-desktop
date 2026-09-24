import { SidebarFilterBar } from "../../src/SidebarFilterBar";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

export function SidebarFilterBarPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The two switches that keep the sidebar to what is being worked on: leave out idle rows, leave out resting bots. Pressed controls rather than a menu, with a count of what they are hiding."
            title="SidebarFilterBar"
        >
            <Specimen detail="Nothing filtered." label="At rest" number="01">
                <div style={{ width: 240 }}>
                    <SidebarFilterBar
                        hideBots={false}
                        hideIdle={false}
                        onHideBotsToggle={() => undefined}
                        onHideIdleToggle={() => undefined}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Both filters pressed; the bar says how many rows it is hiding."
                label="Filtering"
                number="02"
            >
                <div style={{ width: 240 }}>
                    <SidebarFilterBar
                        hiddenCount={7}
                        hideBots
                        hideIdle
                        onHideBotsToggle={() => undefined}
                        onHideIdleToggle={() => undefined}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
