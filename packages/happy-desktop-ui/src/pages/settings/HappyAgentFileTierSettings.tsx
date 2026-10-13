import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { FormRow } from "../../FormRow";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One tier as Settings shows it. The ids are the caller's own, handed back unchanged. */
export interface HappyAgentFileTierRow<TierId extends string = string> {
    readonly id: TierId;
    /** What its section is called. Blank while it is being written. */
    readonly name: string;
    /** Glob patterns, one per line of the field, kept verbatim. */
    readonly patterns: readonly string[];
}

/** Which way a tier moves in the match order. */
export type HappyAgentFileTierMoveDirection = "earlier" | "later";

export interface HappyAgentFileTierSettingsProps<TierId extends string = string> {
    /** The tiers, in match order. */
    readonly tiers: readonly HappyAgentFileTierRow<TierId>[];
    /** False once the list holds as many tiers as it may, or cannot be edited at all. */
    readonly canAdd?: boolean;
    /** Why the tiers cannot be read right now, when they cannot. */
    readonly unavailable?: string;
    onTierAdd(): void;
    onTierNameChange(tierId: TierId, name: string): void;
    onTierPatternsChange(tierId: TierId, patterns: readonly string[]): void;
    onTierMove(tierId: TierId, direction: HappyAgentFileTierMoveDirection): void;
    onTierRemove(tierId: TierId): void;
}

/**
 * The tiers every Changes listing splits secondary files into.
 *
 * One list for every project and node: which files count as secondary is a
 * habit of the reader's, and a tier that matches nothing in a listing is not
 * shown there. Each tier is a card of its own — its place in the match order,
 * its name, and its patterns — since a changed file goes to the first tier it
 * matches and the order is part of the setting. Every edit applies as it is
 * made: this is how the reader looks at their own changes, so there is nothing
 * to save.
 *
 * Props only: the caller owns the tiers and answers every handler.
 */
export function HappyAgentFileTierSettings<TierId extends string>(
    props: HappyAgentFileTierSettingsProps<TierId>,
) {
    const canAdd = props.canAdd !== false;
    return (
        <>
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Agent reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection>
                <FormRow
                    control={
                        <Button
                            disabled={!canAdd}
                            icon="plus"
                            onClick={props.onTierAdd}
                            {...(canAdd || props.unavailable
                                ? {}
                                : { title: "Remove a tier to add another." })}
                        >
                            Add tier
                        </Button>
                    }
                    description="Changed files that match a tier are listed in their own section below the rest, in every project. Write one glob per line: a pattern without a slash, like *.test.ts, matches anywhere; fixtures/ matches a directory; ! excludes."
                    label="Tiers"
                />
            </HappyAgentSettingsSection>
            {props.tiers.length === 0 ? (
                <EmptyState
                    description="Every changed file is listed together."
                    icon="files"
                    size="inline"
                    title="No tiers yet"
                />
            ) : (
                <HappyAgentSettingsSection
                    description="A changed file goes to the first tier it matches."
                    rows="cards"
                    title="In match order"
                >
                    {props.tiers.map((tier, index) => (
                        <article
                            aria-label={`Tier ${String(index + 1)}`}
                            className="happy-agent-file-tier"
                            data-happy-desktop-ui="happy-agent-file-tier"
                            key={tier.id}
                        >
                            <header className="happy-agent-file-tier__header">
                                <span
                                    aria-hidden="true"
                                    className="happy-agent-file-tier__order"
                                    data-happy-desktop-ui="happy-agent-file-tier-order"
                                >
                                    {index + 1}
                                </span>
                                <TextField
                                    aria-label={`Tier ${String(index + 1)} name`}
                                    // A tier is added blank, and naming it
                                    // is the next thing anyone does.
                                    autoFocus={tier.name === "" && tier.patterns.length === 0}
                                    className="happy-agent-file-tier__name"
                                    fullWidth
                                    onValueChange={(name) => props.onTierNameChange(tier.id, name)}
                                    placeholder="Name, e.g. Tests"
                                    value={tier.name}
                                />
                                <Box className="happy-agent-file-tier__actions">
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
                                </Box>
                            </header>
                            <TextField
                                aria-label={`Tier ${String(index + 1)} patterns`}
                                fullWidth
                                multiline
                                onValueChange={(value) =>
                                    props.onTierPatternsChange(tier.id, value.split("\n"))
                                }
                                placeholder={"*.test.ts\n__snapshots__/"}
                                rows={3}
                                value={tier.patterns.join("\n")}
                            />
                        </article>
                    ))}
                </HappyAgentSettingsSection>
            )}
        </>
    );
}
