import { useState, type CSSProperties, type ReactNode } from "react";
import {
    happyAgentArtifactReferenceResolve,
    happyAgentArtifactTypeLabel,
    type HappyAgentArtifact,
    type HappyAgentArtifactContent,
    type HappyAgentArtifactDeletion,
    type HappyAgentArtifactFileLink,
    type HappyAgentArtifactVersion,
    type HappyAgentArtifactViewerSnapshot,
} from "happy-desktop-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { HtmlPreviewFrame } from "../../HtmlPreviewFrame";
import type { HtmlPreviewRenderer } from "../../htmlPreview";
import { ImageViewer } from "../../ImageViewer";
import { MarkdownDocument, type MarkdownDocumentReferences } from "../../MarkdownDocument";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { VideoViewer } from "../../VideoViewer";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import {
    ArtifactTypeGlyph,
    artifactFileName,
    artifactMadeBy,
    artifactSizeText,
    type HappyAgentArtifactLabels,
} from "./artifactPresentation";
import { ArtifactHeader } from "./ArtifactHeader";
import { HappyAgentArtifactHtmlFrame } from "./HappyAgentArtifactHtmlFrame";

export interface HappyAgentArtifactViewerProps {
    /** The open artifact, its history, and the version on screen, as the viewer store holds them. */
    viewer: HappyAgentArtifactViewerSnapshot;
    labels: HappyAgentArtifactLabels;
    onVersionSelect: (number: number) => void;
    /** Reads the next page of older versions. */
    onVersionsLoadMore: () => void;
    onDeletionRequest: () => void;
    onDeletionCancel: () => void;
    onDeletionConfirm: () => void;
    /**
     * Saves one file of the version on screen. A link in the artifact to another
     * of its files lands here too: the file is the artifact's, and there is no
     * page here to navigate to.
     */
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
    /** Leaves the viewer for wherever it was opened from. */
    onBack?: () => void;
    /**
     * The host's isolated guest for an HTML version served as a site. Absent
     * where the host has none, in which case the viewer never holds a site.
     */
    renderPage?: HtmlPreviewRenderer;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentArtifactViewer — one artifact: what it is, where it was made and by
 * whom, every version of it, and the version on screen shown the way its type
 * reads best.
 *
 * Every file it shows comes from one numbered version, so a page and the
 * pictures it names can never come from two different versions. The history
 * beside it picks which version that is; picking the newest follows the newest
 * again as the artifact changes. Deleting asks first, and names the version it
 * is deleting so a change made meanwhile is not deleted unseen.
 */
export function HappyAgentArtifactViewer(props: HappyAgentArtifactViewerProps) {
    const viewer = props.viewer;
    const [historyShown, setHistoryShown] = useState(true);
    const state = viewer.artifact;
    const artifact = state.type === "ready" ? state.value : undefined;
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    return (
        <div
            className={["happy-agent-artifact-viewer", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-artifact-viewer"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {artifact ? (
                <>
                    <ArtifactHeader
                        className="happy-agent-artifact-viewer__header"
                        {...(back ? { leading: back } : {})}
                        subtitle={happyAgentArtifactTypeLabel(artifact.type)}
                        title={artifact.title || "Untitled"}
                        trailing={
                            <>
                                {artifact.status === "active" ? (
                                    <Button
                                        aria-pressed={historyShown}
                                        icon="history"
                                        onClick={() => setHistoryShown(!historyShown)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        History
                                    </Button>
                                ) : null}
                                {artifact.status === "active" ? (
                                    <Button
                                        data-testid="happy-agent-artifact-delete"
                                        disabled={viewer.deletion.phase !== "idle"}
                                        icon="trash"
                                        onClick={props.onDeletionRequest}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Delete
                                    </Button>
                                ) : null}
                            </>
                        }
                    />
                    <ArtifactFacts
                        artifact={artifact}
                        labels={props.labels}
                        onLatestShow={() => props.onVersionSelect(artifact.latestVersion)}
                        {...(viewer.version ? { version: viewer.version } : {})}
                        {...(viewer.versionSelected === undefined
                            ? {}
                            : { versionSelected: viewer.versionSelected })}
                    />
                    <div
                        className="happy-agent-artifact-viewer__main"
                        data-happy-desktop-ui="happy-agent-artifact-viewer-main"
                    >
                        <div
                            className="happy-agent-artifact-viewer__body"
                            data-happy-desktop-ui="happy-agent-artifact-viewer-body"
                        >
                            {artifact.status === "deleted" ? (
                                <EmptyState
                                    description={deletedSentence(artifact, props.labels)}
                                    icon="trash"
                                    size="panel"
                                    title="This artifact was deleted"
                                />
                            ) : (
                                <ArtifactContent
                                    content={viewer.content}
                                    files={viewer.files}
                                    key={viewer.version?.number ?? 0}
                                    onFileDownload={props.onFileDownload}
                                    {...(props.renderPage ? { renderPage: props.renderPage } : {})}
                                    title={artifact.title}
                                />
                            )}
                        </div>
                        {artifact.status === "active" && historyShown ? (
                            <ArtifactHistory
                                artifact={artifact}
                                labels={props.labels}
                                onFileDownload={props.onFileDownload}
                                onVersionSelect={props.onVersionSelect}
                                onVersionsLoadMore={props.onVersionsLoadMore}
                                viewer={viewer}
                            />
                        ) : null}
                    </div>
                    {viewer.deletion.phase === "idle" ? null : (
                        <ArtifactDeleteDialog
                            deletion={viewer.deletion}
                            onCancel={props.onDeletionCancel}
                            onConfirm={props.onDeletionConfirm}
                            title={artifact.title}
                        />
                    )}
                </>
            ) : (
                <>
                    <ArtifactHeader
                        className="happy-agent-artifact-viewer__header"
                        {...(back ? { leading: back } : {})}
                        title="Artifact"
                    />
                    {state.type === "missing" ? (
                        <EmptyState
                            description="Nothing with this name is published on this Happy Agent."
                            icon="package"
                            size="panel"
                            title="Artifact not found"
                        />
                    ) : state.type === "error" ? (
                        <EmptyState
                            description={state.error.message}
                            icon="alert"
                            size="panel"
                            title="The artifact could not be read"
                        />
                    ) : (
                        <EmptyState
                            description="Reading the artifact and its history."
                            icon="clock"
                            size="panel"
                            title="Loading artifact…"
                        />
                    )}
                </>
            )}
        </div>
    );
}

function deletedSentence(artifact: HappyAgentArtifact, labels: HappyAgentArtifactLabels): string {
    const by = artifact.deletedBy ? labels.author(artifact.deletedBy) : "Someone";
    const where = labels.source(artifact.deletedSource);
    const when = artifact.deletedAt === null ? "" : ` on ${labels.time(artifact.deletedAt)}`;
    return `Deleted by ${artifactMadeBy(by, where)}${when}. Its versions are no longer served.`;
}

/**
 * Who made the artifact and where, who changed it last and where, and which
 * version is on screen. When the reader is looking back at an older version,
 * that is said here with the way back to the newest, since everything below
 * now describes a version that is no longer current.
 */
function ArtifactFacts(props: {
    artifact: HappyAgentArtifact;
    labels: HappyAgentArtifactLabels;
    version?: HappyAgentArtifactVersion;
    versionSelected?: number;
    onLatestShow: () => void;
}) {
    const artifact = props.artifact;
    const labels = props.labels;
    const shown = props.versionSelected ?? artifact.latestVersion;
    return (
        <div
            className="happy-agent-artifact-viewer__facts"
            data-happy-desktop-ui="happy-agent-artifact-viewer-facts"
        >
            <span
                aria-hidden="true"
                className="happy-agent-artifact-viewer__glyph"
                data-type={artifact.type}
            >
                <ArtifactTypeGlyph size={16} type={artifact.type} />
            </span>
            <dl className="happy-agent-artifact-viewer__fact-list">
                <div className="happy-agent-artifact-viewer__fact">
                    <dt>Version</dt>
                    <dd>
                        {artifact.status === "deleted"
                            ? `${String(artifact.latestVersion)} (deleted)`
                            : `${String(shown)} of ${String(artifact.latestVersion)}`}
                    </dd>
                </div>
                <div className="happy-agent-artifact-viewer__fact">
                    <dt>Created</dt>
                    <dd>
                        {artifactMadeBy(
                            labels.author(artifact.createdBy),
                            labels.source(artifact.source),
                        )}{" "}
                        · {labels.time(artifact.createdAt)}
                    </dd>
                </div>
                {artifact.latestVersion > 1 || artifact.status === "deleted" ? (
                    <div className="happy-agent-artifact-viewer__fact">
                        <dt>{artifact.status === "deleted" ? "Deleted" : "Updated"}</dt>
                        <dd>
                            {artifactMadeBy(
                                labels.author(artifact.updatedBy),
                                labels.source(artifact.updatedSource),
                            )}{" "}
                            · {labels.time(artifact.updatedAt)}
                        </dd>
                    </div>
                ) : null}
                <div className="happy-agent-artifact-viewer__fact">
                    <dt>Files</dt>
                    <dd>
                        {String(artifact.fileCount)} · {artifactSizeText(artifact.size)}
                    </dd>
                </div>
            </dl>
            {props.versionSelected !== undefined && artifact.status === "active" ? (
                <div className="happy-agent-artifact-viewer__older">
                    <Banner
                        action={{ label: "Show latest", onClick: props.onLatestShow }}
                        tone="info"
                        title={`Showing version ${String(shown)}`}
                    >
                        {props.version && props.version.number === shown
                            ? `Made by ${artifactMadeBy(labels.author(props.version.createdBy), labels.source(props.version.source))} · ${labels.time(props.version.createdAt)}.`
                            : "An older version of this artifact."}
                    </Banner>
                </div>
            ) : null}
        </div>
    );
}

/** The version on screen, shown the way its type reads best. */
function ArtifactContent(props: {
    content: HappyAgentArtifactContent;
    files: readonly HappyAgentArtifactFileLink[];
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
    renderPage?: HtmlPreviewRenderer;
    title: string;
}): ReactNode {
    const content = props.content;
    switch (content.type) {
        case "loading":
            return (
                <EmptyState
                    description="Reading this version's files."
                    icon="clock"
                    size="panel"
                    title="Loading…"
                />
            );
        case "error":
            return (
                <div className="happy-agent-artifact-viewer__fallback">
                    <Banner tone="danger" title="This version could not be shown">
                        {content.error.message}
                    </Banner>
                    <ArtifactFileList files={props.files} onFileDownload={props.onFileDownload} />
                </div>
            );
        case "markdown": {
            const fileOf = (path: string) => props.files.find((link) => link.file.path === path);
            const references: MarkdownDocumentReferences = {
                image: (src) => {
                    const target = happyAgentArtifactReferenceResolve(content.entryPath, src);
                    return target.type === "file" ? content.files.get(target.path) : undefined;
                },
                link: (href) => {
                    const target = happyAgentArtifactReferenceResolve(content.entryPath, href);
                    return target.type === "file" && content.files.has(target.path)
                        ? target.path
                        : undefined;
                },
            };
            return (
                <MarkdownDocument
                    onFileOpen={(path) => {
                        const link = fileOf(path);
                        if (link) props.onFileDownload(link);
                    }}
                    references={references}
                    text={content.text}
                />
            );
        }
        case "html":
            return content.page.kind === "site" ? (
                <HtmlPreviewFrame
                    data-testid="happy-agent-artifact-page"
                    {...(props.renderPage ? { renderContent: props.renderPage } : {})}
                    source={content.page.url}
                />
            ) : (
                <HappyAgentArtifactHtmlFrame
                    assets={content.page.assets}
                    entryPath={content.entryPath}
                    omitted={content.page.omitted}
                    reason={content.page.reason}
                    text={content.page.text}
                    title={props.title || "Web page"}
                />
            );
        case "image":
            return (
                <ImageViewer
                    content={{ type: "url", url: content.image.url }}
                    name={artifactFileName(content.image.file.path)}
                />
            );
        case "image_series":
            return <ArtifactGallery images={content.images} />;
        case "video":
            return (
                <VideoViewer
                    content={{ type: "url", url: content.video.url }}
                    name={artifactFileName(content.video.file.path)}
                />
            );
        case "document":
            return content.inlineUrl !== undefined ? (
                <iframe
                    className="happy-agent-artifact-viewer__document"
                    data-happy-desktop-ui="happy-agent-artifact-document"
                    src={content.inlineUrl}
                    title={artifactFileName(content.document.file.path)}
                />
            ) : (
                <div className="happy-agent-artifact-viewer__fallback">
                    <ArtifactFileCard
                        link={content.document}
                        onFileDownload={props.onFileDownload}
                    />
                </div>
            );
        case "files":
            return (
                <div className="happy-agent-artifact-viewer__fallback">
                    <Banner tone="neutral" title="Shown as its files">
                        This kind of artifact has no viewer here yet. Its files can still be
                        downloaded.
                    </Banner>
                    <ArtifactFileList files={props.files} onFileDownload={props.onFileDownload} />
                </div>
            );
    }
}

/**
 * The pictures of an image series in the order they were listed, one large
 * with the whole run below it. Which one is large is this surface's own
 * business, and a new version starts again from the first.
 */
function ArtifactGallery(props: { images: readonly HappyAgentArtifactFileLink[] }) {
    const [selected, setSelected] = useState(0);
    const shown = props.images[Math.min(selected, props.images.length - 1)];
    if (!shown) return <EmptyState icon="image" size="panel" title="This series has no pictures" />;
    return (
        <div
            className="happy-agent-artifact-gallery"
            data-happy-desktop-ui="happy-agent-artifact-gallery"
        >
            <div className="happy-agent-artifact-gallery__stage">
                <ImageViewer
                    content={{ type: "url", url: shown.url }}
                    name={artifactFileName(shown.file.path)}
                />
            </div>
            <ScrollArea
                axes="horizontal"
                className="happy-agent-artifact-gallery__strip"
                data-happy-desktop-ui="happy-agent-artifact-gallery-strip"
                viewportClassName="happy-agent-artifact-gallery__strip-viewport"
            >
                <div
                    aria-label="Pictures in this series"
                    className="happy-agent-artifact-gallery__thumbs"
                    role="group"
                >
                    {props.images.map((image, index) => (
                        <button
                            aria-label={artifactFileName(image.file.path)}
                            aria-pressed={image === shown}
                            className="happy-agent-artifact-gallery__thumb"
                            data-happy-desktop-ui="happy-agent-artifact-gallery-thumb"
                            key={image.file.path}
                            onClick={() => setSelected(index)}
                            title={`${String(index + 1)} of ${String(props.images.length)} · ${artifactFileName(image.file.path)}`}
                            type="button"
                        >
                            <img
                                alt=""
                                className="happy-agent-artifact-gallery__thumb-image"
                                draggable={false}
                                loading="lazy"
                                src={image.url}
                            />
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

/** One file stated plainly — its name, its kind, its size — with the way to save it. */
function ArtifactFileCard(props: {
    link: HappyAgentArtifactFileLink;
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    const file = props.link.file;
    return (
        <div
            className="happy-agent-artifact-viewer__file-card"
            data-happy-desktop-ui="happy-agent-artifact-file-card"
        >
            <span aria-hidden="true" className="happy-agent-artifact-viewer__file-card-glyph">
                <ArtifactTypeGlyph size={20} type="document" />
            </span>
            <span className="happy-agent-artifact-viewer__file-card-text">
                <span className="happy-agent-artifact-viewer__file-card-name">
                    {artifactFileName(file.path)}
                </span>
                <span className="happy-agent-artifact-viewer__file-card-meta">
                    {file.mimeType} · {artifactSizeText(file.size)}
                </span>
            </span>
            <Button onClick={() => props.onFileDownload(props.link)} size="small">
                Download
            </Button>
        </div>
    );
}

/** Every file of the version on screen, each one savable. */
function ArtifactFileList(props: {
    files: readonly HappyAgentArtifactFileLink[];
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    return (
        <ul
            className="happy-agent-artifact-files"
            data-happy-desktop-ui="happy-agent-artifact-files"
        >
            {props.files.map((link) => (
                <li className="happy-agent-artifact-files__item" key={link.file.path}>
                    <span className="happy-agent-artifact-files__text">
                        <span className="happy-agent-artifact-files__name" title={link.file.path}>
                            {link.file.path}
                        </span>
                        <span className="happy-agent-artifact-files__meta">
                            {artifactSizeText(link.file.size)}
                        </span>
                    </span>
                    <Button
                        aria-label={`Download ${artifactFileName(link.file.path)}`}
                        iconOnly
                        onClick={() => props.onFileDownload(link)}
                        size="small"
                        title="Download"
                        variant="ghost"
                    >
                        <Ionicon name="download-outline" size={14} />
                    </Button>
                </li>
            ))}
        </ul>
    );
}

/**
 * The column beside the artifact: every version, newest first, each with who
 * made it, where, and when; then the files of the version on screen.
 */
function ArtifactHistory(props: {
    artifact: HappyAgentArtifact;
    viewer: HappyAgentArtifactViewerSnapshot;
    labels: HappyAgentArtifactLabels;
    onVersionSelect: (number: number) => void;
    onVersionsLoadMore: () => void;
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    const viewer = props.viewer;
    const shown = viewer.versionSelected ?? props.artifact.latestVersion;
    return (
        <aside
            aria-label="Versions and files"
            className="happy-agent-artifact-history"
            data-happy-desktop-ui="happy-agent-artifact-history"
        >
            <ScrollArea
                className="happy-agent-artifact-history__scroll"
                viewportClassName="happy-agent-artifact-history__scroll-viewport"
            >
                <div className="happy-agent-artifact-history__content">
                    <h2 className="happy-agent-artifact-history__heading">Versions</h2>
                    {viewer.versions.length === 0 ? (
                        <p className="happy-agent-artifact-history__note">
                            {viewer.versionsLoading
                                ? "Reading the history…"
                                : "No history to show."}
                        </p>
                    ) : (
                        <ol
                            className="happy-agent-artifact-history__versions"
                            data-happy-desktop-ui="happy-agent-artifact-versions"
                        >
                            {viewer.versions.map((version) => (
                                <li key={version.number}>
                                    <button
                                        aria-current={version.number === shown ? "true" : undefined}
                                        className="happy-agent-artifact-history__version"
                                        data-happy-desktop-ui="happy-agent-artifact-version"
                                        data-version={version.number}
                                        onClick={() => props.onVersionSelect(version.number)}
                                        type="button"
                                    >
                                        <span className="happy-agent-artifact-history__version-line">
                                            <span className="happy-agent-artifact-history__version-number">
                                                Version {version.number}
                                            </span>
                                            {version.number === props.artifact.latestVersion ? (
                                                <Badge label="Latest" variant="outline" />
                                            ) : null}
                                        </span>
                                        <span className="happy-agent-artifact-history__version-meta">
                                            {artifactMadeBy(
                                                props.labels.author(version.createdBy),
                                                props.labels.source(version.source),
                                            )}
                                        </span>
                                        <span className="happy-agent-artifact-history__version-meta">
                                            {props.labels.time(version.createdAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                    {viewer.versionsHasMore ? (
                        <Button
                            loading={viewer.versionsLoading}
                            onClick={props.onVersionsLoadMore}
                            size="small"
                            variant="ghost"
                        >
                            Show older versions
                        </Button>
                    ) : null}
                    {viewer.files.length > 0 ? (
                        <>
                            <h2 className="happy-agent-artifact-history__heading">
                                Files in version {shown}
                            </h2>
                            <ArtifactFileList
                                files={viewer.files}
                                onFileDownload={props.onFileDownload}
                            />
                        </>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}

/**
 * The confirmation before an artifact is deleted for everyone. It stays up
 * while the deletion is under way, and says so inside itself when the daemon
 * refuses — most often because the artifact changed while it was open.
 */
function ArtifactDeleteDialog(props: {
    deletion: Exclude<HappyAgentArtifactDeletion, { readonly phase: "idle" }>;
    title: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const pending = props.deletion.phase === "pending";
    const title = props.title || "Untitled";
    return (
        <ModalOverlay onDismiss={pending ? undefined : props.onCancel}>
            <Modal
                className="happy-agent-artifact-delete-dialog"
                footer={
                    <Box className="happy-agent-artifact-delete-dialog__actions">
                        <Button disabled={pending} onClick={props.onCancel} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-artifact-delete-confirm"
                            loading={pending}
                            onClick={props.onConfirm}
                            variant="danger"
                        >
                            {pending ? "Deleting…" : "Delete artifact"}
                        </Button>
                    </Box>
                }
                icon="trash"
                onClose={pending ? undefined : props.onCancel}
                size="small"
                title={`Delete “${title}”?`}
                tone="danger"
            >
                <Box className="happy-agent-artifact-delete-dialog__body">
                    {props.deletion.phase === "failed" ? (
                        <Banner tone="danger" title="Not deleted">
                            {props.deletion.error.message}
                        </Banner>
                    ) : null}
                    <span className="happy-agent-artifact-delete-dialog__message">
                        This deletes {title} for everyone. Its versions stop being served, and it
                        stays listed only as deleted.
                    </span>
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
