import { SidebarFilterBar } from "../../src/SidebarFilterBar";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

export function SidebarFilterBarPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The switch between the sidebar's two lists, and under the workspace list, the two switches that keep it to what is being worked on: leave out idle rows, leave out resting bots. Pressed controls rather than a menu, with a count of what they are hiding."
            title="SidebarFilterBar"
        >
            <Specimen detail="Workspace list, nothing filtered." label="At rest" number="01">
                <div style={{ width: 240 }}>
                    <SidebarFilterBar
                        hideBots={false}
                        hideIdle={false}
                        onHideBotsToggle={() => undefined}
                        onHideIdleToggle={() => undefined}
                        onViewSelect={() => undefined}
                        view="workspaces"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Both filters pressed; the bar says how many rows it is hiding, and the attention segment wears the queue's count."
                label="Filtering"
                number="02"
            >
                <div style={{ width: 240 }}>
                    <SidebarFilterBar
                        attentionCount={3}
                        hiddenCount={7}
                        hideBots
                        hideIdle
                        onHideBotsToggle={() => undefined}
                        onHideIdleToggle={() => undefined}
                        onViewSelect={() => undefined}
                        view="workspaces"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="The attention list is up, so the filters stand down."
                label="Attention"
                number="03"
            >
                <div style={{ width: 240 }}>
                    <SidebarFilterBar
                        attentionCount={3}
                        hideBots={false}
                        hideIdle={false}
                        onHideBotsToggle={() => undefined}
                        onHideIdleToggle={() => undefined}
                        onViewSelect={() => undefined}
                        view="attention"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
