import { useState } from "react";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-009b";

const items: SidebarItem[] = [
    { id: "chief", kind: "project", label: "Chief of Staff", avatarId: "chief", status: "working" },
    {
        id: "trip",
        depth: 1,
        kind: "workspace",
        label: "Plan the autumn trip",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        status: "working",
        reorderable: false,
    },
    {
        id: "flights",
        depth: 2,
        kind: "workspace",
        label: "Compare flights",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        status: "working",
        reorderable: false,
    },
    {
        id: "hotels",
        depth: 2,
        kind: "workspace",
        label: "Shortlist hotels",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        unread: true,
        reorderable: false,
    },
    {
        id: "invoices",
        depth: 1,
        kind: "workspace",
        label: "Reconcile invoices",
        status: "waiting",
        reorderable: false,
    },
    {
        id: "receipts",
        depth: 2,
        kind: "workspace",
        label: "Collect receipts",
        reorderable: false,
    },
    { id: "builder", kind: "project", label: "Builder", avatarId: "builder" },
    {
        id: "research",
        depth: 1,
        kind: "workspace",
        label: "Research the new API",
        contextAvatars: [{ id: "happy", label: "Project: Happy", initials: "H" }],
        reorderable: false,
    },
];

export function BotSubtasksPage() {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [selected, setSelected] = useState("hotels");
    return (
        <ComponentPage
            number={componentNumber}
            title="Bot subtasks"
            summary="Active interactive subtasks belong beneath their parent bot, recursively. Each keeps its own activity, unread state, and conversation identity."
        >
            <Specimen
                number="01"
                label="Parent tasks and active subtasks"
                stage="app"
                detail="Single-chat tasks · 16px project and bot avatars in the leading lane"
            >
                <div style={{ display: "flex", width: 320, height: 600 }}>
                    <Sidebar
                        style={{ width: "100%" }}
                        title="Happy"
                        activeItemId={selected}
                        onItemSelect={setSelected}
                        onItemCollapseToggle={(id) =>
                            setCollapsed((previous) => {
                                const next = new Set(previous);
                                if (!next.delete(id)) next.add(id);
                                return next;
                            })
                        }
                        sections={[
                            {
                                id: "bots",
                                label: "Bots",
                                items: items.map((item) =>
                                    collapsed.has(item.id) ? { ...item, collapsed: true } : item,
                                ),
                            },
                            {
                                id: "projects",
                                label: "Projects",
                                items: [
                                    {
                                        id: "household",
                                        kind: "project",
                                        label: "Household",
                                        initials: "H",
                                    },
                                    {
                                        id: "trip-workspace",
                                        kind: "workspace",
                                        depth: 1,
                                        label: "Autumn trip",
                                        contextAvatars: [
                                            {
                                                id: "chief",
                                                label: "Bot: Chief of Staff",
                                                avatarId: "chief",
                                            },
                                        ],
                                    },
                                    { id: "happy", kind: "project", label: "Happy", initials: "H" },
                                    {
                                        id: "api-workspace",
                                        kind: "workspace",
                                        depth: 1,
                                        label: "API integration",
                                        contextAvatars: [
                                            {
                                                id: "builder",
                                                label: "Bot: Builder",
                                                avatarId: "builder",
                                            },
                                        ],
                                    },
                                ],
                            },
                        ]}
                    />
                </div>
                <DimensionRule label="32px rows · stable agent IDs · no task reparenting or child reordering" />
            </Specimen>
        </ComponentPage>
    );
}
