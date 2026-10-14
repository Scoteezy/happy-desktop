import type { CSSProperties } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import {
    SurfaceAvatar,
    surfaceMembersText,
    surfaceTypeLabel,
    type HappyAgentSurfaceView,
} from "./surfacePresentation";

/** One Surface in the catalog, as the browse list shows it. */
export type HappyAgentSurfaceBrowseEntry = HappyAgentSurfaceView & { readonly id: string };

export type HappyAgentSurfaceBrowseDialogProps = {
    surfaces: readonly HappyAgentSurfaceBrowseEntry[];
    /** Why the last join failed, in the Happy Agent's own words. */
    error?: string;
    onJoin: (id: string) => void;
    onOpen: (id: string) => void;
    onCreate: () => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-297 HappyAgentSurfaceBrowseDialog — every Surface on one Happy Agent, of
 * every type, to join one or open one already joined.
 *
 * A row is the Surface's picture, its name over what it is and who is in it,
 * and Join or Open. A type this version of Happy cannot show is listed like any
 * other and says so; joining it puts it in the sidebar all the same.
 */
export function HappyAgentSurfaceBrowseDialog(props: HappyAgentSurfaceBrowseDialogProps) {
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button onClick={props.onCreate} variant="secondary">
                            New todo list
                        </Button>
                        <Button onClick={props.onClose} variant="ghost">
                            Done
                        </Button>
                    </>
                }
                icon="tasks"
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title="Browse Surfaces"
            >
                <div
                    className="happy-agent-surface-browse-dialog"
                    data-happy-desktop-ui="happy-agent-surface-browse-dialog"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Couldn’t join">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.surfaces.length === 0 ? (
                        <p className="happy-agent-surface-browse-dialog__empty">
                            Nothing here yet. Make the first todo list.
                        </p>
                    ) : (
                        <ul
                            aria-label="Surfaces"
                            className="happy-agent-surface-browse-dialog__list"
                            data-happy-desktop-ui="happy-agent-surface-browse-dialog-list"
                        >
                            {props.surfaces.map((surface) => (
                                <li
                                    className="happy-agent-surface-browse-dialog__row"
                                    data-happy-desktop-ui="happy-agent-surface-browse-dialog-row"
                                    data-unsupported={
                                        surface.type.kind === "unsupported" ? "" : undefined
                                    }
                                    key={surface.id}
                                >
                                    <SurfaceAvatar
                                        image={surface.image}
                                        size="sm"
                                        type={surface.type}
                                    />
                                    <span className="happy-agent-surface-browse-dialog__text">
                                        <span className="happy-agent-surface-browse-dialog__name">
                                            {surface.name}
                                        </span>
                                        <span className="happy-agent-surface-browse-dialog__detail">
                                            {surfaceTypeLabel(surface.type)} ·{" "}
                                            {surfaceMembersText(surface.members)}
                                        </span>
                                    </span>
                                    {surface.joined ? (
                                        <Button
                                            aria-label={`Open ${surface.name}`}
                                            onClick={() => props.onOpen(surface.id)}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Open
                                        </Button>
                                    ) : (
                                        <Button
                                            aria-label={`Join ${surface.name}`}
                                            loading={surface.membershipPending === true}
                                            onClick={() => props.onJoin(surface.id)}
                                            size="small"
                                            variant="primary"
                                        >
                                            Join
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Modal>
        </ModalOverlay>
    );
}
