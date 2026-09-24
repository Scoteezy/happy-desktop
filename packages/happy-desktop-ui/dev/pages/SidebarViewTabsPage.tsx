import { SidebarViewTabs } from "../../src/SidebarViewTabs";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

export function SidebarViewTabsPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The two tabs that choose which list the sidebar shows: every workspace, or what is waiting followed by everything recent. Drawn on the sidebar row's grid so their icons share a line with the rows beneath."
            title="SidebarViewTabs"
        >
            <Specimen
                detail="The workspace list is up; nothing is waiting."
                label="Workspaces"
                number="01"
            >
                <div style={{ width: 240 }}>
                    <SidebarViewTabs onViewSelect={() => undefined} view="workspaces" />
                </div>
            </Specimen>
            <Specimen
                detail="The attention list is up and wears the queue's count."
                label="Attention"
                number="02"
            >
                <div style={{ width: 240 }}>
                    <SidebarViewTabs
                        attentionCount={3}
                        onViewSelect={() => undefined}
                        view="attention"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
