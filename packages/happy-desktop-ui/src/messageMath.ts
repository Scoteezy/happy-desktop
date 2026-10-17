import { mathFromMarkdown } from "mdast-util-math";
import { math as mathSyntax } from "micromark-extension-math";
import {
    asciiDigit,
    markdownLineEnding,
    markdownLineEndingOrSpace,
} from "micromark-util-character";
import type {
    Code,
    Construct,
    Effects,
    Extension,
    State,
    Token,
    TokenizeContext,
} from "micromark-util-types";
import type { Data, Processor } from "unified";

declare module "micromark-util-types" {
    interface TokenTypeMap {
        messageMath: "messageMath";
        messageMathMarker: "messageMathMarker";
        messageMathData: "messageMathData";
    }
}

declare module "mdast-util-math" {
    interface InlineMathData {
        /** Written with display delimiters (`$$…$$` or `\[…\]`) inside a paragraph. */
        messageMathDisplay?: boolean;
    }
}

/**
 * TeX in a chat message, written the ways models and people write it:
 *
 * - `$…$` and `\(…\)` are inline;
 * - `$$…$$` and `\[…\]` are display, whether on their own lines or mid-paragraph;
 * - a fenced `$$` block on its own lines is display (micromark-extension-math's
 *   flow construct, unchanged).
 *
 * A single dollar follows Pandoc's rule so prices stay prices: the opening `$`
 * must have a non-space character right after it, and the closing `$` must have
 * a non-space character right before it and no digit right after it. "$5 and
 * $10" is therefore text. Like a code span, a formula is opaque to every other
 * inline construct, and code spans and fenced code are opaque to it.
 *
 * Model output is the external boundary here: these delimiters are a written
 * convention, not a contract. Past this module a formula travels as an explicit
 * `inlineMath`/`math` node.
 */

const DOLLAR = 36;
const BACKSLASH = 92;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;

type Ok = (code: Code) => State | undefined;

/**
 * Shared body scanner: consumes TeX until `closes` says a closing delimiter
 * starts here, then hands that code to `close` with no data token open.
 */
function mathBody(
    effects: Effects,
    nok: Ok,
    closes: (code: Code, previous: Code) => boolean,
    close: State,
): State {
    let dataOpen = false;
    let previous: Code = null;
    let empty = true;
    const dataEnter = () => {
        if (dataOpen) return;
        effects.enter("messageMathData");
        dataOpen = true;
    };
    const dataExit = () => {
        if (!dataOpen) return;
        effects.exit("messageMathData");
        dataOpen = false;
    };
    const body: State = (code) => {
        if (code === null) return nok(code);
        if (markdownLineEnding(code)) {
            dataExit();
            effects.enter("lineEnding");
            effects.consume(code);
            effects.exit("lineEnding");
            previous = code;
            return body;
        }
        if (!empty && closes(code, previous)) {
            dataExit();
            return close(code);
        }
        dataEnter();
        if (!markdownLineEndingOrSpace(code)) empty = false;
        effects.consume(code);
        previous = code;
        /* Past a closing check, a backslash takes the next character with it:
           `\$` inside a dollar formula is TeX, never its closing delimiter. */
        if (code === BACKSLASH) return escaped;
        return body;
    };
    const escaped: State = (code) => {
        if (code === null || markdownLineEnding(code)) return body(code);
        effects.consume(code);
        previous = code;
        empty = false;
        return body;
    };
    return body;
}

/** `$…$` and `$$…$$`. */
function tokenizeDollarMath(this: TokenizeContext, effects: Effects, ok: Ok, nok: Ok): State {
    let open = 0;
    let closeToken: Token | undefined;
    let close = 0;
    const start: State = (code) => {
        effects.enter("messageMath");
        effects.enter("messageMathMarker");
        return sequenceOpen(code);
    };
    const sequenceOpen: State = (code) => {
        if (code === DOLLAR) {
            if (open === 2) return nok(code);
            effects.consume(code);
            open += 1;
            return sequenceOpen;
        }
        effects.exit("messageMathMarker");
        /* Pandoc: a single opening dollar is followed by a non-space. */
        if (open === 1 && (code === null || markdownLineEndingOrSpace(code))) return nok(code);
        return body(code);
    };
    const sequenceClose: State = (code) => {
        if (code === DOLLAR) {
            effects.consume(code);
            close += 1;
            return sequenceClose;
        }
        /* A run of a different length, or a single dollar followed by a digit
           ("$x$5" never; "between $1 and $2" is prices), is TeX data. */
        if (close === open && !(open === 1 && asciiDigit(code))) {
            effects.exit("messageMathMarker");
            effects.exit("messageMath");
            return ok(code);
        }
        closeToken!.type = "messageMathData";
        effects.exit("messageMathData");
        return body(code);
    };
    const body = mathBody(
        effects,
        nok,
        /* Pandoc: a single closing dollar follows a non-space. */
        (code, previous) => code === DOLLAR && !(open === 1 && markdownLineEndingOrSpace(previous)),
        (code) => {
            closeToken = effects.enter("messageMathMarker");
            close = 0;
            return sequenceClose(code);
        },
    );
    return start;
}

/** `\(…\)` and `\[…\]`. */
function tokenizeBracketMath(this: TokenizeContext, effects: Effects, ok: Ok, nok: Ok): State {
    let closing = RIGHT_PAREN;
    let closeToken: Token | undefined;
    const start: State = (code) => {
        effects.enter("messageMath");
        effects.enter("messageMathMarker");
        effects.consume(code);
        return opener;
    };
    const opener: State = (code) => {
        if (code !== LEFT_PAREN && code !== LEFT_BRACKET) return nok(code);
        closing = code === LEFT_PAREN ? RIGHT_PAREN : RIGHT_BRACKET;
        effects.consume(code);
        effects.exit("messageMathMarker");
        return body;
    };
    const closer: State = (code) => {
        if (code === closing) {
            effects.consume(code);
            effects.exit("messageMathMarker");
            effects.exit("messageMath");
            return ok;
        }
        /* Any other escape inside the formula is TeX (`\frac`, `\\`). */
        closeToken!.type = "messageMathData";
        if (code === null || markdownLineEnding(code)) {
            effects.exit("messageMathData");
            return body(code);
        }
        effects.consume(code);
        effects.exit("messageMathData");
        return body;
    };
    const body = mathBody(
        effects,
        nok,
        (code) => code === BACKSLASH,
        (code) => {
            closeToken = effects.enter("messageMathMarker");
            effects.consume(code);
            return closer;
        },
    );
    return start;
}

const dollarMath: Construct = {
    name: "messageMathDollar",
    tokenize: tokenizeDollarMath,
    /* A dollar right after another (unescaped) dollar belongs to that run. */
    previous(this: TokenizeContext, code: Code) {
        return code !== DOLLAR || this.events.at(-1)?.[1].type === "characterEscape";
    },
};
const bracketMath: Construct = { name: "messageMathBracket", tokenize: tokenizeBracketMath };

/** Extension constructs run before the built-in character escape on `\`. */
const messageMathSyntax: Extension = {
    flow: mathSyntax().flow,
    text: { [DOLLAR]: dollarMath, [BACKSLASH]: bracketMath },
};

type FromMarkdownExtension = Exclude<
    NonNullable<Data["fromMarkdownExtensions"]>[number],
    readonly unknown[]
>;
type FromMarkdownHandle = NonNullable<NonNullable<FromMarkdownExtension["enter"]>[string]>;
type CompileContext = ThisParameterType<FromMarkdownHandle>;

/** Opening/closing delimiter lengths, read back from the marker tokens. */
const enterMessageMath: FromMarkdownHandle = function (this: CompileContext, token) {
    this.enter({ type: "inlineMath", value: "" }, token);
};
const exitMessageMath: FromMarkdownHandle = function (this: CompileContext, token) {
    const source = this.sliceSerialize(token);
    const node = this.stack.at(-1);
    this.exit(token);
    if (node?.type !== "inlineMath") return;
    const display = source.startsWith("$$") || source.startsWith("\\[");
    const delimiter = source.startsWith("$$") || source.startsWith("\\") ? 2 : 1;
    node.value = source.slice(delimiter, source.length - delimiter).trim();
    if (display) node.data = { messageMathDisplay: true };
};
const messageMathFromMarkdown: FromMarkdownExtension[] = [
    mathFromMarkdown(),
    { enter: { messageMath: enterMessageMath }, exit: { messageMath: exitMessageMath } },
];

/**
 * The parts of a Markdown tree the block lift touches, named structurally like
 * `remarkFileReferences` does.
 */
interface MathTreeNode {
    type: string;
    value?: string;
    children?: MathTreeNode[];
    position?: {
        start: { line: number; column: number; offset?: number };
        end: { line: number; column: number; offset?: number };
    };
    data?: {
        messageMathDisplay?: boolean;
        hName?: string;
        hProperties?: Record<string, string>;
        hChildren?: { type: "text"; value: string }[];
    };
}

/** What a formula element hands the component that renders it, as `data-math`. */
type MessageMathMode = "inline" | "display";

function mathElementData(node: MathTreeNode, mode: MessageMathMode): void {
    node.data = {
        ...node.data,
        hName: mode === "inline" ? "span" : "div",
        hProperties: { dataMath: mode },
        hChildren: [{ type: "text", value: node.value ?? "" }],
    };
}

const BOUNDARY_SPACE = /^[\t\n\r ]+|[\t\n\r ]+$/gu;

/** Drops the whitespace and hard breaks a paragraph piece keeps at its cut edge. */
function paragraphPieceTrim(children: MathTreeNode[], edge: "start" | "end"): MathTreeNode[] {
    const nodes = [...children];
    for (;;) {
        const index = edge === "start" ? 0 : nodes.length - 1;
        const node = nodes[index];
        if (node === undefined) return nodes;
        if (node.type === "break") {
            nodes.splice(index, 1);
            continue;
        }
        if (node.type !== "text") return nodes;
        const value =
            edge === "start"
                ? (node.value ?? "").replace(/^[\t\n\r ]+/u, "")
                : (node.value ?? "").replace(/[\t\n\r ]+$/u, "");
        if (value.length > 0) {
            nodes[index] = { ...node, value };
            return nodes;
        }
        nodes.splice(index, 1);
    }
}

function paragraphPiece(
    paragraph: MathTreeNode,
    children: MathTreeNode[],
    first: boolean,
    last: boolean,
): MathTreeNode | undefined {
    let nodes = children;
    if (!first) nodes = paragraphPieceTrim(nodes, "start");
    if (!last) nodes = paragraphPieceTrim(nodes, "end");
    if (
        nodes.every(
            (node) => node.type === "text" && (node.value ?? "").replace(BOUNDARY_SPACE, "") === "",
        )
    )
        return undefined;
    const start = first ? paragraph.position?.start : nodes[0]?.position?.start;
    const end = last ? paragraph.position?.end : nodes.at(-1)?.position?.end;
    return {
        type: "paragraph",
        children: nodes,
        ...(start && end ? { position: { start, end } } : {}),
    };
}

/**
 * Splits a paragraph around every display formula written inside it, so
 * "The energy is:\n\[E = mc^2\]\nwhere…" reads as a paragraph, a centred
 * equation, and a paragraph. A display formula inside a heading, table cell,
 * or link stays inline: those have nowhere to put a block.
 */
function paragraphDisplayLift(paragraph: MathTreeNode): MathTreeNode[] {
    const children = paragraph.children ?? [];
    if (!children.some((child) => child.type === "inlineMath" && child.data?.messageMathDisplay))
        return [paragraph];
    const blocks: MathTreeNode[] = [];
    let run: MathTreeNode[] = [];
    let first = true;
    const flush = (last: boolean) => {
        const piece = paragraphPiece(paragraph, run, first, last);
        if (piece) blocks.push(piece);
        run = [];
        first = false;
    };
    for (const child of children) {
        if (child.type === "inlineMath" && child.data?.messageMathDisplay) {
            flush(false);
            blocks.push({
                type: "math",
                value: child.value ?? "",
                ...(child.position ? { position: child.position } : {}),
            });
            continue;
        }
        run.push(child);
    }
    flush(true);
    return blocks;
}

function mathTreeWalk(node: MathTreeNode): void {
    const children = node.children;
    if (children === undefined) return;
    const next: MathTreeNode[] = [];
    for (const child of children) {
        if (child.type === "paragraph") next.push(...paragraphDisplayLift(child));
        else next.push(child);
    }
    node.children = next;
    for (const child of next) {
        if (child.type === "inlineMath") mathElementData(child, "inline");
        else if (child.type === "math") mathElementData(child, "display");
        else mathTreeWalk(child);
    }
}

/**
 * Gives a parsed message its final math shape: display formulas lifted out of
 * their paragraphs, and every formula told which element it renders as. The
 * renderer runs this as a transform and the row-height parser calls it
 * directly, so both read one tree.
 */
export function messageMathTreeShape<T>(tree: T): T {
    mathTreeWalk(tree as MathTreeNode);
    return tree;
}

/** Registers the math syntax with remark and shapes the parsed tree. */
export function remarkMessageMath(this: Processor) {
    const data = this.data();
    (data.micromarkExtensions ??= []).push(messageMathSyntax);
    (data.fromMarkdownExtensions ??= []).push(messageMathFromMarkdown);
    return (tree: unknown): void => {
        messageMathTreeShape(tree);
    };
}
