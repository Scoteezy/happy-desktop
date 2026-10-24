import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Sidebar, type SidebarProps } from "./Sidebar";

/**
 * Where one proposal stands. `open` is the only state the person can act in;
 * a proposal they answered says how, and one the agent revised points on to
 * the newer version below it.
 */
export type SidebarProposalStatus = "open" | "accepted" | "declined" | "superseded";

export interface SidebarProposalProps {
    /** The proposed sidebar's rows, drawn by the same `Sidebar` the window uses. */
    readonly sections: SidebarProps["sections"];
    readonly status: SidebarProposalStatus;
    /** Which revision this is, counted from 1. */
    readonly version: number;
    /** What the agent changed, in one line, above the rows. */
    readonly summary?: string;
    /** Why the last edit or answer did not go through, beside the buttons. */
    readonly notice?: string;
    /** An answer is on its way; both buttons wait. */
    readonly answering?: "accept" | "decline";
    readonly onAccept?: () => void;
    readonly onDecline?: () => void;
    /** A row in the proposal was clicked; it may open what the row stands for. */
    readonly onItemSelect?: SidebarProps["onItemSelect"];
    /** Editing the proposal: the same moves, folds and names as the window's sidebar. */
    readonly onItemReorder?: SidebarProps["onItemReorder"];
    readonly onItemCollapseToggle?: SidebarProps["onItemCollapseToggle"];
    readonly itemRename?: SidebarProps["itemRename"];
    readonly itemMenuItems?: SidebarProps["itemMenuItems"];
    readonly onItemMenuSelect?: SidebarProps["onItemMenuSelect"];
    readonly onDragChange?: SidebarProps["onDragChange"];
}

const STATUS: Record<Exclude<SidebarProposalStatus, "open">, string> = {
    accepted: "You use this sidebar now.",
    declined: "You kept your own sidebar.",
    superseded: "Revised below.",
};

/**
 * C-311 SidebarProposal — a sidebar the focus agent proposes, shown in its chat
 * as the real `Sidebar`, live and editable, at its full height: the chat
 * scrolls, the proposal never does. While it is open every drag, fold and
 * rename edits the proposal, not the person's own sidebar; "Use this sidebar"
 * takes it and "Keep mine" leaves things as they are. Answered or revised, it
 * stays in the chat as it was, read-only, and the card keeps its size: only the
 * line under the rows changes. A read-only card still folds and unfolds for the
 * reader, in this card alone, so a folded section can be looked into.
 */
export function SidebarProposal(props: SidebarProposalProps): ReactNode {
    const open = props.status === "open";
    // Sections the reader turned over in a read-only card; the proposal itself is untouched.
    const [turned, setTurned] = useState<ReadonlySet<string>>(() => new Set());
    const sections =
        open || turned.size === 0
            ? props.sections
            : props.sections.map((section) => ({
                  ...section,
                  items: section.items.map((item) =>
                      turned.has(item.id) ? { ...item, collapsed: item.collapsed !== true } : item,
                  ),
              }));
    const turn = (id: string): void =>
        setTurned((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });
    return (
        <section
            aria-label={`Proposed sidebar, version ${String(props.version)}`}
            className="happy-sidebar-proposal"
            data-happy-desktop-ui="sidebar-proposal"
            data-status={props.status}
        >
            <header className="happy-sidebar-proposal__header">
                <span className="happy-sidebar-proposal__title">Proposed sidebar</span>
                <span className="happy-sidebar-proposal__version">
                    {`v${String(props.version)}`}
                </span>
            </header>
            {props.summary ? (
                <p className="happy-sidebar-proposal__summary">{props.summary}</p>
            ) : null}
            <div className="happy-sidebar-proposal__frame">
                <Sidebar
                    activeItemId=""
                    className="happy-sidebar-proposal__sidebar"
                    foldControlPlacement="trailing"
                    foldControlReveal="hover"
                    onItemSelect={props.onItemSelect ?? (() => undefined)}
                    sections={sections}
                    {...(open
                        ? {
                              itemMenuItems: props.itemMenuItems,
                              itemRename: props.itemRename,
                              onDragChange: props.onDragChange,
                              onItemCollapseToggle: props.onItemCollapseToggle,
                              onItemMenuSelect: props.onItemMenuSelect,
                              onItemReorder: props.onItemReorder,
                          }
                        : { onItemCollapseToggle: turn })}
                />
            </div>
            <footer className="happy-sidebar-proposal__footer">
                {open ? (
                    <>
                        {props.notice ? (
                            <span
                                className="happy-sidebar-proposal__notice"
                                data-happy-desktop-ui="sidebar-proposal-notice"
                                role="alert"
                            >
                                {props.notice}
                            </span>
                        ) : null}
                        <Button
                            disabled={props.answering !== undefined}
                            loading={props.answering === "decline"}
                            onClick={props.onDecline}
                            size="small"
                            variant="secondary"
                        >
                            Keep mine
                        </Button>
                        <Button
                            disabled={props.answering !== undefined}
                            loading={props.answering === "accept"}
                            onClick={props.onAccept}
                            size="small"
                            variant="primary"
                        >
                            Use this sidebar
                        </Button>
                    </>
                ) : (
                    <span
                        className="happy-sidebar-proposal__status"
                        data-happy-desktop-ui="sidebar-proposal-status"
                    >
                        {STATUS[props.status]}
                    </span>
                )}
            </footer>
        </section>
    );
}
