import {
    sidebarDocumentEdit,
    sidebarDocumentFold,
    sidebarDocumentMove,
    sidebarDocumentPlace,
    sidebarDocumentView,
    type HappyAgentSidebarProposalsStore,
    type HappyAgentSpaceId,
    type HappyAgentSpacesSnapshot,
    type SidebarDocumentView,
} from "happy-desktop-state";
import { SidebarProposal, type InlinePageFit, type SidebarItem } from "happy-desktop-ui";
import { useSyncExternalStore } from "react";
import {
    happyAgentSpacesItems,
    sidebarDocumentRelabel,
    type HappyAgentSpacesPlaces,
} from "./HappyAgentSpacesSidebar";

const MENU_RENAME = "rename";
const LIST = "proposal";
/** The proposal's own Search and Create rows stand where they would; here they open nothing. */
const COMMAND_INERT = { onOpen: () => undefined };

export interface HappyAgentSidebarProposalProps {
    readonly store: HappyAgentSidebarProposalsStore;
    readonly artifactId: string;
    /** Where the chat learns the proposal's height, so it is drawn whole. */
    readonly fit: InlinePageFit;
    /** The person's spaces, which the proposal's rows name. */
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    readonly titleShimmerEnabled: boolean;
    readonly stemCellAnimation: boolean;
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
}

/** The proposal's document, or nothing while it is not one the window draws. */
function viewOf(html: string): SidebarDocumentView | undefined {
    try {
        return sidebarDocumentView(html);
    } catch {
        return undefined;
    }
}

/**
 * A sidebar Prioritizing proposed, in its chat: drawn from the proposal's
 * document by the same rows as the window's sidebar, at its full height. While
 * it is open the person's drags, folds and section names edit the proposal;
 * Use this sidebar accepts it and Keep mine declines it.
 */
export function HappyAgentSidebarProposal(props: HappyAgentSidebarProposalProps) {
    const { store, artifactId } = props;
    const proposals = useSyncExternalStore(store.subscribe, store.get, store.get);
    // Records what is wanted; the read starts after this render.
    store.proposalsRequest([artifactId]);
    const entry = proposals.get(artifactId);
    const proposal = entry?.type === "ready" ? entry.proposal : undefined;
    const view = proposal ? viewOf(proposal.html) : undefined;
    const open = proposal?.status === "open" && proposal.answering === undefined;
    const attaching = props.snapshot.sidebar?.attachments === true;
    const drawn = view
        ? happyAgentSpacesItems({
              view,
              snapshot: props.snapshot,
              places: props.places,
              editable: open,
              attaching: open && attaching,
              titleShimmerEnabled: props.titleShimmerEnabled,
              stemCellAnimation: props.stemCellAnimation,
              search: { label: "Search", ...COMMAND_INERT },
              create: { label: "Create", ...COMMAND_INERT },
              sessionRow: props.sessionRow,
              worktreeRows: () => [],
          })
        : undefined;
    const edit = (change: (current: SidebarDocumentView) => SidebarDocumentView | undefined) => {
        if (!proposal || !open) return;
        const html = sidebarDocumentEdit(proposal.html, change);
        if (html !== undefined) store.proposalEdit(artifactId, html);
    };
    const anchorOf = drawn?.anchorOf;
    return (
        // The inline frame stretches its child to the height it reserves, so the
        // proposal is measured in a box of its own that keeps its content height.
        <div
            data-testid="sidebar-proposal-page"
            style={{ display: "flex", flexDirection: "column" }}
        >
            <div
                // The chat sizes this row from its model, so every height the
                // proposal settles on is reported; nothing scrolls inside it.
                ref={(node) => {
                    if (!node) return;
                    const fit = props.fit;
                    const report = () => fit.heightChanged(node.getBoundingClientRect().height);
                    const observer = new ResizeObserver(report);
                    observer.observe(node);
                    report();
                    return () => observer.disconnect();
                }}
                style={{ display: "flex", flex: "none", flexDirection: "column" }}
            >
                {entry?.type === "missing" ? (
                    <span>This proposal is no longer available.</span>
                ) : proposal && drawn ? (
                    <SidebarProposal
                        {...(proposal.answering ? { answering: proposal.answering } : {})}
                        {...(proposal.error ? { notice: proposal.error.message } : {})}
                        itemMenuItems={(item) =>
                            item.kind === "section"
                                ? [
                                      {
                                          kind: "item",
                                          id: MENU_RENAME,
                                          label: "Rename section",
                                          icon: "edit",
                                      },
                                  ]
                                : []
                        }
                        itemRename={{
                            actionId: MENU_RENAME,
                            onSubmit: (item, name) => {
                                const label = name.trim();
                                const key = anchorOf?.get(item.id);
                                if (label && key)
                                    edit((current) => sidebarDocumentRelabel(current, key, label));
                            },
                        }}
                        onAccept={() => store.proposalAccept(artifactId)}
                        onDecline={() => store.proposalDecline(artifactId)}
                        onItemCollapseToggle={(id) => {
                            const key = anchorOf?.get(id);
                            if (key) edit((current) => sidebarDocumentFold(current, key));
                        }}
                        onItemReorder={(_list, move) => {
                            const key = anchorOf?.get(move.id);
                            if (!key) return;
                            const afterKey =
                                move.afterId === null
                                    ? null
                                    : (anchorOf?.get(move.afterId) ?? null);
                            const parentKey =
                                move.parentId === undefined
                                    ? null
                                    : (anchorOf?.get(move.parentId) ?? undefined);
                            const space =
                                move.id.startsWith("space:") &&
                                props.snapshot.spaces.has(
                                    move.id.slice("space:".length) as HappyAgentSpaceId,
                                );
                            edit((current) =>
                                attaching && space && parentKey !== undefined
                                    ? sidebarDocumentPlace(current, key, parentKey, afterKey)
                                    : sidebarDocumentMove(current, key, afterKey),
                            );
                        }}
                        sections={[{ id: LIST, items: drawn.items }]}
                        status={proposal.status}
                        // Version 1 is the sidebar it was drafted from; the first proposal is 2.
                        version={Math.max(1, proposal.version - 1)}
                    />
                ) : (
                    <span>Loading the proposed sidebar…</span>
                )}
            </div>
        </div>
    );
}
