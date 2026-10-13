import type { CSSProperties } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { TextField } from "./TextField";

/** One tier as the editor shows it. `TierId` is the caller's own id type, handed back unchanged. */
export type FileTiersDialogTier<TierId extends string = string> = {
    id: TierId;
    /** What its section is called. Blank while it is being written. */
    name: string;
    /** Glob patterns, one per line of the field, kept verbatim. */
    patterns: readonly string[];
    /** How many of the current changes it claims, when the caller knows. */
    count?: number;
};

/** Which way a tier moves in the match order. */
export type FileTiersDialogMoveDirection = "earlier" | "later";

export type FileTiersDialogProps<TierId extends string = string> = {
    /** The project the tiers belong to, named in the title so it is clear what they apply to. */
    projectName?: string;
    /** The tiers in match order. */
    tiers: readonly FileTiersDialogTier<TierId>[];
    /** False once the project holds as many tiers as it may; Add tier is then withheld. */
    canAdd?: boolean;
    onTierAdd: () => void;
    onTierNameChange: (tierId: TierId, name: string) => void;
    onTierPatternsChange: (tierId: TierId, patterns: readonly string[]) => void;
    onTierMove: (tierId: TierId, direction: FileTiersDialogMoveDirection) => void;
    onTierRemove: (tierId: TierId) => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

function countLabel(count: number): string {
    return count === 0
        ? "Matches no changed files"
        : `Matches ${String(count)} changed ${count === 1 ? "file" : "files"}`;
}

/**
 * C-295 FileTiersDialog — the tiers the Changes listing splits secondary files
 * into, for one project.
 *
 * Each tier is a name and a field of glob patterns, one per line, read the way
 * a `.gitignore` reads them. A changed file is listed under the first tier it
 * matches, so the order is part of the setting and each tier can be moved
 * earlier or later. Every edit applies as it is made — this is how the reader
 * looks at their own changes, with nothing to submit — so the footer holds
 * Add tier and Done and nothing to save.
 *
 * Props only: the caller owns the tiers and answers every handler.
 */
export function FileTiersDialog<TierId extends string>(props: FileTiersDialogProps<TierId>) {
    const canAdd = props.canAdd !== false;
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        {/* In the footer rather than under the last tier, so it
                            stays in reach however far the tiers scroll. */}
                        {canAdd ? (
                            <Button icon="plus" onClick={props.onTierAdd} variant="ghost">
                                Add tier
                            </Button>
                        ) : null}
                        <Button onClick={props.onClose} variant="primary">
                            Done
                        </Button>
                    </>
                }
                icon="filter"
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title={
                    props.projectName === undefined
                        ? "File tiers"
                        : `File tiers for ${props.projectName}`
                }
            >
                <div className="happy-file-tiers-dialog" data-happy-desktop-ui="file-tiers-dialog">
                    <p
                        className="happy-file-tiers-dialog__intro"
                        data-happy-desktop-ui="file-tiers-dialog-intro"
                    >
                        Changed files that match a tier are listed in their own section below the
                        rest. A file goes to the first tier it matches. Write one glob per line; a
                        pattern without a slash, like <code>*.test.ts</code>, matches anywhere.
                    </p>
                    {props.tiers.length === 0 ? (
                        <p
                            className="happy-file-tiers-dialog__empty"
                            data-happy-desktop-ui="file-tiers-dialog-empty"
                        >
                            No tiers yet. Every changed file is listed together.
                        </p>
                    ) : (
                        <ol
                            className="happy-file-tiers-dialog__tiers"
                            data-happy-desktop-ui="file-tiers-dialog-tiers"
                        >
                            {props.tiers.map((tier, index) => (
                                <li
                                    className="happy-file-tiers-dialog__tier"
                                    data-happy-desktop-ui="file-tiers-dialog-tier"
                                    key={tier.id}
                                >
                                    <div
                                        className="happy-file-tiers-dialog__tier-header"
                                        data-happy-desktop-ui="file-tiers-dialog-tier-header"
                                    >
                                        <TextField
                                            aria-label={`Tier ${String(index + 1)} name`}
                                            // A tier is added blank, and naming it is
                                            // the next thing anyone does.
                                            autoFocus={
                                                tier.name === "" && tier.patterns.length === 0
                                            }
                                            className="happy-file-tiers-dialog__name"
                                            fullWidth
                                            onValueChange={(name) =>
                                                props.onTierNameChange(tier.id, name)
                                            }
                                            placeholder="Name, e.g. Tests"
                                            size="small"
                                            value={tier.name}
                                        />
                                        <Button
                                            aria-label="Move earlier"
                                            disabled={index === 0}
                                            icon="chevron-up"
                                            iconOnly
                                            onClick={() => props.onTierMove(tier.id, "earlier")}
                                            size="small"
                                            title="Move earlier"
                                            variant="ghost"
                                        />
                                        <Button
                                            aria-label="Move later"
                                            disabled={index === props.tiers.length - 1}
                                            icon="chevron-down"
                                            iconOnly
                                            onClick={() => props.onTierMove(tier.id, "later")}
                                            size="small"
                                            title="Move later"
                                            variant="ghost"
                                        />
                                        <Button
                                            aria-label="Remove tier"
                                            icon="trash"
                                            iconOnly
                                            onClick={() => props.onTierRemove(tier.id)}
                                            size="small"
                                            title="Remove tier"
                                            variant="ghost"
                                        />
                                    </div>
                                    <TextField
                                        aria-label={`Tier ${String(index + 1)} patterns`}
                                        fullWidth
                                        {...(tier.count === undefined
                                            ? {}
                                            : { hint: countLabel(tier.count) })}
                                        multiline
                                        onValueChange={(value) =>
                                            props.onTierPatternsChange(tier.id, value.split("\n"))
                                        }
                                        placeholder={"*.test.ts\n__snapshots__/"}
                                        rows={3}
                                        value={tier.patterns.join("\n")}
                                    />
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </Modal>
        </ModalOverlay>
    );
}
