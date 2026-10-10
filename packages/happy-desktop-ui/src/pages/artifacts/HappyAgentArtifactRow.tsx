import { Fragment } from "react";
import type { HappyAgentArtifact, HappyAgentArtifactId } from "happy-desktop-state";
import { happyAgentArtifactTypeLabel } from "happy-desktop-state";
import { Badge } from "../../Badge";
import { ArtifactTypeGlyph, type HappyAgentArtifactLabels } from "./artifactPresentation";

export interface HappyAgentArtifactRowProps {
    artifact: HappyAgentArtifact;
    labels: HappyAgentArtifactLabels;
    /** `page` is the catalog's full row; `panel` is the narrow one beside a chat. */
    density: "page" | "panel";
    /** The artifact is the one open in the viewer. */
    selected?: boolean;
    onOpen: (artifactId: HappyAgentArtifactId) => void;
}

/**
 * One artifact in a list: what kind of thing it is, what it is called, where it
 * was made and by whom, when it last changed, and how many versions it has.
 * The whole row opens it. A deleted artifact stays readable as a record of what
 * was there, in secondary type and marked as gone.
 */
export function HappyAgentArtifactRow(props: HappyAgentArtifactRowProps) {
    const artifact = props.artifact;
    const deleted = artifact.status === "deleted";
    const glyphSize = props.density === "page" ? 18 : 16;
    const changed =
        deleted && artifact.deletedAt !== null
            ? `Deleted ${props.labels.time(artifact.deletedAt)}`
            : props.labels.time(artifact.updatedAt);
    // The catalog row has the width to say everything; the row beside a chat
    // keeps where and when, since the chat already says most of the rest.
    const place = props.labels.source(artifact.source);
    const author = props.labels.author(artifact.createdBy);
    const meta =
        props.density === "page"
            ? [
                  happyAgentArtifactTypeLabel(artifact.type),
                  place,
                  ...(author === place ? [] : [author]),
              ]
            : [place];
    return (
        <button
            aria-current={props.selected ? "true" : undefined}
            className="happy-agent-artifact-row"
            data-artifact-id={artifact.id}
            data-density={props.density}
            data-happy-desktop-ui="happy-agent-artifact-row"
            data-status={artifact.status}
            onClick={() => props.onOpen(artifact.id)}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy-agent-artifact-row__glyph"
                data-happy-desktop-ui="happy-agent-artifact-row-glyph"
                data-type={artifact.type}
            >
                <ArtifactTypeGlyph size={glyphSize} type={artifact.type} />
            </span>
            <span className="happy-agent-artifact-row__text">
                <span className="happy-agent-artifact-row__headline">
                    <span className="happy-agent-artifact-row__title">
                        {artifact.title || "Untitled"}
                    </span>
                    {deleted ? <Badge label="Deleted" variant="danger" /> : null}
                    <span
                        className="happy-agent-artifact-row__version"
                        title={`Version ${String(artifact.latestVersion)}`}
                    >
                        v{artifact.latestVersion}
                    </span>
                </span>
                <span className="happy-agent-artifact-row__meta">
                    {meta.map((part, index) => (
                        // A fixed sequence of facts, never reordered.
                        <Fragment key={index}>
                            {index > 0 ? (
                                <span
                                    aria-hidden="true"
                                    className="happy-agent-artifact-row__meta-dot"
                                >
                                    ·
                                </span>
                            ) : null}
                            <span className="happy-agent-artifact-row__meta-part">{part}</span>
                        </Fragment>
                    ))}
                    <span aria-hidden="true" className="happy-agent-artifact-row__meta-dot">
                        ·
                    </span>
                    {/* When is the one fact a narrow row must keep whole. */}
                    <span className="happy-agent-artifact-row__meta-time">{changed}</span>
                </span>
            </span>
        </button>
    );
}
