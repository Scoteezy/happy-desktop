import { Banner } from "../../Banner";
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
 * expected to run reads as a preview rather than as broken.
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
            <div className="happy-agent-artifact-html__notice">
                <Banner tone="neutral" title="Static preview">
                    {props.omitted.length > 0
                        ? `Scripts do not run here, and ${String(props.omitted.length)} large ${props.omitted.length === 1 ? "file is" : "files are"} left out of the page. Download the files to see it whole.`
                        : "Scripts do not run here. Download the files to see the page as it was written."}
                </Banner>
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
