import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { SIDEBAR_WIDGET_HEIGHT_MAX, SidebarWidget } from "../../src/SidebarWidget";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-308";

/* Widgets as Prioritizing or the person might write them: markup and inline
   style only, since nothing in a widget runs and nothing loads. */
const RELEASE = `<div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:color-mix(in srgb, CanvasText 6%, transparent)">
  <strong style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.6">Release 2.4</strong>
  <span>3 of 5 checks green · ships Thursday</span>
</div>`;

const PLAIN = `<p style="margin:0;padding:2px 2px">No styling of its own: the sidebar's scheme and type.</p>`;

const TALL = `<ol style="margin:0;padding-left:18px">${Array.from(
    { length: 24 },
    (_, index) => `<li>Item ${String(index + 1)}</li>`,
).join("")}</ol>`;

/** A widget in the document's list, carried and opened for its menu like a separator. */
const LIST: SidebarItem[] = [
    { emoji: "🙂", id: "happy", kind: "view", label: "Happy" },
    { id: "release-widget", kind: "widget", label: "Release 2.4 status", widgetHtml: RELEASE },
    { collapsed: false, id: "tasks", kind: "section", label: "Tasks" },
    { emoji: "🎨", id: "sidebar", kind: "view", label: "Sidebar UI fixes" },
    { id: "note-widget", kind: "widget", label: "Note", widgetHtml: PLAIN },
];

function Column(props: { width: number; children: React.ReactNode }) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                display: "flex",
                flexDirection: "column",
                padding: "8px",
                width: `${String(props.width)}px`,
            }}
        >
            {props.children}
        </div>
    );
}

export function SidebarWidgetPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Someone's HTML in the sidebar: a script-less, network-less frame on the sidebar's own background, as tall as its markup, carried like a separator."
            title="Sidebar widget"
        >
            <Specimen
                detail="transparent canvas · window scheme · body margin 0 · 13/18 system type"
                label="SidebarWidget — styled and plain"
                number="01"
                stage="chrome"
            >
                <Column width={280}>
                    <SidebarWidget html={RELEASE} title="Release 2.4 status" />
                    <SidebarWidget html={PLAIN} title="Note" />
                </Column>
            </Specimen>
            <Specimen
                detail={`cut off at ${String(SIDEBAR_WIDGET_HEIGHT_MAX)}px · never scrolls`}
                label="SidebarWidget — taller than the sidebar allows"
                number="02"
                stage="chrome"
            >
                <Column width={280}>
                    <SidebarWidget html={TALL} title="A long list" />
                    <DimensionRule label={`${String(SIDEBAR_WIDGET_HEIGHT_MAX)} px high at most`} />
                </Column>
            </Specimen>
            <Specimen
                detail="row inset 4px top and bottom · row padding at the sides · no hover fill · grab cursor"
                label="Sidebar — widget rows among the document's items"
                number="03"
                stage="chrome"
            >
                <div style={{ display: "flex", height: "360px", width: "300px" }}>
                    <Sidebar
                        activeItemId="sidebar"
                        foldControlPlacement="trailing"
                        onItemReorder={() => {}}
                        onItemSelect={() => {}}
                        sections={[{ id: "document", items: LIST }]}
                        style={{ width: "100%" }}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
