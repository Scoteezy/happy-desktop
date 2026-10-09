import { SidebarListBar } from "../../src/SidebarListBar";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

export function SidebarListBarPage() {
    const idle = {
        onSearchClose: () => undefined,
        onSearchOpen: () => undefined,
        onSearchQueryUpdate: () => undefined,
        onViewSelect: () => undefined,
    };
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The row that heads the sidebar's list: the two list names, the bell with the waiting count, and search, which takes the whole row when it opens."
            title="SidebarListBar"
        >
            <Specimen
                detail="The workspace list is up; nothing waiting."
                label="Workspaces"
                number="01"
            >
                <div style={{ width: 260 }}>
                    <SidebarListBar {...idle} searchOpen={false} searchQuery="" view="workspaces" />
                </div>
            </Specimen>
            <Specimen
                detail="The attention list is up and three are waiting."
                label="Attention"
                number="02"
            >
                <div style={{ width: 260 }}>
                    <SidebarListBar
                        {...idle}
                        attentionCount={3}
                        searchOpen={false}
                        searchQuery=""
                        view="attention"
                    />
                </div>
            </Specimen>
            <Specimen detail="Search has taken the row." label="Searching" number="03">
                <div style={{ width: 260 }}>
                    <SidebarListBar
                        {...idle}
                        attentionCount={3}
                        searchOpen
                        searchQuery="token rotation"
                        view="workspaces"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
