import {
    happyReferencePlaceholder,
    isKnownHappyReferenceKind,
    parseHappyReferences,
    replaceHappyReferences,
    type HappyReference,
} from "happy-desktop-state";

/**
 * How one Happy reference in a message reads right now.
 *
 * - `link` — something the reader can open: its live title, and whether the
 *   thing is busy (an agent working, a service running) so the link can say so.
 * - `text` — something that cannot be opened: deleted, unknown, not visible to
 *   this reader, or a kind this build does not know. It reads as plain words.
 */
export type MessageReferenceView =
    | { readonly type: "link"; readonly label: string; readonly busy: boolean }
    | { readonly type: "text"; readonly label: string };

/**
 * The live side of the references a transcript shows, supplied by the surface
 * that owns the stores behind them. `view` is asked while rendering and while
 * sizing rows, so it must be a pure read of the owner's current snapshot.
 */
export interface MessageReferences {
    view(reference: HappyReference): MessageReferenceView;
    open(reference: HappyReference): void;
}

/**
 * The scheme of the links this module writes. A random part is minted once per
 * load so a link an author wrote by hand can never pass for one of these: only
 * a tag the grammar accepted becomes a reference link.
 */
const REFERENCE_SCHEME = `happy-reference-${Math.random().toString(36).slice(2, 10)}`;
const REFERENCE_PREFIX = `${REFERENCE_SCHEME}:`;

/** The view a surface with no live stores behind it gives every reference. */
function placeholderView(reference: HappyReference): MessageReferenceView {
    return { type: "text", label: happyReferencePlaceholder(reference) };
}

/** What one reference reads as: a kind this build does not know is never asked about. */
function referenceView(
    reference: HappyReference,
    references: MessageReferences | undefined,
): MessageReferenceView {
    if (references === undefined || !isKnownHappyReferenceKind(reference.kind))
        return placeholderView(reference);
    return references.view(reference);
}

/** Escapes a label so Markdown reads every character of it literally. */
function labelEscape(label: string): string {
    return label
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/[!-/:-@[-`{-~]/gu, (character) => `\\${character}`);
}

function referenceHref(reference: HappyReference): string {
    const query = new URLSearchParams();
    if (reference.version !== undefined) query.set("version", String(reference.version));
    if (reference.workspaceId !== undefined) query.set("workspace", reference.workspaceId);
    const search = query.toString();
    return `${REFERENCE_PREFIX}${reference.kind}/${reference.id}${search ? `?${search}` : ""}`;
}

/** The reference a link written by `messageReferencesResolve` points at, or nothing. */
export function messageReferenceFromHref(href: string | undefined): HappyReference | undefined {
    if (href === undefined || !href.startsWith(REFERENCE_PREFIX)) return undefined;
    const match = /^([a-z][a-z0-9-]*)\/([A-Za-z0-9_-]+)(?:\?(.*))?$/u.exec(
        href.slice(REFERENCE_PREFIX.length),
    );
    if (!match) return undefined;
    const reference: HappyReference = { kind: match[1]!, id: match[2]! };
    const query = new URLSearchParams(match[3] ?? "");
    const version = query.get("version");
    if (version !== null) reference.version = Number(version);
    const workspaceId = query.get("workspace");
    if (workspaceId !== null) reference.workspaceId = workspaceId;
    return reference;
}

/** Whether a URL is a reference link, so the Markdown URL filter keeps it. */
export function messageReferenceHrefIs(url: string): boolean {
    return url.startsWith(REFERENCE_PREFIX);
}

/**
 * The Markdown a message body is rendered and measured from: every Happy
 * reference tag replaced by what it reads as now.
 *
 * An openable reference becomes an ordinary Markdown link whose text is the
 * escaped live title, so it renders and wraps exactly like any other link in
 * the body and the row-height model measures the same words the reader sees.
 * An inert one becomes the escaped label as plain text. While a reply is
 * still streaming, a tag that has only partly arrived is held back rather
 * than flashing as raw text. Tags in code stay literal.
 *
 * Rendering and row geometry must both go through this with the same inputs;
 * a body with no tag in it comes back unchanged.
 */
export function messageReferencesResolve(
    text: string,
    references: MessageReferences | undefined,
    streaming: boolean,
): string {
    if (!streaming && !text.includes("<happy-")) return text;
    if (streaming && !text.includes("<")) return text;
    return replaceHappyReferences(
        text,
        (reference) => {
            const view = referenceView(reference, references);
            const label =
                labelEscape(view.label) || labelEscape(happyReferencePlaceholder(reference));
            return view.type === "link" ? `[${label}](${referenceHref(reference)})` : label;
        },
        { streaming },
    );
}

/**
 * One line of a body as plain words, for a one-line summary that is not
 * rendered as Markdown: every reference reads as its label.
 */
export function messageReferencesPlainText(
    text: string,
    references: MessageReferences | undefined,
): string {
    if (!text.includes("<happy-")) return text;
    return replaceHappyReferences(text, (reference) => referenceView(reference, references).label);
}

/**
 * What the references in one body read as, for caches keyed by an entry rather
 * than by its text: two bodies with the same signature lay out identically.
 * Empty when the body names nothing. Busy is left out because it only paints.
 */
export function messageReferencesSignature(
    text: string,
    references: MessageReferences | undefined,
): string {
    if (!text.includes("<happy-")) return "";
    return parseHappyReferences(text)
        .flatMap((segment) => {
            if (segment.type === "text") return [];
            const view = referenceView(segment.reference, references);
            return [`${view.type}:${view.label}`];
        })
        .join("\u0000");
}
