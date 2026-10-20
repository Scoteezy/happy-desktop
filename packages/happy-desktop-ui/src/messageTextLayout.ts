import {
    clearCache,
    layout,
    layoutNextLine,
    layoutNextLineRange,
    materializeLineRange,
    measureNaturalWidth,
    prepare,
    prepareWithSegments,
    type LayoutCursor,
    type PreparedText,
    type PreparedTextWithSegments,
} from "@chenglou/pretext";
import {
    measureRichInlineStats,
    prepareRichInline,
    walkRichInlineLineRanges,
    type PreparedRichInline,
    type RichInlineItem,
} from "@chenglou/pretext/rich-inline";
import {
    mathDisplayHeightMeasure,
    mathFontsSubscribe,
    mathFormulaRender,
    mathInlineBoxMeasure,
    mathLayoutClear,
    type MathInlineBox,
} from "./mathFormulaRender";
import {
    MERMAID_DIAGRAM_BORDER,
    mermaidDiagramMeasure,
    mermaidDiagramNaturalHeight,
    type MermaidDiagramDimensions,
} from "./mermaidDiagramRender";
import { messageMarkdownParse, type MessageMarkdownAst } from "./messageMarkdownAst";
import { messagePlainTextNormalize } from "./messagePlainText";

/**
 * Height of chat body copy, resolved from the font and the measure instead of
 * from a mounted element.
 *
 * The virtualized message list needs a row's height *before* that row mounts: a
 * constant guess makes the scrollbar lie and turns every offset the reader
 * scrolls into a correction. Pretext resolves the same line breaking the browser
 * would, so an unmounted row is sized to within a line of its painted height.
 *
 * Every constant below mirrors `styles/message.css` and the `--happy-font-*`
 * tokens in `theme.css`. They are duplicated deliberately — reading them back
 * out of the cascade needs a mounted element, which is the thing this module
 * exists to avoid — so a change to either must be made here too.
 */
const UI_FAMILY = '"happy Figtree", system-ui, sans-serif';
const MONO_FAMILY = '"happy Mono", ui-monospace, monospace';
/** `.happy-message__body p` — the shape almost every chat line takes. */
const PARAGRAPH_SIZE = 16;
const PARAGRAPH_LINE = 24;
/** `.happy-message__body pre code`, which never wraps (`white-space: pre`). */
const CODE_LINE = 20;
const CODE_PADDING = 16;
/** `.happy-message__body--markdown code`: 14px mono with 5px of inline padding each side. */
const INLINE_CODE_FONT = `14px ${MONO_FAMILY}`;
/** `.happy-message__body > * + *` stacking, and the wider margin around `pre`. */
const BLOCK_GAP = 8;
const CODE_GAP = 12;
/** `hr`, and the 8px vertical / 12px horizontal padding inside every table cell. */
const RULE_HEIGHT = 1;
const TABLE_CELL_PADDING = 8;
const TABLE_CELL_INLINE_PADDING = 24;
/** The narrowest a wrapping column gets (padding included): about 13
 * characters of body copy, so no column collapses into a strip of single
 * words. A table whose columns cannot all have this scrolls instead. */
const TABLE_MIN_COLUMN = 136;
/** A prose column's width (padding included) in a table that scrolls anyway:
 * about 28 characters of body copy per line. */
const TABLE_READABLE_COLUMN = 240;
/** The widest a single word holds a column open (padding included) in a
 * table that scrolls anyway; a longer URL or identifier breaks. */
const TABLE_SCROLL_WORD_COLUMN = 400;
/** Inline code in a cell no wider than this — about 22 characters — keeps one
 * line (`.happy-message__table-code-line`), so `agent = "claude"` never wraps at
 * its spaces; longer code wraps like prose. */
const TABLE_CODE_LINE = 185;
/** `blockquote` — a 2px rule plus its 10px inset, taken off the measure. */
const QUOTE_INSET = 12;
/** `ul/ol` indent, and the extra leading between consecutive `li`. */
const LIST_INDENT = 24;
const LIST_ITEM_GAP = 6;
/** Deterministic inline box reserved by a rendered GFM task checkbox. The
 * non-breaking space item beside it models remark-rehype's generated separator. */
const TASK_CHECKBOX_INLINE = 19;
/** The scrollport reports integer client widths while CSS inline layout retains
 * 1/64px units. Admit that one layout unit without accepting a genuinely wider
 * word at the next boundary. */
const INLINE_MEASURE_EPSILON = 1 / 64;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Browser inline layout is the external boundary Pretext cannot describe.
 * Blink decides whether a slice-decorated inline word must fragment from its
 * glyphs plus start/end padding. WebKit first reserves the closing padding,
 * then accounts for both edges after that run is already fragmenting. */
const WEBKIT_INLINE_SLICE =
    typeof navigator !== "undefined" &&
    /AppleWebKit\//u.test(navigator.userAgent) &&
    !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//u.test(navigator.userAgent);
const GECKO_INLINE_SLICE = typeof navigator !== "undefined" && /Gecko\//u.test(navigator.userAgent);
/** Gecko follows UAX #14 and may break after a `/` that precedes a letter, so
 * paths and URLs wrap at their slashes; Blink and WebKit keep such a token
 * whole, and so does Pretext. In Gecko, mark that opportunity with a
 * zero-width break before the text is measured. */
const GECKO_SLASH_BREAK = /\/(?=\p{L})/gu;
function inlineBreaksMark(text: string): string {
    return GECKO_INLINE_SLICE ? text.replace(GECKO_SLASH_BREAK, "/\u200b") : text;
}
/** `.happy-system-notice__text` — 13px copy on a 20px line. */
const NOTICE_SIZE = 13;
const NOTICE_LINE = 20;
let fontsWatched = false;
let fontGeneration = 0;
const fontListeners = new Set<() => void>();
type Dictionary<T> = Record<string, T | undefined>;
const dictionaryCreate = <T>(): Dictionary<T> => Object.create(null) as Dictionary<T>;
/*
 * Width-independent Pretext preparation is most of what laying text out costs,
 * so each cache keeps it under one deliberate memory budget. Retained bytes are
 * estimated from the source, calibrated against Chromium heap measurements of
 * prepared runs: about 14 bytes per source character plus a fixed object graph
 * per prepared run, and every rich-inline item is a prepared run of its own.
 * The estimate is charged once, on a miss, and is an accounting budget rather
 * than an exact heap claim; Pretext's process-global glyph metrics are separate.
 */
const PREPARED_BYTES_BUDGET = 8 * 1_024 * 1_024;
const PREPARED_RUN_BYTES = 800;
const PREPARED_CHAR_BYTES = 16;
type PreparedValue = PreparedText | PreparedRichInline;
type PreparedEntry = {
    /** The dictionary holding this value, so eviction can delete its key. */
    readonly table: Dictionary<PreparedValue>;
    readonly key: string;
    readonly bytes: number;
};
export interface MessageTextLayoutCache {
    /** Font generation this cache was measured against. */
    generation: number;
    /** Width-independent Pretext preparation, grouped by font/white-space then source text. */
    prepared: Dictionary<Dictionary<PreparedText>>;
    /** The same preparation with segment text, grouped the same way. */
    preparedSegments: Dictionary<Dictionary<PreparedTextWithSegments>>;
    /** Final Markdown body heights, grouped by source text then wrapping measure. */
    markdownHeights: Dictionary<Dictionary<number>>;
    /** Intrinsic Beautiful Mermaid geometry, or null for an invalid fence. */
    mermaidDimensions: Dictionary<MermaidDiagramDimensions | null>;
    /** Parsed remark/GFM documents, grouped by immutable message source. */
    markdownTrees: Dictionary<MessageMarkdownAst>;
    /** Footnote numbering and generated-footer geometry from each parsed document. */
    markdownFootnotes: Dictionary<MarkdownFootnotes>;
    /** Final wrapped-run heights, grouped by font, source text, then layout dimensions. */
    runHeights: Dictionary<Dictionary<Dictionary<number>>>;
    /** Prepared mixed-font AST inline runs, grouped by their explicit item signature. */
    richPrepared: Dictionary<PreparedRichInline>;
    /** Natural widths, grouped by font then source text. */
    naturalWidths: Dictionary<Dictionary<number>>;
    /** Least recently used first; Map order is the LRU over every prepared value. */
    preparedOrder: Map<PreparedValue, PreparedEntry>;
    /** Estimated bytes `preparedOrder` retains, at most `PREPARED_BYTES_BUDGET`. */
    preparedBytes: number;
    /** Where this cache's streaming text is measured; see `streamingCache`. */
    streaming?: MessageTextLayoutCache;
}
/**
 * One conversation's text-layout cache. Settled transcript text is retained so
 * revisiting a long history does not reparse it. Streaming text deliberately
 * uses a measurement-local cache: each growing prefix receives the same exact
 * layout without retaining another Markdown tree and prepared run until the
 * view dies. The conversation surface owns the settled cache lifetime.
 */
export function messageTextLayoutCacheCreate(): MessageTextLayoutCache {
    return {
        generation: fontGeneration,
        prepared: dictionaryCreate(),
        preparedSegments: dictionaryCreate(),
        markdownHeights: dictionaryCreate(),
        mermaidDimensions: dictionaryCreate(),
        markdownTrees: dictionaryCreate(),
        markdownFootnotes: dictionaryCreate(),
        runHeights: dictionaryCreate(),
        richPrepared: dictionaryCreate(),
        naturalWidths: dictionaryCreate(),
        preparedOrder: new Map(),
        preparedBytes: 0,
    };
}
/** Standalone callers keep the old no-setup API; chat surfaces supply their own cache. */
const sharedCache = messageTextLayoutCacheCreate();
/**
 * Every cached layout was resolved against whichever face was installed at the
 * time. A webfont arriving later changes real line breaking, so the generation
 * advances once and Pretext's own cache is dropped. Conversation caches clear
 * lazily the next time they are read, without a global registry retaining them.
 */
function watchFonts() {
    if (fontsWatched || typeof document === "undefined" || !document.fonts) return;
    fontsWatched = true;
    /* Canvas measurement does not reliably initiate a webfont request. Ask for
       both owned variable faces explicitly; `document.fonts.ready` alone can
       resolve while an as-yet-unused face is still absent, leaving the model's
       first prepared runs permanently backed by fallback metrics. */
    void Promise.all([
        document.fonts.load(`16px ${UI_FAMILY}`),
        document.fonts.load(`14px ${MONO_FAMILY}`),
    ]).then(fontGenerationAdvance);
    /* KaTeX's faces are requested the first time a formula is measured. */
    mathFontsSubscribe(fontGenerationAdvance);
}
function fontGenerationAdvance() {
    fontGeneration += 1;
    clearCache();
    mathLayoutClear();
    for (const listener of fontListeners) listener();
}
/** Current generation of the faces every text estimate was resolved against. */
export function messageTextLayoutFontGenerationGet(): number {
    return fontGeneration;
}
/** Notifies mounted transcript estimators when webfont arrival changes line breaking. */
export function messageTextLayoutFontGenerationSubscribe(listener: () => void): () => void {
    watchFonts();
    fontListeners.add(listener);
    return () => fontListeners.delete(listener);
}
/** Clears one conversation's text-layout results when the installed font changes. */
export function messageTextLayoutCacheRefresh(cache: MessageTextLayoutCache): boolean {
    watchFonts();
    if (cache.generation === fontGeneration) return false;
    cache.prepared = dictionaryCreate();
    cache.preparedSegments = dictionaryCreate();
    cache.markdownHeights = dictionaryCreate();
    cache.runHeights = dictionaryCreate();
    cache.richPrepared = dictionaryCreate();
    cache.naturalWidths = dictionaryCreate();
    cache.preparedOrder = new Map();
    cache.preparedBytes = 0;
    cache.generation = fontGeneration;
    return true;
}

/**
 * The cache one streaming prefix is measured in. A prefix keeps no tree and no
 * final height: those start empty for every prefix, so a long stream retains
 * nothing per delta. Width-independent preparation is kept, bounded, in this
 * cache's own set, so the blocks that have finished arriving are not prepared
 * again on every delta, and a stream never displaces the settled transcript's.
 */
function streamingCache(cache: MessageTextLayoutCache): MessageTextLayoutCache {
    const scratch = cache.streaming ?? messageTextLayoutCacheCreate();
    cache.streaming = scratch;
    messageTextLayoutCacheRefresh(scratch);
    scratch.markdownHeights = dictionaryCreate();
    scratch.mermaidDimensions = dictionaryCreate();
    scratch.markdownTrees = dictionaryCreate();
    scratch.markdownFootnotes = dictionaryCreate();
    scratch.runHeights = dictionaryCreate();
    scratch.naturalWidths = dictionaryCreate();
    return scratch;
}

/**
 * Height of pre-wrapped monospace output. Newlines remain hard boundaries and
 * each physical line wraps at the same measure as the browser's `pre-wrap`
 * block; a trailing newline does not create another painted line box.
 */
export function monoOutputTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    streaming = false,
): number {
    const lines = text.split("\n");
    if (lines.length > 1 && lines.at(-1) === "") lines.pop();
    /* A line a newline has closed never changes again, even while the output
       is still running, so it is settled text. Only the line still arriving
       is measured apart from the settled cache. */
    const open = streaming && !text.endsWith("\n") ? lines.length - 1 : lines.length;
    let height = 0;
    for (const [index, line] of lines.entries())
        height += runHeight(
            line,
            `12px ${MONO_FAMILY}`,
            18,
            measure,
            index < open ? cache : streamingCache(cache),
        );
    return Math.max(18, height);
}
function cacheReady(cache: MessageTextLayoutCache): MessageTextLayoutCache {
    messageTextLayoutCacheRefresh(cache);
    return cache;
}
/** The cached preparation under `key`, marked most recently used. */
function preparationHit<T extends PreparedValue>(
    cache: MessageTextLayoutCache,
    table: Dictionary<T>,
    key: string,
): T | undefined {
    const hit = table[key];
    if (hit === undefined) return undefined;
    const entry = cache.preparedOrder.get(hit)!;
    cache.preparedOrder.delete(hit);
    cache.preparedOrder.set(hit, entry);
    return hit;
}
/** Retains a new preparation, evicting the least recently used past the budget.
 * A value larger than the whole budget is measured exactly and not retained. */
function preparationRetain<T extends PreparedValue>(
    cache: MessageTextLayoutCache,
    table: Dictionary<T>,
    key: string,
    value: T,
    bytes: number,
): T {
    if (bytes > PREPARED_BYTES_BUDGET) return value;
    while (cache.preparedBytes + bytes > PREPARED_BYTES_BUDGET) {
        const [oldest, entry] = cache.preparedOrder.entries().next().value!;
        cache.preparedOrder.delete(oldest);
        delete entry.table[entry.key];
        cache.preparedBytes -= entry.bytes;
    }
    table[key] = value;
    cache.preparedOrder.set(value, { table: table as Dictionary<PreparedValue>, key, bytes });
    cache.preparedBytes += bytes;
    return value;
}
/** The per-text table for one exact font and white-space mode. */
function preparationTable<T>(
    groups: Dictionary<Dictionary<T>>,
    font: string,
    whiteSpace: "normal" | "pre-wrap",
): Dictionary<T> {
    const key = `${font}\u0000${whiteSpace}`;
    let table = groups[key];
    if (!table) {
        table = dictionaryCreate();
        groups[key] = table;
    }
    return table;
}
function preparedText(
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    whiteSpace: "normal" | "pre-wrap" = "normal",
): PreparedText {
    const ready = cacheReady(cache);
    const table = preparationTable(ready.prepared, font, whiteSpace);
    return (
        preparationHit(ready, table, text) ??
        preparationRetain(
            ready,
            table,
            text,
            prepare(text, font, { whiteSpace }),
            PREPARED_RUN_BYTES + text.length * PREPARED_CHAR_BYTES,
        )
    );
}
function preparedTextSegments(
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    whiteSpace: "normal" | "pre-wrap" = "normal",
): PreparedTextWithSegments {
    const ready = cacheReady(cache);
    const table = preparationTable(ready.preparedSegments, font, whiteSpace);
    return (
        preparationHit(ready, table, text) ??
        preparationRetain(
            ready,
            table,
            text,
            prepareWithSegments(text, font, { whiteSpace }),
            PREPARED_RUN_BYTES + text.length * PREPARED_CHAR_BYTES,
        )
    );
}
/** Painted height of one wrapped run, never less than a single line box. */
function runHeight(
    text: string,
    font: string,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
    whiteSpace: "normal" | "pre-wrap" = "normal",
): number {
    if (measure <= 0 || (whiteSpace === "normal" && text.trim().length === 0)) return lineHeight;
    const ready = cacheReady(cache);
    const fontKey = whiteSpace === "normal" ? font : `${font}:pre-wrap`;
    let byText = ready.runHeights[fontKey];
    if (!byText) {
        byText = dictionaryCreate();
        ready.runHeights[fontKey] = byText;
    }
    let layouts = byText[text];
    if (!layouts) {
        layouts = dictionaryCreate();
        byText[text] = layouts;
    }
    const key = `${String(measure)}:${String(lineHeight)}`;
    const hit = layouts[key];
    if (hit !== undefined) return hit;
    const value = preparedText(text, font, ready, whiteSpace);
    const height = Math.max(lineHeight, layout(value, measure, lineHeight).height);
    layouts[key] = height;
    return height;
}

/**
 * One rich-inline item of a Markdown run. A typeset formula is a single atomic
 * item whose advance is its measured width and which carries its line-box
 * extents, so the line it lands on grows to fit it exactly as CSS does.
 */
type MarkdownInlineItem = RichInlineItem & {
    math?: MathInlineBox;
    /** Inline code a table cell keeps on one line, which floors its column. */
    keepsLine?: true;
    /** Carries the next element's leading token in `extraWidth`. */
    glued?: true;
};
/** Stand-in glyph for a formula item; its own advance is subtracted again. */
const MATH_PLACEHOLDER = "x";
function preparedRichItems(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): PreparedRichInline {
    const ready = cacheReady(cache);
    const key = JSON.stringify(
        items.map((item) => [
            item.text,
            item.font,
            item.letterSpacing ?? null,
            item.break ?? null,
            item.extraWidth ?? null,
        ]),
    );
    const hit = preparationHit(ready, ready.richPrepared, key);
    if (hit !== undefined) return hit;
    let bytes = key.length * 2;
    for (const item of items) bytes += PREPARED_RUN_BYTES + item.text.length * PREPARED_CHAR_BYTES;
    return preparationRetain(ready, ready.richPrepared, key, prepareRichInline([...items]), bytes);
}
function richItemsHeight(
    items: readonly MarkdownInlineItem[],
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
): number {
    if (measure <= 0 || items.length === 0) return lineHeight;
    const measured = preparedRichItems(items, cache);
    const relaxedMeasure = measure + INLINE_MEASURE_EPSILON;
    const relaxed = measureRichInlineStats(measured, relaxedMeasure);
    /* Pretext can hang a token slightly beyond its supplied measure. Keep the
       one-layout-unit tolerance only when the resulting line also stays inside
       that contract; otherwise resolve the real, unrelaxed line break. */
    const fits = relaxed.maxLineWidth <= relaxedMeasure;
    const stats = fits ? relaxed : measureRichInlineStats(measured, measure);
    if (!items.some((item) => item.math !== undefined))
        return Math.max(1, stats.lineCount) * lineHeight;
    /* A line holding a formula is as tall as the highest ascent plus the
       deepest descent on it; each extent was measured with the line's own
       strut, so a formula that fits the line leaves it at `lineHeight`. */
    let height = 0;
    walkRichInlineLineRanges(measured, fits ? relaxedMeasure : measure, (line) => {
        let ascent = 0;
        let descent = 0;
        for (const fragment of line.fragments) {
            const box = items[fragment.itemIndex]?.math;
            if (box === undefined) continue;
            ascent = Math.max(ascent, box.ascent);
            descent = Math.max(descent, box.descent);
        }
        height += Math.max(lineHeight, ascent + descent);
    });
    return Math.max(lineHeight, height);
}
function richItemsNaturalWidth(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): number {
    return measureRichInlineStats(preparedRichItems(items, cache), Number.MAX_SAFE_INTEGER)
        .maxLineWidth;
}

type MarkdownRootContent = MessageMarkdownAst["children"][number];
type MarkdownParagraph = Extract<MarkdownRootContent, { type: "paragraph" }>;
type MarkdownPhrasing = MarkdownParagraph["children"][number];
type MarkdownFootnoteDefinition = Extract<MarkdownRootContent, { type: "footnoteDefinition" }>;
type MarkdownFootnotes = {
    readonly counts: ReadonlyMap<string, number>;
    readonly definitions: ReadonlyMap<string, MarkdownFootnoteDefinition>;
    readonly numbers: ReadonlyMap<string, number>;
    readonly order: readonly string[];
};
type MarkdownInlineStyle = {
    readonly italic: boolean;
    readonly size: number;
    readonly weight: number;
    /** CSS line height of the block this run sets in; formulas are measured on it. */
    readonly line: number;
};
function markdownInlineFont(style: MarkdownInlineStyle): string {
    return `${style.italic ? "italic " : ""}${style.weight === 400 ? "" : `${String(style.weight)} `}${String(style.size)}px ${UI_FAMILY}`;
}
function markdownImageLabel(node: Extract<MarkdownPhrasing, { type: "image" }>): string {
    return node.alt?.trim() || node.url || "image";
}
/** Preserve the browser's Unicode line-breaking boundary across adjacent AST
 * nodes. In particular, punctuation immediately after a styled node belongs to
 * that preceding word; it cannot start a new line independently just because
 * Markdown represented the two fonts as separate nodes. */
function markdownInlineLeadingTokenAttach(
    items: MarkdownInlineItem[],
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    measure: number,
    enabled: boolean,
): string {
    const previous = items.at(-1);
    if (!enabled || !previous || /\s$/u.test(previous.text) || /^\s/u.test(text)) return text;
    const match = /^\S+/u.exec(text);
    if (!match) return text;
    const tokenWidth = naturalTextWidth(match[0], font, cache);
    /* Punctuation and other no-space continuations belong to the preceding
       fragment only while that combined fragment fits. Otherwise CSS can wrap
       at the inline-element boundary; charging the continuation as chrome would
       incorrectly repeat it on every emergency fragment. */
    if (
        naturalTextWidth(previous.text, previous.font, cache) +
            (previous.extraWidth ?? 0) +
            tokenWidth >
        measure
    )
        return text;
    previous.extraWidth = (previous.extraWidth ?? 0) + tokenWidth;
    previous.glued = true;
    return text.slice(match[0].length);
}
/** Split one overlong decorated segment. Pretext chooses the grapheme
 * boundaries; separate atomic items expose the true final fragment for link
 * punctuation and keep code padding on only its first/last fragments. */
function markdownInlineFragmentItems(
    text: string,
    font: string,
    measure: number,
    startExtraWidth: number,
    endExtraWidth: number,
    cache: MessageTextLayoutCache,
    decoratedFlow = false,
): MarkdownInlineItem[] {
    /* `overflow-wrap: break-word` emergency-breaks the glyph run, not an intact
       word whose text fits and whose inline start/end decoration alone hangs
       beyond the measure. Keep that word atomic and let its box chrome occupy
       the same slight overflow the browser paints. */
    const textWidth = naturalTextWidth(text, font, cache);
    if (
        textWidth + (decoratedFlow ? startExtraWidth + endExtraWidth : 0) <=
        measure + INLINE_MEASURE_EPSILON
    )
        return [
            {
                break: "never",
                extraWidth: startExtraWidth + endExtraWidth,
                font,
                text,
            },
        ];
    const graphemes = [...GRAPHEME_SEGMENTER.segment(text)].map((part) => part.segment);
    const items: MarkdownInlineItem[] = [];
    let graphemeIndex = 0;
    let first = true;
    while (graphemeIndex < graphemes.length) {
        const firstExtraWidth = first ? startExtraWidth : 0;
        const finalAvailable = Math.max(1, measure - firstExtraWidth - endExtraWidth);
        const remaining = graphemes.slice(graphemeIndex).join("");
        const prepared = preparedTextSegments(remaining, font, cache);
        let available = finalAvailable;
        let line = layoutNextLine(prepared, { graphemeIndex: 0, segmentIndex: 0 }, available);
        if (!line) break;
        let count = [...GRAPHEME_SEGMENTER.segment(line.text)].length;
        if (count < graphemes.length - graphemeIndex && endExtraWidth > 0) {
            const fullAvailable = Math.max(1, measure - firstExtraWidth);
            const fullLine = layoutNextLine(
                prepared,
                { graphemeIndex: 0, segmentIndex: 0 },
                fullAvailable,
            );
            if (fullLine) {
                const fullCount = [...GRAPHEME_SEGMENTER.segment(fullLine.text)].length;
                /* The closing inset belongs only to the code element's final
                   fragment. Use the unreserved candidate only when content
                   still remains after it. */
                if (fullCount < graphemes.length - graphemeIndex) {
                    available = fullAvailable;
                    count = fullCount;
                    line = fullLine;
                }
            }
        }
        let fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
        let fragmentWidth = naturalTextWidth(fragment, font, cache);
        /* Pretext follows Blink's punctuation hanging and can return a preferred
           hyphen breakpoint whose painted width exceeds the supplied measure.
           A padded inline fragment has no space for that overhang in WebKit.
           Retreat to the last real grapheme fit, retaining Pretext's chosen
           boundary whenever it already fits. */
        while (count > 1 && fragmentWidth > available + INLINE_MEASURE_EPSILON) {
            count -= 1;
            fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
            fragmentWidth = naturalTextWidth(fragment, font, cache);
        }
        const final = graphemeIndex + count >= graphemes.length;
        items.push({
            break: "never",
            extraWidth: firstExtraWidth + (final ? endExtraWidth : 0),
            font,
            text: fragment,
        });
        graphemeIndex += count;
        first = false;
    }
    return items;
}
function markdownInlineItemsAppend(
    node: MarkdownPhrasing,
    style: MarkdownInlineStyle,
    runs: MarkdownInlineItem[][],
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    measure: number,
    bindDecoratedPunctuation: boolean,
    fragmentLong = false,
    atomic = false,
    tableCell = false,
): void {
    const current = () => runs[runs.length - 1]!;
    if (node.type === "text") {
        const font = markdownInlineFont(style);
        const text = markdownInlineLeadingTokenAttach(
            current(),
            inlineBreaksMark(node.value),
            font,
            cache,
            measure,
            bindDecoratedPunctuation,
        );
        if (text.length === 0) return;
        const tokens = atomic ? [text] : (text.match(/\s*\S+|\s+$/gu) ?? [text]);
        const itemStart = current().length;
        for (const token of tokens) {
            const match = /^(\s*)(\S+)$/u.exec(token);
            if (
                fragmentLong &&
                match &&
                naturalTextWidth(match[2]!, font, cache) > measure + INLINE_MEASURE_EPSILON
            ) {
                if (match[1]!.length > 0) current().push({ font, text: match[1]! });
                /* Only a piece with no break opportunity of its own needs an
                   emergency break. The pieces between such pieces stay one
                   item, which breaks where it may: separate items would not. */
                let breakable = "";
                for (const piece of preparedTextSegments(match[2]!, font, cache).segments) {
                    if (naturalTextWidth(piece, font, cache) <= measure + INLINE_MEASURE_EPSILON) {
                        breakable += piece;
                        continue;
                    }
                    if (breakable.length > 0) current().push({ font, text: breakable });
                    breakable = "";
                    current().push(
                        ...markdownInlineFragmentItems(piece, font, measure, 0, 0, cache),
                    );
                }
                if (breakable.length > 0) current().push({ font, text: breakable });
                continue;
            }
            current().push({
                break: atomic ? "never" : undefined,
                font,
                text: token,
            });
        }
        /* Blink rounds each shaped inline text run upward to 1/64px before
           the next run starts. Keep that advance at the AST boundary, rather
           than rounding the final line: several inline runs can otherwise
           consume the line-fit tolerance and hide a real wrapped line. */
        if (!WEBKIT_INLINE_SLICE && !GECKO_INLINE_SLICE) {
            const last = current().at(-1);
            if (current().length > itemStart && last && last.text.trim().length > 0) {
                const width = naturalTextWidth(text, font, cache);
                last.extraWidth = (last.extraWidth ?? 0) + Math.ceil(width * 64) / 64 - width;
            }
        }
        return;
    }
    if (node.type === "inlineCode") {
        const text = inlineBreaksMark(node.value.replace(/\r?\n|\r/gu, " "));
        const font = INLINE_CODE_FONT;
        /* An opening bracket in the preceding prose cannot end a browser line
           independently of the code it introduces: `(` + `code` wraps as one
           run. Keep its whitespace in flow, but charge the bracket to the
           first code fragment so a font boundary cannot create that break. */
        const previous = current().at(-1);
        const opening = previous?.text.match(/[\p{Ps}\p{Pi}]+$/u)?.[0];
        const openingWidth =
            opening && previous ? naturalTextWidth(opening, previous.font, cache) : 0;
        if (opening && previous) previous.text = previous.text.slice(0, -opening.length);
        if (tableCell && markdownTableCodeLineKeeps(node.value, cache)) {
            current().push({
                break: "never",
                extraWidth: 10 + openingWidth,
                font,
                keepsLine: true,
                text,
            });
            return;
        }
        const textWidth = naturalTextWidth(text, font, cache);
        /* Gecko reserves sliced code padding while breaking continuation lines
           too: the closing 5px on every line the code fragments onto, the
           opening 5px only on its first. A breakable run carries its decoration
           on each fragment, and fragments sharing a line add up: the first word
           carries the opening padding and the rest the closing padding that
           every line reserves. Charging only the first/last words can omit a
           whole wrapped line. */
        if (GECKO_INLINE_SLICE && textWidth > measure && /\s/u.test(text)) {
            const first = /^\S*/u.exec(text)![0];
            if (first.length > 0)
                current().push({ extraWidth: 5 + openingWidth, font, text: first });
            current().push({
                extraWidth: first.length > 0 ? 5 : 10 + openingWidth,
                font,
                text: text.slice(first.length),
            });
            return;
        }
        const decoratedFlow =
            openingWidth + textWidth + (WEBKIT_INLINE_SLICE ? 5 : 10) >
            measure + INLINE_MEASURE_EPSILON;
        const segments = preparedTextSegments(text, font, cache).segments;
        for (const [index, segment] of segments.entries()) {
            const items = markdownInlineFragmentItems(
                segment,
                font,
                measure,
                index === 0 ? 5 + openingWidth : 0,
                index === segments.length - 1 ? 5 : 0,
                cache,
                decoratedFlow,
            );
            current().push(...items);
        }
        return;
    }
    if (node.type === "break") {
        runs.push([]);
        return;
    }
    if (node.type === "image") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: markdownImageLabel(node),
        });
        return;
    }
    if (node.type === "imageReference") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: node.alt?.trim() || node.label || node.identifier || "image",
        });
        return;
    }
    if (node.type === "footnoteReference") {
        const number = footnotes.numbers.get(node.identifier.toUpperCase());
        current().push({
            break: "never",
            font: markdownInlineFont(style),
            text: number === undefined ? (node.label ?? node.identifier) : String(number),
        });
        return;
    }
    if (node.type === "inlineMath") {
        const rendered = mathFormulaRender(node.value, false);
        /* An unparseable formula renders as inline code of its source. */
        if (rendered.kind === "failed") {
            markdownInlineItemsAppend(
                { type: "inlineCode", value: node.value },
                style,
                runs,
                cache,
                footnotes,
                measure,
                bindDecoratedPunctuation,
                fragmentLong,
                atomic,
                /* `MathFormula` paints it, not the cell's code renderer. */
                false,
            );
            return;
        }
        const font = markdownInlineFont(style);
        const box = mathInlineBoxMeasure(node.value, rendered.html, {
            family: UI_FAMILY,
            lineHeight: style.line,
            size: style.size,
        });
        /* Blink may break between a word and a formula that touches it; Gecko
           keeps that word on the formula's line. Either way the text after a
           formula stays with it (`$n$-th`, `$x$,`), which the leading-token
           attachment of the next text node already models. */
        const previous = current().at(-1);
        let attached = 0;
        if (
            GECKO_INLINE_SLICE &&
            previous !== undefined &&
            previous.break !== "never" &&
            (previous.extraWidth ?? 0) === 0
        ) {
            const word = /\S+$/u.exec(previous.text)?.[0];
            if (word !== undefined) {
                attached = naturalTextWidth(word, previous.font, cache);
                previous.text = previous.text.slice(0, -word.length);
            }
        }
        current().push({
            break: "never",
            extraWidth: attached + box.width - naturalTextWidth(MATH_PLACEHOLDER, font, cache),
            font,
            math: box,
            text: MATH_PLACEHOLDER,
        });
        return;
    }
    if (node.type === "html") return;
    const nestedStyle: MarkdownInlineStyle =
        node.type === "strong"
            ? { ...style, weight: 700 }
            : node.type === "emphasis"
              ? { ...style, italic: true }
              : style;
    const nestedAtomic = atomic;
    const nestedFragmentLong =
        fragmentLong || node.type === "link" || node.type === "linkReference";
    for (const child of node.children)
        markdownInlineItemsAppend(
            child,
            nestedStyle,
            runs,
            cache,
            footnotes,
            measure,
            bindDecoratedPunctuation,
            nestedFragmentLong,
            nestedAtomic,
            tableCell,
        );
}
function markdownTrailingInlineApply(
    runs: MarkdownInlineItem[][],
    lastChildStart: { readonly item: number; readonly run: number },
    lastChild: MarkdownPhrasing,
    trailingExtraWidth: number,
    baseFont: string,
    cache: MessageTextLayoutCache,
): void {
    if (trailingExtraWidth <= 0) return;
    const finalRun = runs.at(-1);
    if (!finalRun || lastChildStart.run !== runs.length - 1) return;
    if (lastChild.type === "text") {
        const finalItem = finalRun.at(-1);
        if (!finalItem) return;
        const match = /^(.*?)(\s+)(\S+)$/u.exec(finalItem.text);
        if (match) {
            finalRun.splice(
                finalRun.length - 1,
                1,
                { ...finalItem, text: `${match[1]!}${match[2]!}` },
                {
                    ...finalItem,
                    break: "never",
                    extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
                    text: match[3]!,
                },
            );
            return;
        }
        finalRun[finalRun.length - 1] = {
            ...finalItem,
            break: "never",
            extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
        };
        return;
    }
    const childItems = finalRun.splice(lastChildStart.item);
    if (childItems.length === 0) return;
    const childWidth = richItemsNaturalWidth(childItems, cache);
    const spaceWidth = naturalTextWidth("\u00a0", baseFont, cache);
    /* The run becomes one item; a formula in it still sets its line's height. */
    let math: MathInlineBox | undefined;
    for (const item of childItems)
        if (item.math !== undefined)
            math = {
                ascent: Math.max(math?.ascent ?? 0, item.math.ascent),
                descent: Math.max(math?.descent ?? 0, item.math.descent),
                width: 0,
            };
    finalRun.push({
        break: "never",
        extraWidth: Math.max(0, childWidth + trailingExtraWidth - spaceWidth),
        font: baseFont,
        ...(math === undefined ? {} : { math }),
        text: "\u00a0",
    });
}
function markdownInlineRuns(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth: number,
    task: boolean,
    suffixText: string,
    tableCell = false,
): readonly MarkdownInlineItem[][] {
    const baseFont = markdownInlineFont(style);
    const runs: MarkdownInlineItem[][] = [[]];
    if (task) {
        runs[0]!.push({
            break: "never",
            extraWidth: TASK_CHECKBOX_INLINE,
            font: baseFont,
            text: "\u00a0",
        });
    }
    let lastChildStart = { item: runs[0]!.length, run: 0 };
    for (const [index, child] of children.entries()) {
        if (index === children.length - 1)
            lastChildStart = { item: runs.at(-1)!.length, run: runs.length - 1 };
        markdownInlineItemsAppend(
            child,
            style,
            runs,
            cache,
            footnotes,
            measure,
            suffixText.length === 0,
            false,
            false,
            tableCell,
        );
    }
    const lastChild = children.at(-1);
    if (lastChild)
        markdownTrailingInlineApply(
            runs,
            lastChildStart,
            lastChild,
            trailingExtraWidth,
            baseFont,
            cache,
        );
    if (suffixText.length > 0) runs.at(-1)!.push({ font: baseFont, text: suffixText });
    return runs;
}
function markdownInlineHeight(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth = 0,
    task = false,
    suffixText = "",
    tableCell = false,
): number {
    if (
        !markdownInlineHasLineBox(children) &&
        trailingExtraWidth === 0 &&
        !task &&
        suffixText.length === 0
    )
        return 0;
    const runs = markdownInlineRuns(
        children,
        style,
        measure,
        cache,
        footnotes,
        trailingExtraWidth,
        task,
        suffixText,
        tableCell,
    );
    const height = runs.reduce(
        (total, items) => total + richItemsHeight(items, lineHeight, measure, cache),
        0,
    );
    return height;
}

/** Tight-list paragraphs unwrap into the `<li>`. A following nested list is
 * then an element sibling of whatever inline elements that phrasing painted,
 * which is what `.happy-message__body--markdown li > * + *` matches. */
function markdownPhrasingPaintsElement(children: readonly MarkdownPhrasing[]): boolean {
    return children.some((node) => node.type !== "text" && node.type !== "html");
}

/** Empty cells have padding but no line box. Mirror the rendered inline tree:
 * skipped HTML and collapsed ASCII whitespace do not create one, whereas code
 * decoration, images-as-labels, references and explicit breaks do. */
function markdownInlineHasLineBox(children: readonly MarkdownPhrasing[]): boolean {
    return children.some((node) => {
        if (node.type === "html") return false;
        if (node.type === "text") return /[^\t\n\r ]/u.test(node.value);
        if (
            node.type === "inlineCode" ||
            node.type === "inlineMath" ||
            node.type === "break" ||
            node.type === "image" ||
            node.type === "imageReference" ||
            node.type === "footnoteReference"
        )
            return true;
        return markdownInlineHasLineBox(node.children);
    });
}

/** `.happy-message__plain-text`: the body copy, preserved as typed. */
const PLAIN_FONT = `${String(PARAGRAPH_SIZE)}px ${UI_FAMILY}`;
function preparedPlainSegments(
    text: string,
    cache: MessageTextLayoutCache,
): PreparedTextWithSegments {
    return preparedTextSegments(text, PLAIN_FONT, cache, "pre-wrap");
}
/** Pretext fuses the label and URL in `[label](https://…)`, hiding the
 * browser's break opportunity between closing and opening brackets. */
const BRACKET_BREAK = /(?<=[\])}])(?=[([{])/gu;

/** Gecko skips a tab stop less than half a `ch` ahead. Pretext only models
 * the next stop. Resolve tab advances from this line's origin without
 * changing the text that the browser renders or the reader can copy. */
function plainTabStopsApply(
    prepared: PreparedTextWithSegments,
    cursor: LayoutCursor,
    cache: MessageTextLayoutCache,
): PreparedTextWithSegments {
    if (!GECKO_INLINE_SLICE || prepared.kinds.indexOf("tab", cursor.segmentIndex) < 0)
        return prepared;
    const widths = [...prepared.widths];
    const kinds = [...prepared.kinds];
    const lineEndFitAdvances = [...prepared.lineEndFitAdvances];
    const lineEndPaintAdvances = [...prepared.lineEndPaintAdvances];
    const minimum = naturalTextWidth("0", PLAIN_FONT, cache) / 2;
    const stop = prepared.tabStopAdvance;
    let advance = 0;
    for (let index = cursor.segmentIndex; index < widths.length; index += 1) {
        if (kinds[index] === "tab") {
            let width = stop - (advance % stop);
            if (width < minimum - INLINE_MEASURE_EPSILON) width += stop;
            widths[index] = width;
            kinds[index] = "preserved-space";
            lineEndFitAdvances[index] = 0;
            lineEndPaintAdvances[index] = width;
        }
        advance += widths[index]!;
    }
    return { ...prepared, widths, kinds, lineEndFitAdvances, lineEndPaintAdvances };
}
/** Advance of plain text with its spaces preserved. */
function plainTextWidth(text: string, cache: MessageTextLayoutCache): number {
    return measureNaturalWidth(
        plainTabStopsApply(
            preparedPlainSegments(text, cache),
            { segmentIndex: 0, graphemeIndex: 0 },
            cache,
        ),
    );
}
/** Where a Pretext cursor falls in the text it was prepared from. */
function plainCursorOffset(prepared: PreparedTextWithSegments, cursor: LayoutCursor): number {
    let offset = 0;
    for (let index = 0; index < cursor.segmentIndex; index += 1)
        offset += prepared.segments[index]!.length;
    if (cursor.graphemeIndex > 0) {
        let graphemes = 0;
        for (const { segment } of GRAPHEME_SEGMENTER.segment(
            prepared.segments[cursor.segmentIndex] ?? "",
        )) {
            if (graphemes === cursor.graphemeIndex) break;
            offset += segment.length;
            graphemes += 1;
        }
    }
    return offset;
}
/**
 * Lines under `pre-wrap` and `overflow-wrap: anywhere`. Pretext does not
 * emergency-break symbol runs and gives URLs preferred break points the
 * browser does not use. Fill overlong runs by grapheme, then prepare the
 * remainder so normal break opportunities apply again on the next line.
 */
function plainLineBoxes(line: string, measure: number, cache: MessageTextLayoutCache): string[] {
    if (line.length === 0) return [""];
    const boxes: string[] = [];
    let rest = inlineBreaksMark(line).replace(BRACKET_BREAK, "\u200b");
    for (;;) {
        const prepared = preparedPlainSegments(rest, cache);
        let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
        let overflow: { readonly start: number; readonly text: string } | undefined;
        for (;;) {
            const range = layoutNextLineRange(
                plainTabStopsApply(prepared, cursor, cache),
                cursor,
                measure,
            );
            if (!range) break;
            const text = materializeLineRange(prepared, range).text;
            /* Trailing spaces hang past the edge of a wrapped line. */
            if (
                range.end.graphemeIndex > 0 ||
                (range.width > measure + INLINE_MEASURE_EPSILON &&
                    plainTextWidth(text.replace(/\s+$/u, ""), cache) >
                        measure + INLINE_MEASURE_EPSILON)
            ) {
                const start = plainCursorOffset(prepared, range.start);
                overflow = { start, text: rest.slice(start) };
                break;
            }
            boxes.push(text);
            cursor = range.end;
        }
        if (!overflow) return boxes.length > 0 ? boxes : [""];
        const graphemes = [...GRAPHEME_SEGMENTER.segment(overflow.text)].map(
            (part) => part.segment,
        );
        let low = 1;
        let high = graphemes.length;
        while (low < high) {
            const count = Math.ceil((low + high) / 2);
            if (
                plainTextWidth(graphemes.slice(0, count).join(""), cache) <=
                measure + INLINE_MEASURE_EPSILON
            )
                low = count;
            else high = count - 1;
        }
        const fitted = graphemes.slice(0, low).join("");
        boxes.push(fitted);
        rest = rest.slice(overflow.start + fitted.length);
        if (rest.length === 0) return boxes;
    }
}
/** Height of literal human text, including any grouped hover metadata. */
export function plainTextHeight(
    source: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    trailingExtraWidth = 0,
): number {
    const text = messagePlainTextNormalize(source);
    if (text.length === 0) return 0;
    const ready = cacheReady(cache);
    const fontKey = `${PLAIN_FONT}:plain-body`;
    let byText = ready.runHeights[fontKey];
    if (!byText) {
        byText = dictionaryCreate();
        ready.runHeights[fontKey] = byText;
    }
    let byMeasure = byText[text];
    if (!byMeasure) {
        byMeasure = dictionaryCreate();
        byText[text] = byMeasure;
    }
    const key = `${String(measure)}:${String(trailingExtraWidth)}`;
    const hit = byMeasure[key];
    if (hit !== undefined) return hit;
    const lines = text.split("\n");
    /* A final newline terminates the last line; it creates another line box
       only if the grouped timestamp follows it. */
    if (text.endsWith("\n") && trailingExtraWidth === 0) lines.pop();
    let count = 0;
    for (const [index, line] of lines.entries()) {
        const boxes = plainLineBoxes(line, measure, ready);
        count += boxes.length;
        if (
            index === lines.length - 1 &&
            trailingExtraWidth > 0 &&
            plainTextWidth(boxes.at(-1)!, ready) + trailingExtraWidth >
                measure + INLINE_MEASURE_EPSILON
        )
            count += 1;
    }
    const height = count * PARAGRAPH_LINE;
    byMeasure[key] = height;
    return height;
}

/** Height of one ordinary UI-font run at an explicit type ramp and measure. */
export function uiTextHeight(
    text: string,
    size: number,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${String(size)}px ${UI_FAMILY}`, lineHeight, measure, cache);
}

/** The error card's 14/20 text, including preserved diagnostic line breaks. */
export function errorTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    heading = false,
): number {
    return runHeight(
        text,
        `${heading ? "500 " : ""}14px ${UI_FAMILY}`,
        20,
        measure,
        cache,
        heading ? "normal" : "pre-wrap",
    );
}
/**
 * The failure card's 14/20 message, in which a command is one unbreakable box:
 * its 13px mono text plus `extraWidth` of padding and copy button. Punctuation
 * that touches the box's far edge cannot begin a line, so it travels with it.
 */
export function errorRichTextHeight(
    runs: readonly (
        | { readonly text: string }
        | { readonly code: string; readonly extraWidth: number }
    )[],
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    const font = `14px ${UI_FAMILY}`;
    const items: RichInlineItem[] = [];
    let carried = "";
    for (const [index, run] of runs.entries()) {
        if ("code" in run) {
            const next = runs[index + 1];
            carried = next !== undefined && "text" in next ? /^\S*/u.exec(next.text)![0] : "";
            items.push({
                break: "never",
                extraWidth:
                    run.extraWidth +
                    (carried.length > 0 ? naturalTextWidth(carried, font, cache) : 0),
                font: `13px ${MONO_FAMILY}`,
                text: run.code,
            });
            continue;
        }
        const text = run.text.slice(carried.length);
        carried = "";
        if (text.length > 0) items.push({ font, text });
    }
    return richItemsHeight(items, 20, measure, cache);
}
/** Natural width of a single-line control label, with its CSS letter spacing. */
export function controlLabelNaturalWidth(
    text: string,
    size: number,
    weight: number,
    letterSpacing: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return richItemsNaturalWidth(
        [{ font: `${String(weight)} ${String(size)}px ${UI_FAMILY}`, letterSpacing, text }],
        cache,
    );
}
/** The heading ramp: h2 is the largest, h3 alone carries a taller line. */
const HEADINGS = [
    { size: 16, line: 24, weight: 900 },
    { size: 20, line: 24, weight: 600 },
    { size: 16, line: 28, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
] as const;
/** A block's painted box plus the margins that separate it from its neighbours. */
type Block = { readonly height: number; readonly marginTop: number; readonly marginBottom: number };
const flow = (height: number): Block => ({ height, marginTop: 0, marginBottom: 0 });
type MarkdownList = Extract<MarkdownRootContent, { type: "list" }>;
type MarkdownTrailingInline = {
    readonly endOffset: number;
    readonly extraWidth: number;
};

function messageMarkdownTree(text: string, cache: MessageTextLayoutCache): MessageMarkdownAst {
    const hit = cache.markdownTrees[text];
    if (hit !== undefined) return hit;
    const tree = messageMarkdownParse(text);
    cache.markdownTrees[text] = tree;
    return tree;
}
type MutableMarkdownFootnotes = {
    readonly counts: Map<string, number>;
    readonly definitions: Map<string, MarkdownFootnoteDefinition>;
    readonly numbers: Map<string, number>;
    readonly order: string[];
};
function markdownFootnoteReferenceCollect(
    node: MarkdownPhrasing,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "footnoteReference") {
        const identifier = node.identifier.toUpperCase();
        if (!footnotes.numbers.has(identifier)) {
            footnotes.order.push(identifier);
            footnotes.numbers.set(identifier, footnotes.order.length);
        }
        footnotes.counts.set(identifier, (footnotes.counts.get(identifier) ?? 0) + 1);
        return;
    }
    if (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "inlineMath" ||
        node.type === "break" ||
        node.type === "image" ||
        node.type === "imageReference" ||
        node.type === "html"
    )
        return;
    for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
}
function markdownFootnoteReferencesCollect(
    node: MarkdownRootContent,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "paragraph" || node.type === "heading") {
        for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
        return;
    }
    if (node.type === "blockquote") {
        for (const child of node.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "list") {
        for (const item of node.children)
            for (const child of item.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "table") {
        for (const row of node.children)
            for (const cell of row.children)
                for (const child of cell.children)
                    markdownFootnoteReferenceCollect(child, footnotes);
    }
}
/** Mirrors mdast-util-to-hast's reference-order numbering and generated footer. */
function messageMarkdownFootnotes(
    text: string,
    tree: MessageMarkdownAst,
    cache: MessageTextLayoutCache,
): MarkdownFootnotes {
    const hit = cache.markdownFootnotes[text];
    if (hit !== undefined) return hit;
    const footnotes: MutableMarkdownFootnotes = {
        counts: new Map(),
        definitions: new Map(),
        numbers: new Map(),
        order: [],
    };
    for (const node of tree.children)
        if (node.type === "footnoteDefinition")
            footnotes.definitions.set(node.identifier.toUpperCase(), node);
    /* Definitions are collected but skipped during the main transform. Their
       content is transformed later, in first-reference order, and can itself
       introduce another referenced definition. */
    for (const node of tree.children)
        if (node.type !== "footnoteDefinition") markdownFootnoteReferencesCollect(node, footnotes);
    for (let index = 0; index < footnotes.order.length; index += 1) {
        const definition = footnotes.definitions.get(footnotes.order[index]!);
        if (!definition) continue;
        for (const child of definition.children)
            markdownFootnoteReferencesCollect(child, footnotes);
    }
    cache.markdownFootnotes[text] = footnotes;
    return footnotes;
}
function markdownBlocksHeight(
    nodes: readonly MarkdownRootContent[],
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    gap: number,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
): number {
    const blocks = nodes
        .map((node) =>
            markdownBlockHeight(
                node,
                measure,
                cache,
                footnotes,
                codeMargins,
                trailing,
                false,
                mermaidEnabled,
            ),
        )
        .filter((block) => block !== undefined);
    let total = 0;
    let pendingMargin = 0;
    for (const [index, block] of blocks.entries()) {
        pendingMargin = Math.max(pendingMargin, index > 0 ? gap : 0, block.marginTop);
        if (block.height === 0) {
            // Empty block margins collapse through the element, rather than
            // adding another paragraph gap before the next painted block.
            pendingMargin = Math.max(pendingMargin, block.marginBottom);
            continue;
        }
        total += pendingMargin + block.height;
        pendingMargin = block.marginBottom;
    }
    return total + pendingMargin;
}
function markdownListHeight(
    list: MarkdownList,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
): number {
    const itemMeasure = measure - LIST_INDENT;
    let total = 0;
    for (const [itemIndex, item] of list.children.entries()) {
        const blocks = item.children
            .map((node, childIndex) =>
                markdownBlockHeight(
                    node,
                    itemMeasure,
                    cache,
                    footnotes,
                    false,
                    trailing,
                    childIndex === 0 && item.checked !== null,
                    mermaidEnabled,
                ),
            )
            .filter((block) => block !== undefined);
        const first = blocks[0];
        if (itemIndex > 0) total += LIST_ITEM_GAP;
        if (!first) {
            // The list marker creates a body line even before the item's
            // first text node arrives (for example a streamed "1. ").
            total += PARAGRAPH_LINE;
            continue;
        }
        let itemHeight = first.height;
        for (let index = 1; index < blocks.length; index += 1) {
            /* Tight-list paragraphs unwrap into the `<li>`, so `li > * + *`
               does not apply when that phrasing is only text nodes. Inline
               elements (`a`, `code`, `strong`, …) still become element
               siblings of a following nested list, and the 6px child-block
               gap paints. Spread items keep `<p>` and always take the gap. */
            const previous = item.children[index - 1];
            const tight = !list.spread && !item.spread;
            /* An unwrapped paragraph after a block (a display formula lifted
               out of its text) is bare inline content: a vertical margin on
               its inline elements does not apply, so no gap paints either. */
            const gap =
                tight &&
                ((previous?.type === "paragraph" &&
                    !markdownPhrasingPaintsElement(previous.children)) ||
                    item.children[index]?.type === "paragraph")
                    ? 0
                    : LIST_ITEM_GAP;
            itemHeight += gap + blocks[index]!.height;
        }
        total += itemHeight;
    }
    return total;
}

function mermaidBlockHeight(
    source: string,
    measure: number,
    cache: MessageTextLayoutCache,
    enabled: boolean,
): number {
    const lines = Math.max(1, source.split("\n").length);
    const sourceHeight = MERMAID_DIAGRAM_BORDER + CODE_PADDING * 2 + lines * CODE_LINE;
    if (!enabled) return sourceHeight;
    let dimensions = cache.mermaidDimensions[source];
    if (dimensions === undefined) {
        try {
            dimensions = mermaidDiagramMeasure(source);
        } catch {
            dimensions = null;
        }
        cache.mermaidDimensions[source] = dimensions;
    }
    return dimensions === null ? sourceHeight : mermaidDiagramNaturalHeight(dimensions, measure);
}

/** A fenced code block of `value`: one 20px line per source line inside 16px padding. */
function codeBlock(value: string, codeMargins: boolean): Block {
    const lines = Math.max(1, value.split("\n").length);
    return {
        height: CODE_PADDING * 2 + lines * CODE_LINE,
        marginTop: codeMargins ? CODE_GAP : 0,
        marginBottom: codeMargins ? CODE_GAP : 0,
    };
}
/** Measures one actual remark/GFM block node with the same type ramp as its renderer. */
function markdownBlockHeight(
    node: MarkdownRootContent,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    task: boolean,
    mermaidEnabled: boolean,
    suffixText = "",
): Block | undefined {
    if (node.type === "paragraph") {
        const extraWidth =
            trailing !== undefined && node.position?.end.offset === trailing.endOffset
                ? trailing.extraWidth
                : 0;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: PARAGRAPH_SIZE, weight: 400, line: PARAGRAPH_LINE },
                PARAGRAPH_LINE,
                measure,
                cache,
                footnotes,
                extraWidth,
                task,
                suffixText,
            ),
        );
    }
    if (node.type === "heading") {
        const ramp = HEADINGS[node.depth - 1]!;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: ramp.size, weight: ramp.weight, line: ramp.line },
                ramp.line,
                measure,
                cache,
                footnotes,
            ),
        );
    }
    if (node.type === "code") {
        if (node.lang?.trim().toLowerCase() === "mermaid")
            return {
                height: mermaidBlockHeight(node.value, measure, cache, mermaidEnabled),
                marginTop: codeMargins ? CODE_GAP : 0,
                marginBottom: codeMargins ? CODE_GAP : 0,
            };
        return codeBlock(node.value, codeMargins);
    }
    if (node.type === "math") {
        const rendered = mathFormulaRender(node.value, true);
        /* An unparseable display formula renders as a code block of its source. */
        if (rendered.kind === "failed") return codeBlock(node.value, codeMargins);
        return flow(
            mathDisplayHeightMeasure(node.value, rendered.html, {
                family: UI_FAMILY,
                lineHeight: PARAGRAPH_LINE,
                size: PARAGRAPH_SIZE,
            }),
        );
    }
    if (node.type === "table")
        return flow(markdownTableLayout(node, measure, cache, footnotes).height);
    if (node.type === "thematicBreak") return flow(RULE_HEIGHT);
    if (node.type === "blockquote")
        return flow(
            markdownBlocksHeight(
                node.children,
                measure - QUOTE_INSET,
                cache,
                footnotes,
                BLOCK_GAP,
                false,
                trailing,
                mermaidEnabled,
            ),
        );
    if (node.type === "list")
        return flow(markdownListHeight(node, measure, cache, footnotes, trailing, mermaidEnabled));
    /* Definitions and skipped HTML create no DOM box. That is distinct from
       an empty heading/paragraph: its zero-height element still participates
       in the CSS sibling-margin sequence while the next token is arriving. */
    return undefined;
}
type MarkdownTable = Extract<MarkdownRootContent, { type: "table" }>;
type MarkdownTableCell = MarkdownTable["children"][number]["children"][number];
/** One cell's extents on a single line, independent of the column it lands in. */
type MarkdownTableCellExtent = {
    /** Widest run that cannot wrap: the narrowest content box the cell reads well at. */
    readonly min: number;
    /** Widest hard-broken run with no wrapping at all. */
    readonly max: number;
    /** Widest word that must not break: short code keeping its line, or a
     * word spanning several inline elements (`[label](` before a link), whose
     * emergency break the model does not predict. A floor for its column. */
    readonly hard: number;
    /** Line boxes the cell paints at any measure that fits `max`. */
    readonly lines: number;
};
/**
 * Whole-pixel geometry of one GFM table at one measure. The row-height model
 * and `MessageMarkdown`'s `<colgroup>` both take it from `markdownTableLayout`,
 * so a mounted table paints exactly the rows the virtual list reserved.
 */
export type MarkdownTableLayout = {
    /** Border-box width of every column; cells keep 12px of padding each side. */
    readonly columnWidths: readonly number[];
    /** Line boxes per row, header first. A row with no text paints none. */
    readonly rowLines: readonly number[];
    /** Sum of the column widths, wider than the measure only when it scrolls. */
    readonly width: number;
    readonly height: number;
};
const TABLE_HEADER_STYLE: MarkdownInlineStyle = {
    italic: false,
    line: PARAGRAPH_LINE,
    size: PARAGRAPH_SIZE,
    weight: 600,
};
const TABLE_BODY_STYLE: MarkdownInlineStyle = {
    italic: false,
    line: PARAGRAPH_LINE,
    size: PARAGRAPH_SIZE,
    weight: 400,
};
/**
 * Measured cells outlive any one Markdown source. A streamed reply is laid out
 * from a scratch cache on every update, so without this each update would
 * re-measure every cell it already measured; a settled reply's cells are the
 * same cells again. Entries are keyed by everything that decides a cell's
 * geometry — its phrasing tree without source positions, its header/body
 * style, and the numbers its footnote references resolve to — and the engine
 * is fixed for the process. The whole cache is dropped when the installed font
 * changes, and it is bounded by key size, least recently used first.
 */
type TableCellEntry = {
    readonly extent: MarkdownTableCellExtent;
    /** Line boxes at each content width the cell has wrapped at, oldest first. */
    readonly lines: Map<number, number>;
};
const TABLE_CELL_CAPACITY = 256 * 1_024;
const TABLE_CELL_WIDTHS = 8;
const tableCells = {
    generation: fontGeneration,
    entries: new Map<string, TableCellEntry>(),
    size: 0,
};
function tableCellKey(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    footnotes: MarkdownFootnotes,
): string {
    const phrasing = JSON.stringify(cell.children, (key, value: unknown) => {
        if (key === "position") return undefined;
        const node = value as { type?: string; identifier?: string } | null;
        if (node?.type === "footnoteReference")
            return { ...node, number: footnotes.numbers.get(node.identifier!.toUpperCase()) };
        return value;
    });
    return `${String(style.weight)}:${phrasing}`;
}
function tableCellEntry(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): TableCellEntry {
    if (tableCells.generation !== fontGeneration) {
        tableCells.generation = fontGeneration;
        tableCells.entries.clear();
        tableCells.size = 0;
    }
    const key = tableCellKey(cell, style, footnotes);
    const hit = tableCells.entries.get(key);
    if (hit !== undefined) {
        /* Map order is insertion order: re-inserting marks it most recent. */
        tableCells.entries.delete(key);
        tableCells.entries.set(key, hit);
        return hit;
    }
    const entry: TableCellEntry = {
        extent: markdownTableCellExtent(cell, style, cache, footnotes),
        lines: new Map(),
    };
    if (key.length > TABLE_CELL_CAPACITY) return entry;
    while (tableCells.size + key.length > TABLE_CELL_CAPACITY) {
        const oldest = tableCells.entries.keys().next().value!;
        tableCells.entries.delete(oldest);
        tableCells.size -= oldest.length;
    }
    tableCells.entries.set(key, entry);
    tableCells.size += key.length;
    return entry;
}
/** Line boxes a cached cell paints at one content width. */
function tableCellLines(
    entry: TableCellEntry,
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    content: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): number {
    if (entry.extent.max <= content + INLINE_MEASURE_EPSILON) return entry.extent.lines;
    const hit = entry.lines.get(content);
    if (hit !== undefined) return hit;
    /* Lines in units of the body line: a formula can make one taller. */
    const lines =
        markdownInlineHeight(
            cell.children,
            style,
            PARAGRAPH_LINE,
            content,
            cache,
            footnotes,
            0,
            false,
            "",
            true,
        ) / PARAGRAPH_LINE;
    if (entry.lines.size >= TABLE_CELL_WIDTHS) entry.lines.delete(entry.lines.keys().next().value!);
    entry.lines.set(content, lines);
    return lines;
}
function markdownTableCellExtent(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): MarkdownTableCellExtent {
    if (!markdownInlineHasLineBox(cell.children)) return { min: 0, max: 0, hard: 0, lines: 0 };
    /* An unbounded measure never fragments a token, so these runs describe
       the cell's text alone. */
    const runs = markdownInlineRuns(
        cell.children,
        style,
        Number.MAX_SAFE_INTEGER,
        cache,
        footnotes,
        0,
        false,
        "",
        true,
    );
    let min = 0;
    let max = 0;
    let hard = 0;
    for (const items of runs) {
        if (items.length === 0) continue;
        max = Math.max(max, richItemsNaturalWidth(items, cache));
        /* The widest word, where a word may span several items: `*` before an
           emphasis or `,` after a link has no break opportunity at the font
           boundary. A column at least this wide never needs an emergency break,
           which is where engines disagree most about where a word splits. */
        let word = 0;
        let wordKeeps = false;
        let wordParts = 0;
        let wordItem: MarkdownInlineItem | undefined;
        const wordAdd = (item: MarkdownInlineItem, width: number) => {
            /* Fragments of one code span break between themselves like prose,
               and the code fragment model owns the brackets glued to it. */
            if (
                item !== wordItem &&
                !(wordItem?.font === INLINE_CODE_FONT && item.font === INLINE_CODE_FONT)
            )
                wordParts += 1;
            if (item.glued && item.font !== INLINE_CODE_FONT) wordParts += 1;
            wordItem = item;
            word += width;
        };
        const wordEnd = () => {
            min = Math.max(min, word);
            if (wordKeeps || wordParts > 1) hard = Math.max(hard, word);
            word = 0;
            wordKeeps = false;
            wordParts = 0;
            wordItem = undefined;
        };
        for (const item of items) {
            if (/^\s/u.test(item.text)) wordEnd();
            if (item.break === "never") {
                if (item.keepsLine) wordKeeps = true;
                if (item.text.trim().length > 0)
                    wordAdd(
                        item,
                        naturalTextWidth(item.text, item.font, cache) +
                            /* Gecko reserves code padding on every line a code span
                           fragments onto, so each of its words needs both sides. */
                            (GECKO_INLINE_SLICE && item.font === INLINE_CODE_FONT && !item.keepsLine
                                ? 10
                                : (item.extraWidth ?? 0)),
                    );
            } else {
                const prepared = preparedTextSegments(item.text, item.font, cache);
                let previous: string | undefined;
                for (const [index, kind] of prepared.kinds.entries()) {
                    if (kind === "text" || kind === "glue") {
                        /* Pretext splits one item's text exactly where it may break. */
                        if (kind === "text" && previous === "text") wordEnd();
                        wordAdd(item, prepared.widths[index]!);
                    } else wordEnd();
                    previous = kind;
                }
                if (item.glued && item.font !== INLINE_CODE_FONT) wordParts += 1;
                word += item.extraWidth ?? 0;
            }
            if (/\s$/u.test(item.text)) wordEnd();
        }
        wordEnd();
    }
    const lines = runs.reduce(
        (total, items) =>
            total +
            (items.some((item) => item.math !== undefined)
                ? richItemsHeight(items, PARAGRAPH_LINE, Number.MAX_SAFE_INTEGER, cache) /
                  PARAGRAPH_LINE
                : 1),
        0,
    );
    return { min, max, hard, lines };
}
/**
 * Column widths at one whole-pixel measure. A table whose cells all fit on
 * one line keeps that natural width rather than stretching. Otherwise every
 * column gets a floor: its one-line width when that is narrow, else at least
 * `TABLE_MIN_COLUMN` and its widest word, but a word holds its column open
 * only up to an equal share of the measure — a longer identifier or URL
 * breaks the way it does in a paragraph instead of starving its neighbours.
 * Only a word that must not break (`hard`) floors its column at full width.
 * Above the floors, every column that wants more gets the same width (a
 * water level), so the last column is not left with whatever remains. When
 * even the floors are too wide, the table scrolls at readable widths.
 */
function markdownTableColumnWidths(
    min: readonly number[],
    max: readonly number[],
    hard: readonly number[],
    target: number,
): number[] {
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    if (sum(max) <= target) return [...max];
    const share = Math.floor(target / Math.max(1, max.length));
    const floor = max.map((width, index) =>
        Math.min(width, Math.max(hard[index]!, TABLE_MIN_COLUMN, Math.min(min[index]!, share))),
    );
    if (sum(floor) > target)
        return max.map((width, index) =>
            Math.max(
                floor[index]!,
                Math.min(
                    width,
                    Math.max(
                        hard[index]!,
                        TABLE_READABLE_COLUMN,
                        Math.min(min[index]!, TABLE_SCROLL_WORD_COLUMN),
                    ),
                ),
            ),
        );
    const at = (level: number) =>
        max.map((width, index) => Math.min(width, Math.max(floor[index]!, level)));
    /* The highest whole-pixel level that fits; the pixels it leaves go one
       each to the columns still growing at that level, first to last. */
    let low = 0;
    let high = Math.max(...max);
    while (low < high) {
        const level = Math.ceil((low + high) / 2);
        if (sum(at(level)) <= target) low = level;
        else high = level - 1;
    }
    const widths = at(low);
    let remainder = target - sum(widths);
    for (const [index, width] of widths.entries()) {
        if (remainder <= 0) break;
        if (width === low && width < max[index]!) {
            widths[index] = width + 1;
            remainder -= 1;
        }
    }
    return widths;
}
function markdownTableCodeLineKeeps(value: string, cache: MessageTextLayoutCache): boolean {
    return (
        naturalTextWidth(value.replace(/\r?\n|\r/gu, " "), INLINE_CODE_FONT, cache) <=
        TABLE_CODE_LINE
    );
}
/** Whether inline code in a table cell keeps one line; the renderer marks it
 * with the same rule the column solve floors its column by. */
export function markdownTableCodeKeepsLine(value: string): boolean {
    return markdownTableCodeLineKeeps(value, cacheReady(sharedCache));
}
/** Lays one GFM table out at `measure`: shared by the row-height model and the renderer. */
function markdownTableLayout(
    table: MarkdownTable,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): MarkdownTableLayout {
    const columns = table.children[0]?.children.length ?? 0;
    /* mdast-util-to-hast pads a short row with empty cells and drops cells
       beyond the header's count; only the cells it renders take part. */
    const rows = table.children.map((row, rowIndex) => {
        const style = rowIndex === 0 ? TABLE_HEADER_STYLE : TABLE_BODY_STYLE;
        return row.children.slice(0, columns).map((cell) => ({
            cell,
            entry: tableCellEntry(cell, style, cache, footnotes),
            style,
        }));
    });
    const min = Array.from({ length: columns }, () => 0);
    const max = Array.from({ length: columns }, () => 0);
    const hard = Array.from({ length: columns }, () => 0);
    for (const row of rows)
        for (const [index, { entry }] of row.entries()) {
            min[index] = Math.max(min[index]!, entry.extent.min);
            max[index] = Math.max(max[index]!, entry.extent.max);
            hard[index] = Math.max(hard[index]!, entry.extent.hard);
        }
    /* Whole pixels on both edges: the `<col>` widths the renderer writes are
       integers, and so is the scrollport width this measure stands for. */
    for (let index = 0; index < columns; index += 1) {
        max[index] = Math.ceil(max[index]!) + TABLE_CELL_INLINE_PADDING;
        min[index] = Math.min(max[index]!, Math.ceil(min[index]!) + TABLE_CELL_INLINE_PADDING);
        if (hard[index]! > 0)
            hard[index] = Math.min(
                max[index]!,
                Math.ceil(hard[index]!) + TABLE_CELL_INLINE_PADDING,
            );
    }
    const columnWidths = markdownTableColumnWidths(
        min,
        max,
        hard,
        Math.max(0, Math.floor(measure + INLINE_MEASURE_EPSILON)),
    );
    const rowLines = rows.map((row) =>
        row.reduce(
            (lines, { cell, entry, style }, index) =>
                Math.max(
                    lines,
                    tableCellLines(
                        entry,
                        cell,
                        style,
                        columnWidths[index]! - TABLE_CELL_INLINE_PADDING,
                        cache,
                        footnotes,
                    ),
                ),
            0,
        ),
    );
    return {
        columnWidths,
        rowLines,
        width: columnWidths.reduce((total, width) => total + width, 0),
        height: rowLines.reduce(
            (total, lines) => total + TABLE_CELL_PADDING * 2 + lines * PARAGRAPH_LINE,
            0,
        ),
    };
}
function markdownFootnoteBackrefs(count: number): string {
    let text = "";
    for (let reference = 1; reference <= count; reference += 1)
        text += ` ↩${reference === 1 ? "" : String(reference)}`;
    return text;
}
function markdownFootnoteDefinitionHeight(
    definition: MarkdownFootnoteDefinition,
    count: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    mermaidEnabled: boolean,
): number {
    const itemMeasure = measure - LIST_INDENT;
    const last = definition.children.at(-1);
    const suffix = markdownFootnoteBackrefs(count);
    const suffixAttached = last?.type === "paragraph";
    const blocks = definition.children
        .map((node) =>
            markdownBlockHeight(
                node,
                itemMeasure,
                cache,
                footnotes,
                false,
                undefined,
                false,
                mermaidEnabled,
                node === last && suffixAttached ? suffix : "",
            ),
        )
        .filter((block) => block !== undefined);
    const first = blocks[0];
    let total = first?.height ?? 0;
    for (let index = 1; index < blocks.length; index += 1)
        total += LIST_ITEM_GAP + blocks[index]!.height;
    /* mdast-util-to-hast appends backreferences directly to a definition whose
       final child is not a paragraph. That anonymous inline run still paints
       one body line after the preceding block. */
    if (!suffixAttached) total += PARAGRAPH_LINE;
    return total;
}
function markdownFootnotesHeight(
    footnotes: MarkdownFootnotes,
    measure: number,
    cache: MessageTextLayoutCache,
    mermaidEnabled: boolean,
): number {
    let total = 0;
    let rendered = 0;
    for (const identifier of footnotes.order) {
        const definition = footnotes.definitions.get(identifier);
        if (!definition) continue;
        if (rendered > 0) total += LIST_ITEM_GAP;
        total += markdownFootnoteDefinitionHeight(
            definition,
            footnotes.counts.get(identifier) ?? 0,
            measure,
            cache,
            footnotes,
            mermaidEnabled,
        );
        rendered += 1;
    }
    return total;
}
/**
 * Painted height of a Markdown message body wrapped at `measure` px. Adjacent
 * block margins collapse to the larger of the two, exactly as they do in flow,
 * and only a block carrying its own margin (fenced code) contributes one at the
 * body's outer edges. An empty source string occupies one line box, matching
 * the anchor paragraph a generation keeps before text arrives. Nonempty source
 * that renders empty syntax (such as `##`) keeps its actual zero-height box.
 */
export function markdownBodyHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    trailingExtraWidth = 0,
    mermaidEnabled = true,
    streaming = false,
): number {
    /* A virtual row's size is authoritative even while it streams. Bound the
       lifetime of prefix layout, not its accuracy: use the same Markdown/font
       model in a scratch cache that cannot accumulate in settled history. The
       row-height cache still reuses the result for an unchanged entry/width. */
    const ready = cacheReady(streaming ? streamingCache(cache) : cache);
    let byMeasure = ready.markdownHeights[text];
    if (!byMeasure) {
        byMeasure = dictionaryCreate();
        ready.markdownHeights[text] = byMeasure;
    }
    const measureKey = `${String(measure)}:${String(trailingExtraWidth)}:${mermaidEnabled ? "diagram" : "source"}`;
    const cached = byMeasure[measureKey];
    if (cached !== undefined) return cached;
    const tree = messageMarkdownTree(text, ready);
    const trailing =
        trailingExtraWidth > 0
            ? { endOffset: text.trimEnd().length, extraWidth: trailingExtraWidth }
            : undefined;
    const footnotes = messageMarkdownFootnotes(text, tree, ready);
    const content = tree.children.filter((node) => node.type !== "footnoteDefinition");
    const contentHeight = markdownBlocksHeight(
        content,
        measure,
        ready,
        footnotes,
        BLOCK_GAP,
        true,
        trailing,
        mermaidEnabled,
    );
    const footnotesHeight = markdownFootnotesHeight(footnotes, measure, ready, mermaidEnabled);
    const height =
        contentHeight +
        (contentHeight > 0 && footnotesHeight > 0 ? BLOCK_GAP : 0) +
        footnotesHeight;
    const painted = text.length === 0 ? PARAGRAPH_LINE : height;
    byMeasure[measureKey] = painted;
    return painted;
}

/** Mounted tables re-solve on every resize and streamed prefix. Keep their
 * parsed sources in one cache that is replaced, not grown, once it holds a
 * few sources or a few long ones: every streamed prefix is a new source, and
 * measured cells survive the reset in the shared cell cache. */
const TABLE_RENDER_SOURCES = 32;
const TABLE_RENDER_CHARACTERS = 64 * 1_024;
let tableRenderCache = messageTextLayoutCacheCreate();
let tableRenderSources = 0;
let tableRenderCharacters = 0;
function markdownTableAt(
    nodes: readonly MarkdownRootContent[],
    offset: number,
): MarkdownTable | undefined {
    for (const node of nodes) {
        if (node.type === "table" && node.position?.start.offset === offset) return node;
        const children =
            node.type === "blockquote" || node.type === "footnoteDefinition"
                ? node.children
                : node.type === "list"
                  ? node.children.flatMap((item) => item.children)
                  : undefined;
        const found = children && markdownTableAt(children, offset);
        if (found) return found;
    }
    return undefined;
}
/**
 * Layout of the table that starts at `offset` in Markdown `source`, at the
 * measure its mounted scrollport actually has. This is the same AST and the
 * same solve `markdownBodyHeight` used for the row, not a second model.
 */
export function markdownTableLayoutAt(
    source: string,
    offset: number,
    measure: number,
): MarkdownTableLayout | undefined {
    if (tableRenderCache.markdownTrees[source] === undefined) {
        tableRenderSources += 1;
        tableRenderCharacters += source.length;
        if (
            tableRenderSources > TABLE_RENDER_SOURCES ||
            tableRenderCharacters > TABLE_RENDER_CHARACTERS
        ) {
            tableRenderCache = messageTextLayoutCacheCreate();
            tableRenderSources = 1;
            tableRenderCharacters = source.length;
        }
    }
    const cache = cacheReady(tableRenderCache);
    const tree = messageMarkdownTree(source, cache);
    const table = markdownTableAt(tree.children, offset);
    if (!table) return undefined;
    return markdownTableLayout(
        table,
        measure,
        cache,
        messageMarkdownFootnotes(source, tree, cache),
    );
}

/** Painted height of a service line's 13px copy wrapped at `measure` px. */
export function noticeTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${NOTICE_SIZE}px ${UI_FAMILY}`, NOTICE_LINE, measure, cache);
}
/**
 * Width of the 11px mono time that shares the own-message bubble line. It is
 * transparent until hover but always in flow, so it takes real measure away
 * from the bubble beside it.
 */
export function asideTimeWidth(time: string, cache: MessageTextLayoutCache = sharedCache): number {
    if (time.length === 0) return 0;
    const font = `11px ${MONO_FAMILY}`;
    return naturalTextWidth(time, font, cache);
}
/** Natural width of ordinary message UI text at one explicit size. */
export function uiTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
    weight = 400,
): number {
    const font = `${weight === 400 ? "" : `${String(weight)} `}${String(size)}px ${UI_FAMILY}`;
    return naturalTextWidth(text, font, cache);
}
/** Natural width of one mono run at an explicit size. */
export function monoTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return naturalTextWidth(text, `${String(size)}px ${MONO_FAMILY}`, cache);
}
function naturalTextWidth(text: string, font: string, cache: MessageTextLayoutCache): number {
    const ready = cacheReady(cache);
    let byText = ready.naturalWidths[font];
    if (!byText) {
        byText = dictionaryCreate();
        ready.naturalWidths[font] = byText;
    }
    const hit = byText[text];
    if (hit !== undefined) return hit;
    /* The width itself is what is kept. Reuse a retained preparation of the
       same text, but do not retain one only to measure it once. */
    const width = measureNaturalWidth(
        preparationHit(ready, preparationTable(ready.preparedSegments, font, "normal"), text) ??
            prepareWithSegments(text, font, { whiteSpace: "normal" }),
    );
    byText[text] = width;
    return width;
}
