import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { FormRow } from "../../FormRow";
import { Select } from "../../Select";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One project the tiers can be set for. */
export interface HappyAgentFileTierProject<ProjectId extends string = string> {
    readonly id: ProjectId;
    readonly name: string;
}

/** One tier as Settings shows it. The ids are the caller's own, handed back unchanged. */
export interface HappyAgentFileTierRow<TierId extends string = string> {
    readonly id: TierId;
    /** What its section is called. Blank while it is being written. */
    readonly name: string;
    /** Glob patterns, one per line of the field, kept verbatim. */
    readonly patterns: readonly string[];
    /** How many of the project's current changes it claims, when they are known. */
    readonly count?: number;
}

/** Which way a tier moves in the match order. */
export type HappyAgentFileTierMoveDirection = "earlier" | "later";

export interface HappyAgentFileTierSettingsProps<
    ProjectId extends string = string,
    TierId extends string = string,
> {
    /** The projects tiers can be set for. Empty, there is nothing to configure yet. */
    readonly projects: readonly HappyAgentFileTierProject<ProjectId>[];
    /** The project whose tiers are shown. */
    readonly projectId?: ProjectId;
    /** That project's tiers, in match order. */
    readonly tiers: readonly HappyAgentFileTierRow<TierId>[];
    /** False once the project holds as many tiers as it may. */
    readonly canAdd?: boolean;
    /** Why the projects cannot be listed right now, when they cannot. */
    readonly unavailable?: string;
    onProjectSelect(projectId: ProjectId): void;
    onTierAdd(): void;
    onTierNameChange(tierId: TierId, name: string): void;
    onTierPatternsChange(tierId: TierId, patterns: readonly string[]): void;
    onTierMove(tierId: TierId, direction: HappyAgentFileTierMoveDirection): void;
    onTierRemove(tierId: TierId): void;
}

function countLabel(count: number): string {
    return count === 0
        ? "Matches no changed files right now"
        : `Matches ${String(count)} changed ${count === 1 ? "file" : "files"} right now`;
}

/**
 * The tiers a project's Changes listing splits secondary files into.
 *
 * A project is picked first, because tiers belong to a project and every
 * worktree of it lists its changes the same way. Each tier is then a card of
 * its own — its place in the match order, its name, its patterns, and how much
 * of the current change it claims — since a changed file goes to the first tier
 * it matches and the order is part of the setting. Every edit applies as it is
 * made: this is how the reader looks at their own changes, so there is nothing
 * to save.
 *
 * Props only: the caller owns the projects and the tiers and answers every
 * handler.
 */
export function HappyAgentFileTierSettings<ProjectId extends string, TierId extends string>(
    props: HappyAgentFileTierSettingsProps<ProjectId, TierId>,
) {
    const project = props.projects.find((candidate) => candidate.id === props.projectId);
    const canAdd = props.canAdd !== false && project !== undefined;
    return (
        <>
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Agent reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.projects.length === 0 ? (
                <EmptyState
                    description="Add a project, and the tiers its changes are split into are set here."
                    icon="files"
                    size="inline"
                    title="No projects yet"
                />
            ) : (
                <>
                    <HappyAgentSettingsSection>
                        <FormRow
                            control={
                                <Select
                                    aria-label="Project"
                                    onValueChange={(value) => {
                                        const next = props.projects.find(
                                            (candidate) => candidate.id === value,
                                        );
                                        if (next) props.onProjectSelect(next.id);
                                    }}
                                    options={props.projects.map((candidate) => ({
                                        label: candidate.name,
                                        value: candidate.id,
                                    }))}
                                    value={project?.id}
                                    width={240}
                                />
                            }
                            description="Tiers apply to every worktree of the project."
                            label="Project"
                        />
                        <FormRow
                            control={
                                <Button
                                    disabled={!canAdd}
                                    icon="plus"
                                    onClick={props.onTierAdd}
                                    {...(canAdd
                                        ? {}
                                        : { title: "This project holds as many tiers as it may." })}
                                >
                                    Add tier
                                </Button>
                            }
                            description="Changed files that match a tier are listed in their own section below the rest. Write one glob per line: a pattern without a slash, like *.test.ts, matches anywhere; fixtures/ matches a directory; ! excludes."
                            label="Tiers"
                        />
                    </HappyAgentSettingsSection>
                    {props.tiers.length === 0 ? (
                        <EmptyState
                            description="Every changed file in this project is listed together."
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
                                            autoFocus={
                                                tier.name === "" && tier.patterns.length === 0
                                            }
                                            className="happy-agent-file-tier__name"
                                            fullWidth
                                            onValueChange={(name) =>
                                                props.onTierNameChange(tier.id, name)
                                            }
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
                                </article>
                            ))}
                        </HappyAgentSettingsSection>
                    )}
                </>
            )}
        </>
    );
}
