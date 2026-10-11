import type { HappyAgentArtifactStaticReason } from "happy-desktop-state";
import { Banner, type BannerTone } from "../../Banner";
import { artifactHtmlDocument } from "./artifactHtmlDocument";

export interface HappyAgentArtifactHtmlFrameProps {
    /** The entry's path in the version, which every reference in it is relative to. */
    entryPath: string;
    /** The entry's markup. */
    text: string;
    /** The version's other files by path, as `data:` URLs. */
    assets: ReadonlyMap<string, string>;
    /** Files too large to hand to the page, which it will find missing. */
    omitted: readonly string[];
    /** Why the page is drawn here rather than run, which the reader is told. */
    reason: HappyAgentArtifactStaticReason;
    /** The page's name, for anyone who cannot see it. */
    title: string;
}

/**
 * An HTML artifact shown as a static page.
 *
 * The page is built from its own files alone and handed to a `srcdoc` frame
 * whose sandbox grants no script and no origin: it is a stranger's markup in
 * the app's own window, so it gets nothing that window holds — not its
 * credentials, not its storage, not a way to reach the daemon. The only grant
 * is a link opening outside the frame, where the window decides where a web
 * address goes. What that costs the page is said above it, so a page that
 * expected to run reads as a preview rather than as broken — and why it is one,
 * since an app that can run the page but is too old to, or failed to, is
 * something the reader can do something about.
 */
export function HappyAgentArtifactHtmlFrame(props: HappyAgentArtifactHtmlFrameProps) {
    const document = artifactHtmlDocument({
        assets: props.assets,
        entryPath: props.entryPath,
        text: props.text,
    });
    return (
        <div
            className="happy-agent-artifact-html"
            data-happy-desktop-ui="happy-agent-artifact-html"
        >
            <div
                className="happy-agent-artifact-html__notice"
                data-reason={props.reason.type}
                data-testid="happy-agent-artifact-static-notice"
            >
                <StaticNotice omitted={props.omitted.length} reason={props.reason} />
            </div>
            <iframe
                className="happy-agent-artifact-html__frame"
                data-happy-desktop-ui="happy-agent-artifact-html-frame"
                referrerPolicy="no-referrer"
                // No `allow-scripts` and no `allow-same-origin`: the page is
                // inert markup in an opaque origin. Popups let a link to the
                // web leave the frame through the window's own link handling.
                sandbox="allow-popups"
                srcDoc={document}
                title={props.title}
            />
        </div>
    );
}

/** What the reader is told above a static page: why it is not running, and what is missing. */
function StaticNotice(props: { reason: HappyAgentArtifactStaticReason; omitted: number }) {
    const missing =
        props.omitted > 0
            ? ` ${String(props.omitted)} large ${props.omitted === 1 ? "file is" : "files are"} also left out of it.`
            : "";
    const notice: { tone: BannerTone; title: string; text: string } =
        props.reason.type === "app-outdated"
            ? {
                  tone: "warning",
                  title: "Update Happy to run this page",
                  text: `This version of the Happy app shows the page without running its scripts. Update the app and restart it to see the page live.${missing}`,
              }
            : props.reason.type === "failed"
              ? {
                    tone: "danger",
                    title: "The page could not be run",
                    text: `${props.reason.error.message} This is a static preview of it, without its scripts.${missing}`,
                }
              : {
                    tone: "neutral",
                    title: "Static preview",
                    text: `Scripts do not run here.${missing} Download the files to see the page as it was written.`,
                };
    return (
        <Banner tone={notice.tone} title={notice.title}>
            {notice.text}
        </Banner>
    );
}
