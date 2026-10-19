import { useRef, useState } from "react";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { Button } from "../../src/Button";
import {
    dayHappyImage,
    dayPerson,
    daySections,
    dayWork,
    dayWorkIdIs,
    type DayFrame,
    type DayPerson,
} from "./personalDayFixtures";

export type PersonalDaySidebarProps = {
    frame: DayFrame;
    activeId: string;
    space: DayPerson;
    onSpaceChange: (space: DayPerson) => void;
    onSelect: (id: string) => void;
    onOrganize?: (label: string) => void;
};

/** The same production sidebar in the full windows and the timeline columns. */
export function PersonalDaySidebar(props: PersonalDaySidebarProps) {
    const person = dayPerson(props.frame);
    const readOnly = props.space !== person;
    const scroll = useRef({ kirill: 0, steve: 0 });
    const [projections, setProjections] = useState<Record<DayPerson, SidebarSection[]>>(() => ({
        kirill: daySections("kirill", props.frame, person !== "kirill"),
        steve: daySections("steve", props.frame, person !== "steve"),
    }));
    const update = (change: (section: SidebarSection) => SidebarSection) => {
        setProjections({ ...projections, [props.space]: projections[props.space].map(change) });
    };
    return (
        <div
            data-day-space={props.space}
            data-day-read-only={readOnly ? "" : undefined}
            style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}
            ref={(node) => {
                const viewport = node?.querySelector<HTMLElement>(".happy-sidebar__body-viewport");
                if (viewport) viewport.scrollTop = scroll.current[props.space];
            }}
            onScrollCapture={(event) => {
                if (
                    event.target instanceof HTMLElement &&
                    event.target.classList.contains("happy-sidebar__body-viewport")
                ) {
                    scroll.current[props.space] = event.target.scrollTop;
                }
            }}
        >
            <Sidebar
                style={{ width: "100%", "--happy-surface-header-height": "40px" }}
                headerTrailing={
                    readOnly ? (
                        <Button
                            icon="chevron-left"
                            onClick={() => props.onSpaceChange(person)}
                            size="small"
                            variant="ghost"
                        >
                            Back to my space
                        </Button>
                    ) : undefined
                }
                activeItemId={props.activeId}
                actions={[
                    {
                        id: "happy",
                        label: "Happy",
                        kind: "view",
                        imageMark: dayHappyImage,
                        unread: props.frame === "K3" || props.frame === "K4",
                    },
                ]}
                actionsDivider
                composeLabel="Make Stuff"
                composeActive={props.activeId === "new"}
                composeShortcut={{ aria: "Meta+N Meta+T", caps: "⌘N" }}
                onCompose={() => {
                    props.onSpaceChange(person);
                    props.onSelect("new");
                }}
                itemMarkPresentation="glyph"
                treeConnectors={false}
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemSelect={props.onSelect}
                sections={projections[props.space]}
                onSectionSelect={(id) => {
                    if (id === "steve-preview") props.onSpaceChange("steve");
                    if (id === "kirill-preview") props.onSpaceChange("kirill");
                }}
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
                onItemReorder={
                    readOnly
                        ? undefined
                        : (sectionId, move) =>
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
                        ...(!readOnly && row.reorderable !== false
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
