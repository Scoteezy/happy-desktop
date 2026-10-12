/** One source line after its blockquote markers, with its indentation measured. */
type MarkdownLine = {
    readonly start: number;
    readonly text: string;
    /** Blockquote nesting depth. */
    readonly quotes: number;
    /** Characters before `content`: blockquote markers and indentation. */
    readonly prefix: number;
    /** Indentation in columns after the blockquote markers. */
    readonly columns: number;
    /** Indentation past the enclosing list item's content column. */
    readonly indent: number;
    readonly content: string;
};

const QUOTE_MARKERS = /^(?: {0,3}> ?)*/u;
const FENCE = /^(`{3,}|~{3,})/u;
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/u;
const DELIMITER_CELL = /^[ \t]*:?-+:?[ \t]*$/u;
/** What a delimiter row looks like while it is still being typed, including not at all yet. */
const DELIMITER_PREFIX = /^[ \t:|-]*$/u;
/** Block starts that end a GFM table body (micromark-extension-gfm-table). */
const TABLE_INTERRUPT =
    /^(?:#{1,6}(?:[ \t]|$)|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|>|`{3,}|~{3,}|<|(?:\*[ \t]*){3,}$|(?:-[ \t]*){3,}$|(?:_[ \t]*){3,}$)/u;

function markdownLine(raw: string, start: number, listContent: number): MarkdownLine {
    const markers = QUOTE_MARKERS.exec(raw)![0];
    const unquoted = raw.slice(markers.length);
    let columns = 0;
    let index = 0;
    for (; index < unquoted.length; index += 1) {
        if (unquoted[index] === " ") columns += 1;
        else if (unquoted[index] === "\t") columns += 4 - (columns % 4);
        else break;
    }
    return {
        start,
        text: raw,
        quotes: markers.split(">").length - 1,
        prefix: raw.length - unquoted.length + index,
        columns,
        indent: listContent > 0 && columns >= listContent ? columns - listContent : columns,
        content: unquoted.slice(index).replace(/\r$/u, ""),
    };
}
/** Offsets in `content` of the pipes that separate cells; `\|` is literal text. */
function linePipes(content: string): number[] {
    const pipes: number[] = [];
    for (let index = 0; index < content.length; index += 1) {
        if (content[index] === "\\") index += 1;
        else if (content[index] === "|") pipes.push(index);
    }
    return pipes;
}
function lineCellCount(content: string): number {
    const text = content.trimEnd();
    const pipes = linePipes(text);
    let count = pipes.length + 1;
    if (pipes[0] === 0) count -= 1;
    if (pipes.length > 0 && pipes.at(-1) === text.length - 1 && text.length > 1) count -= 1;
    return count;
}
function lineIsDelimiter(line: MarkdownLine, header: MarkdownLine): boolean {
    if (line.indent > 3 || !line.content.includes("|")) return false;
    const cells = line.content.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|");
    return (
        cells.every((cell) => DELIMITER_CELL.test(cell)) &&
        cells.length === lineCellCount(header.content)
    );
}

/**
 * The prefix of a still-streaming Markdown reply that shows only complete
 * table cells. Every streamed reply passes through here before anything parses
 * or measures it, so the row-height model and the renderer read the same text.
 *
 * Inside a GFM table, the row being written is cut back to its last closing
 * `|`; a row ends at its newline, so a final cell without a trailing pipe
 * appears with it. A line that ends the table (a heading, a list item, a
 * quote, a fence, a thematic break, HTML or indented code) is left alone.
 *
 * Before a table exists, only a line led by `|` is held back: while it is
 * being written, and while the line under it could still become its delimiter
 * row. It reappears the moment the next line rules that out. A header without
 * outer pipes stays visible as the prose it may turn out to be; only the
 * delimiter-looking line under it waits for its newline.
 *
 * Fenced and indented code is never touched, and settled replies never come
 * through here at all, which is also what flushes anything held back.
 */
export function happyAgentStreamingMarkdownTrim(text: string): string {
    const raws = text.split("\n");
    let start = 0;
    let fence: string | undefined;
    let listContent = 0;
    let inTable = false;
    /* The blockquote depth the open table lives at; another depth ends it. */
    let tableQuotes = 0;
    let afterBlank = true;
    /* The complete line directly above, while a paragraph is open on it: the
       only line a delimiter row can promote to a table header, and the reason
       an indented line continues prose instead of starting code. */
    let previous: MarkdownLine | undefined;
    for (const raw of raws.slice(0, -1)) {
        const line = markdownLine(raw, start, listContent);
        start += raw.length + 1;
        if (fence !== undefined) {
            const close = FENCE.exec(line.content)?.[1];
            if (
                close !== undefined &&
                close[0] === fence[0] &&
                close.length >= fence.length &&
                line.content.trim() === close
            )
                fence = undefined;
            continue;
        }
        if (line.content.trim().length === 0) {
            inTable = false;
            afterBlank = true;
            previous = undefined;
            continue;
        }
        const marker = LIST_MARKER.exec(line.content);
        if (marker) listContent = line.columns + marker[0].length;
        else if (afterBlank && line.columns < listContent) listContent = 0;
        afterBlank = false;
        if (line.indent >= 4 && (inTable || previous === undefined)) {
            inTable = false;
            continue;
        }
        const opening = FENCE.exec(line.content)?.[1];
        if (opening !== undefined) {
            fence = opening;
            inTable = false;
            previous = undefined;
            continue;
        }
        if (inTable && line.quotes === tableQuotes && !TABLE_INTERRUPT.test(line.content)) continue;
        inTable =
            previous !== undefined &&
            previous.quotes === line.quotes &&
            previous.indent <= 3 &&
            lineIsDelimiter(line, previous);
        tableQuotes = line.quotes;
        previous = inTable || TABLE_INTERRUPT.test(line.content) ? undefined : line;
    }
    if (fence !== undefined) return text;
    const writing = markdownLine(raws.at(-1)!, start, listContent);
    if (writing.indent >= 4 && (inTable || previous === undefined)) return text;
    if (inTable && writing.quotes === tableQuotes) {
        if (TABLE_INTERRUPT.test(writing.content)) return text;
        const pipes = linePipes(writing.content);
        const closing = pipes.at(-1);
        /* An opening pipe closes nothing; without a later one no cell is done. */
        if (closing === undefined || (closing === 0 && pipes.length === 1))
            return text.slice(0, writing.start);
        return text.slice(0, writing.start + writing.prefix + closing + 1);
    }
    if (
        previous !== undefined &&
        /* Nothing typed yet has no quote markers either. */
        (previous.quotes === writing.quotes || writing.text.length === 0) &&
        previous.indent <= 3 &&
        DELIMITER_PREFIX.test(writing.content)
    ) {
        if (previous.content.startsWith("|")) return text.slice(0, previous.start);
        if (writing.content.length > 0 && linePipes(previous.content).length > 0)
            return text.slice(0, writing.start);
    }
    /* A bare `>` paints an empty quote that may be about to hold a table row. */
    const bare = writing.content.trim().length === 0 && writing.text.trim().length > 0;
    if (bare || (writing.indent <= 3 && writing.content.startsWith("|")))
        return text.slice(0, writing.start);
    return text;
}
