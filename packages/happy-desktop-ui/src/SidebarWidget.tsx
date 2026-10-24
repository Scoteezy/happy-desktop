import { useState } from "react";
import { artifactHtmlDocument } from "./pages/artifacts/artifactHtmlDocument";

/** The tallest a widget stands in the sidebar; what it holds below that is cut off. */
export const SIDEBAR_WIDGET_HEIGHT_MAX = 240;

export interface SidebarWidgetProps {
    /** The widget's markup, which may be anyone's. */
    readonly html: string;
    /** What the widget is, for anyone who cannot see it. */
    readonly title: string;
}

/**
 * A widget in the sidebar: someone else's HTML, drawn in the window and given
 * nothing that window holds.
 *
 * It is the static artifact page's frame, on the sidebar's own background: a
 * `srcdoc` document that runs no script — the sandbox grants none and the
 * window's policy, which the frame inherits, allows none inline — and loads
 * nothing but what it carries, so it has no token, no API and no way to the
 * daemon or the app. Because nothing in it can run, the frame may keep the
 * window's origin, which is the only way the sidebar can read how tall it is;
 * it stands exactly that tall, up to `SIDEBAR_WIDGET_HEIGHT_MAX`.
 *
 * The frame takes no pointer: the row around it is what is grabbed, carried
 * and opened for its menu, like any row.
 */
export function SidebarWidget(props: SidebarWidgetProps) {
    const [height, heightSet] = useState(0);
    const document = artifactHtmlDocument({
        assets: new Map(),
        entryPath: "widget.html",
        surface: "sidebar",
        text: props.html,
    });
    return (
        <iframe
            className="happy-sidebar-widget"
            data-happy-desktop-ui="sidebar-widget"
            referrerPolicy="no-referrer"
            ref={(frame) => {
                if (!frame) return;
                // Read when the document is in and whenever the row's width
                // reflows it; a frame without script changes no other way.
                const measure = () => {
                    const root = frame.contentDocument?.documentElement;
                    if (!root) return;
                    heightSet(
                        Math.min(
                            SIDEBAR_WIDGET_HEIGHT_MAX,
                            Math.ceil(root.getBoundingClientRect().height),
                        ),
                    );
                };
                frame.addEventListener("load", measure);
                const observer = new ResizeObserver(measure);
                observer.observe(frame);
                return () => {
                    frame.removeEventListener("load", measure);
                    observer.disconnect();
                };
            }}
            // No `allow-scripts`, so keeping the origin hands the page nothing.
            sandbox="allow-same-origin"
            srcDoc={document}
            style={{ height: `${String(height)}px` }}
            tabIndex={-1}
            title={props.title}
        />
    );
}
