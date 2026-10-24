import { useState, type ReactNode } from "react";
import { Sidebar, type SidebarItem, type SidebarReorder } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-310";

/*
 * Items attached under the task that owns them: a todo list, a document, a
 * chat, a chat with another person, another task. Each is `attachable`; a row
 * that takes them is an `attachTarget`. A session nested under a row is
 * neither, so it stays with its own row.
 */
const ROWS: SidebarItem[] = [
    { emoji: "🙂", id: "happy", kind: "view", label: "Happy" },
    { collapsed: false, id: "releases", kind: "section", label: "Releases" },
    {
        attachTarget: true,
        collapsed: false,
        emoji: "🪟",
        id: "signing",
        kind: "view",
        label: "Windows installer signing",
    },
    { depth: 1, icon: "chat", id: "review", kind: "agent", label: "Review the signing step" },
    {
        attachable: true,
        depth: 1,
        icon: "list",
        id: "todos",
        kind: "view",
        label: "Signing checklist",
    },
    {
        attachable: true,
        depth: 1,
        icon: "doc",
        id: "notes",
        kind: "view",
        label: "Certificate notes",
    },
    {
        attachable: true,
        depth: 1,
        id: "steve",
        initials: "SV",
        kind: "person",
        label: "Steve",
    },
    { attachTarget: true, emoji: "🤖", id: "android", kind: "view", label: "Android release 2.4" },
    { collapsed: false, id: "desktop", kind: "section", label: "Desktop" },
    {
        attachTarget: true,
        collapsed: true,
        emoji: "⚡",
        id: "voice",
        kind: "view",
        label: "Voice dictation latency",
    },
    {
        attachable: true,
        depth: 1,
        icon: "chat",
        id: "latency-chat",
        kind: "view",
        label: "Latency chat",
    },
    {
        attachable: true,
        attachTarget: true,
        emoji: "🔍",
        id: "zoom",
        kind: "view",
        label: "Artifact viewer zoom",
    },
    { attachable: true, icon: "doc", id: "spec", kind: "view", label: "Zoom spec" },
];

const depthOf = (item: SidebarItem | undefined) => item?.depth ?? 0;
const breaks = (item: SidebarItem) =>
    depthOf(item) === 0 && (item.kind === "section" || item.kind === "separator");

/* The document's move: a section carries its run; any other row carries its
   nested rows; a parent sets the row down under it and opens it. */
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
    // A row with rows under it says whether they are folded.
    return [...rest.slice(0, at), ...moved, ...rest.slice(at)].map((item, index, list) =>
        item.attachTarget && depthOf(list[index + 1]) > depthOf(item)
            ? { ...item, collapsed: item.collapsed ?? false }
            : item,
    );
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
            summary="Todo lists, documents, chats, people and other tasks attached under the task that owns them. They fold with it, and a drag carries one in, out or between rows: the hand's sideways position picks the level wherever both are open. A session under a row stays with its row."
            title="Sidebar attachments"
        >
            <Specimen
                detail="one indent level (16 px) · drag sideways to attach or detach · folds with its row"
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
