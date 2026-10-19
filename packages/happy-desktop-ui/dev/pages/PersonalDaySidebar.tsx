import { useRef, useState } from "react";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import {
    dayHappyImage,
    dayAfterBatch,
    dayPerson,
    dayRow,
    daySections,
    dayWaiting,
    dayWork,
    dayWorkIdIs,
    type DayFrame,
} from "./personalDayFixtures";

export type PersonalDaySidebarProps = {
    frame: DayFrame;
    activeId: string;
    onSelect: (id: string) => void;
    onOrganize?: (label: string) => void;
    pairingResolved?: boolean;
};

/** The same production sidebar in the full windows and the timeline columns. */
export function PersonalDaySidebar(props: PersonalDaySidebarProps) {
    const person = dayPerson(props.frame);
    const scroll = useRef(props.frame === "K4" ? 1000 : 0);
    const [projection, setProjection] = useState<SidebarSection[]>(() =>
        daySections(person, props.frame),
    );
    const update = (change: (section: SidebarSection) => SidebarSection) => {
        setProjection(projection.map(change));
    };
    const resolved = props.pairingResolved ?? !dayWaiting(props.frame);
    const sections = projection.map((section) => ({
        ...section,
        attentionCount: section.id === "steve-preview" && !resolved ? 1 : undefined,
        items: section.items.map((row) =>
            row.id === "connector"
                ? { ...row, ...dayRow("connector", props.frame, resolved) }
                : row,
        ),
    }));
    return (
        <div
            data-day-person={person}
            style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}
            ref={(node) => {
                const viewport = node?.querySelector<HTMLElement>(".happy-sidebar__body-viewport");
                if (viewport) viewport.scrollTop = scroll.current;
            }}
            onScrollCapture={(event) => {
                if (
                    event.target instanceof HTMLElement &&
                    event.target.classList.contains("happy-sidebar__body-viewport")
                ) {
                    scroll.current = event.target.scrollTop;
                }
            }}
        >
            <Sidebar
                style={{ width: "100%", "--happy-surface-header-height": "40px" }}
                activeItemId={props.activeId}
                actions={[
                    {
                        id: "happy",
                        label: "Happy",
                        kind: "view",
                        imageMark: dayHappyImage,
                        unread:
                            props.activeId !== "happy" &&
                            (dayWaiting(props.frame) || dayAfterBatch(props.frame)),
                    },
                ]}
                actionsDivider
                composeLabel="Make Stuff"
                composeActive={props.activeId === "new"}
                composeShortcut={{ aria: "Meta+N Meta+T", caps: "⌘N" }}
                onCompose={() => props.onSelect("new")}
                itemMarkPresentation="glyph"
                treeConnectors={false}
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemSelect={props.onSelect}
                sections={sections}
                onSectionCollapseToggle={(id) =>
                    update((section) =>
                        section.id === id ? { ...section, collapsed: !section.collapsed } : section,
                    )
                }
                onSectionTailToggle={(id) =>
                    update((section) =>
                        section.id === id && section.tail
                            ? {
                                  ...section,
                                  tail: { ...section.tail, expanded: !section.tail.expanded },
                              }
                            : section,
                    )
                }
                onItemReorder={(sectionId, move) =>
                    update((section) => {
                        if (section.id !== sectionId) return section;
                        const item = section.items.find((row) => row.id === move.id);
                        if (!item) return section;
                        const items = section.items.filter((row) => row.id !== move.id);
                        items.splice(
                            move.afterId === null
                                ? 0
                                : items.findIndex((row) => row.id === move.afterId) + 1,
                            0,
                            item,
                        );
                        return { ...section, items };
                    })
                }
                itemMenuItems={(row) => {
                    const source = dayWorkIdIs(row.id) ? dayWork[row.id] : undefined;
                    return [
                        {
                            kind: "item",
                            id: "open",
                            label:
                                source?.type === "bot"
                                    ? "Open bot"
                                    : source?.type === "todo"
                                      ? "Open list"
                                      : "Open task",
                        },
                        ...(row.reorderable !== false
                            ? [
                                  {
                                      kind: "item" as const,
                                      id: "organize",
                                      label: "Ask Happy to organize…",
                                  },
                              ]
                            : []),
                    ];
                }}
                onItemMenuSelect={(row, action) =>
                    action === "open" ? props.onSelect(row.id) : props.onOrganize?.(row.label)
                }
            />
        </div>
    );
}
