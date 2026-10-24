import { useState } from "react";
import type { SidebarItem, SidebarReorder } from "../../src/Sidebar";
import { SidebarProposal, type SidebarProposalStatus } from "../../src/SidebarProposal";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-311";

const V1: SidebarItem[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "Create" },
    { emoji: "🙂", id: "happy", kind: "view", label: "Happy" },
    { collapsed: false, id: "releases", kind: "section", label: "Releases" },
    { emoji: "🪟", id: "signing", kind: "view", label: "Windows installer signing" },
    { emoji: "🤖", id: "android", kind: "view", label: "Android release 2.4" },
    { collapsed: false, id: "desktop", kind: "section", label: "Desktop" },
    { emoji: "⚡", id: "voice", kind: "view", label: "Voice dictation latency" },
    { emoji: "🔍", id: "zoom", kind: "view", label: "Artifact viewer zoom" },
    { collapsed: true, id: "distractions", kind: "section", label: "Distractions" },
    { emoji: "🍞", id: "sourdough", kind: "view", label: "Sourdough starter ratio" },
];

const V2: SidebarItem[] = [
    ...V1.slice(0, 3),
    { collapsed: false, id: "this-week", kind: "section", label: "This week" },
    { emoji: "🪟", id: "signing", kind: "view", label: "Windows installer signing" },
    { emoji: "⚡", id: "voice", kind: "view", label: "Voice dictation latency" },
    { collapsed: false, id: "releases", kind: "section", label: "Releases" },
    { emoji: "🤖", id: "android", kind: "view", label: "Android release 2.4" },
    { collapsed: false, id: "desktop", kind: "section", label: "Desktop" },
    { emoji: "🔍", id: "zoom", kind: "view", label: "Artifact viewer zoom" },
    ...V1.slice(9),
];

const breaks = (item: SidebarItem) => item.kind === "section" || item.kind === "separator";

/* The document's move: a section carries its run, a row lands after the run of
   a folded section it follows. */
function moveApply(items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] {
    const runEnd = (list: readonly SidebarItem[], index: number) => {
        let end = index + 1;
        if (list[index]!.kind === "section" && (list === items || list[index]!.collapsed))
            while (end < list.length && !breaks(list[end]!)) end += 1;
        return end;
    };
    const from = items.findIndex((item) => item.id === move.id);
    const moved = items.slice(from, runEnd(items, from));
    const rest = [...items.slice(0, from), ...items.slice(from + moved.length)];
    const at =
        move.afterId === null
            ? 0
            : runEnd(
                  rest,
                  rest.findIndex((item) => item.id === move.afterId),
              );
    return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

function Column(props: { children: React.ReactNode }) {
    return (
        <div
            style={{
                background: "var(--background)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "16px",
                width: "420px",
            }}
        >
            {props.children}
        </div>
    );
}

/** A proposal in a chat: v1 revised, v2 open and editable until answered. */
function LiveProposal() {
    const [items, setItems] = useState(V2);
    const [status, setStatus] = useState<SidebarProposalStatus>("open");
    const [answering, setAnswering] = useState<"accept" | "decline">();
    const answer = (kind: "accept" | "decline") => {
        setAnswering(kind);
        setTimeout(() => {
            setAnswering(undefined);
            setStatus(kind === "accept" ? "accepted" : "declined");
        }, 600);
    };
    return (
        <Column>
            <SidebarProposal
                sections={[{ id: "v1", items: V1, label: "" }]}
                status="superseded"
                revision={1}
            />
            <SidebarProposal
                answering={answering}
                itemMenuItems={(item) =>
                    item.kind === "section"
                        ? [{ icon: "edit", id: "rename", kind: "item", label: "Rename section" }]
                        : []
                }
                itemRename={{
                    actionId: "rename",
                    onSubmit: (item, name) =>
                        setItems((current) =>
                            current.map((candidate) =>
                                candidate.id === item.id
                                    ? { ...candidate, label: name }
                                    : candidate,
                            ),
                        ),
                }}
                onAccept={() => answer("accept")}
                onDecline={() => answer("decline")}
                onItemCollapseToggle={(id) =>
                    setItems((current) =>
                        current.map((item) =>
                            item.id === id ? { ...item, collapsed: !item.collapsed } : item,
                        ),
                    )
                }
                onItemReorder={(_, move) => setItems((current) => moveApply(current, move))}
                sections={[{ id: "v2", items, label: "" }]}
                status={status}
                summary="Grouped what you touched this week at the top; Distractions stays folded."
                revision={2}
            />
        </Column>
    );
}

export function SidebarProposalPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A sidebar the focus agent proposes, shown in its chat as the real Sidebar: live and editable at its full height, with no scroll of its own. Edits go to the proposal; Use this sidebar takes it, Keep mine leaves yours. A revision is a new card below; the older one stays, read-only."
            title="Sidebar proposal"
        >
            <Specimen
                detail="card ≤ 360 px · 12 px padding · 1 px hairline · footer 28 px whatever it holds"
                label="In a chat — revised, then open"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <LiveProposal />
                    <DimensionRule label="420 px chat column · the chat scrolls, the proposal never does" />
                </div>
            </Specimen>
            <Specimen
                detail="answered, the rows are read-only and only the footer's line changes"
                label="Answered"
                number="02"
                stage="surface"
            >
                <Column>
                    <SidebarProposal
                        sections={[{ id: "a", items: V2, label: "" }]}
                        status="accepted"
                        revision={2}
                    />
                    <SidebarProposal
                        sections={[{ id: "d", items: V1, label: "" }]}
                        status="declined"
                        revision={1}
                    />
                </Column>
            </Specimen>
        </ComponentPage>
    );
}
