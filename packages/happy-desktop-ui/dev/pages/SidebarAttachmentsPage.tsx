import { useState, type ReactNode } from "react";
import { Sidebar, type SidebarItem, type SidebarReorder } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-310";

/*
 * Items attached under the task that owns them: a todo list, a document, a
 * chat, a chat with another person, another task. A drag never changes a
 * row's level: an attachment moves among the rows under its own row, like the
 * session beside it, and a top-level row only among top-level rows.
 */
const ROWS: SidebarItem[] = [
    { emoji: "🙂", id: "happy", kind: "view", label: "Happy" },
    { collapsed: false, id: "releases", kind: "section", label: "Releases" },
    {
        collapsed: false,
        emoji: "🪟",
        id: "signing",
        kind: "view",
        label: "Windows installer signing",
    },
    { depth: 1, icon: "chat", id: "review", kind: "agent", label: "Review the signing step" },
    {
        depth: 1,
        icon: "list",
        id: "todos",
        kind: "view",
        label: "Signing checklist",
    },
    {
        depth: 1,
        icon: "doc",
        id: "notes",
        kind: "view",
        label: "Certificate notes",
    },
    {
        depth: 1,
        id: "steve",
        initials: "SV",
        kind: "person",
        label: "Steve",
    },
    { emoji: "🤖", id: "android", kind: "view", label: "Android release 2.4" },
    { collapsed: false, id: "desktop", kind: "section", label: "Desktop" },
    {
        collapsed: true,
        emoji: "⚡",
        id: "voice",
        kind: "view",
        label: "Voice dictation latency",
    },
    {
        depth: 1,
        icon: "chat",
        id: "latency-chat",
        kind: "view",
        label: "Latency chat",
    },
    {
        emoji: "🔍",
        id: "zoom",
        kind: "view",
        label: "Artifact viewer zoom",
    },
    { icon: "doc", id: "spec", kind: "view", label: "Zoom spec" },
];

const depthOf = (item: SidebarItem | undefined) => item?.depth ?? 0;
const breaks = (item: SidebarItem) =>
    depthOf(item) === 0 && (item.kind === "section" || item.kind === "separator");

/* The document's move: a section carries its run; any other row carries its
   nested rows, among its own siblings under `parentId` or at the top level. */
function moveApply(items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] {
    const runEnd = (list: readonly SidebarItem[], index: number) => {
        let end = index + 1;
        const section = list[index]!.kind === "section";
        while (
            end < list.length &&
            (section ? !breaks(list[end]!) : depthOf(list[end]) > depthOf(list[index]))
        )
            end += 1;
        return end;
    };
    const from = items.findIndex((item) => item.id === move.id);
    const base = depthOf(items[from]);
    const level =
        move.parentId === undefined
            ? 0
            : depthOf(items.find((item) => item.id === move.parentId)) + 1;
    const moved = items
        .slice(from, runEnd(items, from))
        .map((item) => ({ ...item, depth: depthOf(item) - base + level }));
    const rest = [...items.slice(0, from), ...items.slice(from + moved.length)];
    let at = 0;
    if (move.parentId !== undefined) {
        const parent = rest.findIndex((item) => item.id === move.parentId);
        rest[parent] = { ...rest[parent]!, collapsed: false };
        at =
            move.afterId === null
                ? parent + 1
                : runEnd(
                      rest,
                      rest.findIndex((item) => item.id === move.afterId),
                  );
    } else if (move.afterId !== null) {
        at = runEnd(
            rest,
            rest.findIndex((item) => item.id === move.afterId),
        );
    }
    return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

function Column(props: { children: ReactNode }) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                display: "flex",
                flexDirection: "column",
                height: "520px",
                width: "280px",
            }}
        >
            {props.children}
        </div>
    );
}

function LiveAttachments() {
    const [items, setItems] = useState(ROWS);
    const [active, setActive] = useState("todos");
    return (
        <Column>
            <Sidebar
                activeItemId={active}
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemCollapseToggle={(id) =>
                    setItems((current) =>
                        current.map((item) =>
                            item.id === id ? { ...item, collapsed: !item.collapsed } : item,
                        ),
                    )
                }
                onItemReorder={(_, move) => setItems((current) => moveApply(current, move))}
                onItemSelect={setActive}
                sections={[{ id: "spaces", items, label: "" }]}
            />
        </Column>
    );
}

export function SidebarAttachmentsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Todo lists, documents, chats, people and other tasks attached under the task that owns them. They fold with it. A drag never changes a row's level: an attachment moves only among the rows under its own row, like a session, and a top-level row only among top-level rows."
            title="Sidebar attachments"
        >
            <Specimen
                detail="one indent level (16 px) · moves among its siblings · folds with its row"
                label="Attachments under rows — live"
                number="01"
                stage="chrome"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <LiveAttachments />
                    <DimensionRule label="280 px sidebar · attachments at depth 1" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
