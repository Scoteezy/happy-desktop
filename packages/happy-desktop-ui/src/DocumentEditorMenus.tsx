import {
    type DefaultSuggestionItem,
    LinkToolbarExtension,
    SideMenuExtension,
    SuggestionMenu,
} from "@blocknote/core/extensions";
import {
    type DefaultReactSuggestionItem,
    type LinkToolbarProps,
    type SuggestionMenuProps,
    useBlockNoteEditor,
    useEditorState,
    useExtension,
    useExtensionState,
} from "@blocknote/react";
import { useState, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import { Octicon, type OcticonName } from "./vectorIcons/VectorIcon";

/*
 * The editor's own menus, drawn in the house style. BlockNote positions them
 * and says what they act on; everything the reader sees and presses is here,
 * with glyphs from the house icon fonts.
 */

/** A slash-menu entry: one kind of block, with its glyph. */
export type DocumentSlashMenuItem = DefaultReactSuggestionItem & { readonly key: string };

/**
 * The blocks the slash menu offers, in order, under the house's names. Only
 * blocks a Markdown copy of the document can hold are offered.
 */
const SLASH_BLOCKS: readonly {
    readonly key: string;
    readonly title: string;
    readonly icon: OcticonName;
    readonly aliases: readonly string[];
}[] = [
    { key: "paragraph", title: "Text", icon: "typography", aliases: ["paragraph", "p"] },
    { key: "heading", title: "Heading 1", icon: "heading", aliases: ["h1", "title"] },
    { key: "heading_2", title: "Heading 2", icon: "heading", aliases: ["h2", "subtitle"] },
    { key: "heading_3", title: "Heading 3", icon: "heading", aliases: ["h3"] },
    {
        key: "bullet_list",
        title: "Bulleted list",
        icon: "list-unordered",
        aliases: ["ul", "bullet", "list"],
    },
    {
        key: "numbered_list",
        title: "Numbered list",
        icon: "list-ordered",
        aliases: ["ol", "numbered", "list"],
    },
    {
        key: "check_list",
        title: "Checklist",
        icon: "tasklist",
        aliases: ["todo", "task", "checkbox"],
    },
    { key: "quote", title: "Quote", icon: "quote", aliases: ["blockquote"] },
    { key: "code_block", title: "Code", icon: "code", aliases: ["code block", "pre"] },
    { key: "divider", title: "Divider", icon: "horizontal-rule", aliases: ["hr", "rule", "line"] },
];

/** The slash menu's entries, made from BlockNote's own block actions. */
export function documentSlashMenuItems(
    defaults: readonly DefaultSuggestionItem[],
): DocumentSlashMenuItem[] {
    return SLASH_BLOCKS.flatMap((block) => {
        const action = defaults.find((item) => item.key === block.key);
        if (action === undefined) return [];
        return [
            {
                key: block.key,
                title: block.title,
                aliases: [...block.aliases],
                onItemClick: action.onItemClick,
                icon: <Octicon name={block.icon} size={16} />,
            },
        ];
    });
}

/** The menu `/` opens at the caret: the kinds of block to turn this line into. */
export function DocumentSlashMenu(props: SuggestionMenuProps<DocumentSlashMenuItem>) {
    return (
        <div
            className="happy-document-editor__menu"
            data-happy-desktop-ui="document-editor-slash-menu"
        >
            <div className="happy-document-editor__menu-list">
                <div
                    className="happy-document-editor__menu-rows"
                    id="bn-suggestion-menu"
                    role="listbox"
                >
                    {props.items.map((item, index) => {
                        const selected = index === props.selectedIndex;
                        return (
                            <button
                                aria-selected={selected}
                                className="happy-document-editor__menu-item"
                                data-selected={selected ? "" : undefined}
                                id={`bn-suggestion-menu-item-${String(index)}`}
                                key={item.key}
                                onClick={() => props.onItemClick?.(item)}
                                // The caret stays in the text, where the block is
                                // made; the arrow keys move the selection here.
                                onMouseDown={(event) => event.preventDefault()}
                                ref={
                                    selected
                                        ? (element) => element?.scrollIntoView({ block: "nearest" })
                                        : undefined
                                }
                                role="option"
                                tabIndex={-1}
                                type="button"
                            >
                                <span className="happy-document-editor__menu-icon">
                                    {item.icon}
                                </span>
                                <span className="happy-document-editor__menu-label">
                                    {item.title}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** One square, icon-only control on a floating editor bar. */
function BarButton(props: {
    label: string;
    icon: OcticonName;
    pressed?: boolean;
    onPress: () => void;
    placement?: "top" | "bottom";
    "data-testid"?: string;
}) {
    return (
        <Tooltip label={props.label} placement={props.placement ?? "top"}>
            <button
                aria-label={props.label}
                aria-pressed={props.pressed}
                className="happy-document-editor__bar-button"
                data-testid={props["data-testid"]}
                onClick={props.onPress}
                // Pressing a bar button never takes the caret or the selection
                // out of the text it acts on.
                onMouseDown={(event) => event.preventDefault()}
                type="button"
            >
                <Octicon name={props.icon} size={16} />
            </button>
        </Tooltip>
    );
}

/** A bar, and the field that replaces its buttons while a link is being written. */
function Bar(props: { children: ReactNode; testId: string }) {
    return (
        <div
            className="happy-document-editor__bar"
            data-happy-desktop-ui="document-editor-bar"
            data-testid={props.testId}
        >
            {props.children}
        </div>
    );
}

function LinkField(props: {
    initial: string;
    onApply: (url: string) => void;
    onCancel: () => void;
}) {
    const [url, setUrl] = useState(props.initial);
    return (
        <form
            className="happy-document-editor__link-form"
            onSubmit={(event) => {
                event.preventDefault();
                const trimmed = url.trim();
                if (trimmed.length > 0) props.onApply(trimmed);
            }}
        >
            <input
                aria-label="Link address"
                autoFocus
                className="happy-document-editor__link-field"
                data-testid="document-editor-link-field"
                onChange={(event) => setUrl(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    props.onCancel();
                }}
                placeholder="Paste or type a link"
                spellCheck={false}
                type="url"
                value={url}
            />
            <BarButton
                icon="check"
                label="Apply link"
                onPress={() => {
                    const trimmed = url.trim();
                    if (trimmed.length > 0) props.onApply(trimmed);
                }}
                placement="bottom"
            />
        </form>
    );
}

const TEXT_STYLES = [
    { style: "bold", icon: "bold", label: "Bold  ⌘B" },
    { style: "italic", icon: "italic", label: "Italic  ⌘I" },
    { style: "strike", icon: "strikethrough", label: "Strikethrough  ⌘⇧S" },
    { style: "code", icon: "code", label: "Code  ⌘E" },
] as const satisfies readonly { style: string; icon: OcticonName; label: string }[];

type TextStyle = (typeof TEXT_STYLES)[number]["style"];

/** The bar over selected text: bold, italic, struck through, code, and a link. */
export function DocumentFormattingToolbar() {
    const editor = useBlockNoteEditor();
    const state = useEditorState({
        editor,
        selector: ({ editor: current }) => {
            const active = current.getActiveStyles() as Partial<Record<TextStyle, boolean>>;
            return {
                bold: active.bold === true,
                italic: active.italic === true,
                strike: active.strike === true,
                code: active.code === true,
                link: current.getSelectedLinkUrl() ?? "",
            };
        },
    });
    const [linking, setLinking] = useState(false);
    if (linking)
        return (
            <Bar testId="document-editor-formatting-bar">
                <LinkField
                    initial={state.link}
                    onApply={(url) => {
                        editor.createLink(url);
                        setLinking(false);
                        editor.focus();
                    }}
                    onCancel={() => {
                        setLinking(false);
                        editor.focus();
                    }}
                />
            </Bar>
        );
    return (
        <Bar testId="document-editor-formatting-bar">
            {TEXT_STYLES.map((entry) => (
                <BarButton
                    data-testid={`document-editor-${entry.style}`}
                    icon={entry.icon}
                    key={entry.style}
                    label={entry.label}
                    onPress={() => editor.toggleStyles({ [entry.style]: true })}
                    pressed={state[entry.style]}
                />
            ))}
            <span className="happy-document-editor__bar-rule" />
            <BarButton
                data-testid="document-editor-link"
                icon="link"
                label="Link  ⌘K"
                onPress={() => setLinking(true)}
                pressed={state.link.length > 0}
            />
        </Bar>
    );
}

/** The bar over a link the caret is in or the pointer rests on: where it goes, and what to do with it. */
export function DocumentLinkToolbar(props: LinkToolbarProps) {
    const editor = useBlockNoteEditor();
    const links = useExtension(LinkToolbarExtension);
    const [editing, setEditing] = useState(false);
    if (editing)
        return (
            <Bar testId="document-editor-link-bar">
                <LinkField
                    initial={props.url}
                    onApply={(url) => {
                        links.editLink(url, props.text, props.range.from);
                        setEditing(false);
                        props.setToolbarPositionFrozen?.(false);
                        props.setToolbarOpen?.(false);
                        editor.focus();
                    }}
                    onCancel={() => {
                        setEditing(false);
                        props.setToolbarPositionFrozen?.(false);
                        editor.focus();
                    }}
                />
            </Bar>
        );
    return (
        <Bar testId="document-editor-link-bar">
            <a
                className="happy-document-editor__bar-url"
                href={props.url}
                rel="noreferrer"
                target="_blank"
                title={props.url}
            >
                {props.url}
            </a>
            <BarButton
                icon="link-external"
                label="Open link"
                onPress={() => window.open(props.url, "_blank", "noopener,noreferrer")}
            />
            <BarButton
                icon="pencil"
                label="Edit link"
                onPress={() => {
                    props.setToolbarPositionFrozen?.(true);
                    setEditing(true);
                }}
            />
            <BarButton
                icon="x"
                label="Remove link"
                onPress={() => {
                    links.deleteLink(props.range.from);
                    props.setToolbarOpen?.(false);
                }}
            />
        </Bar>
    );
}

/**
 * Beside the block under the pointer: + to add a block below it, and a handle
 * to drag it somewhere else.
 */
export function DocumentSideMenu() {
    const editor = useBlockNoteEditor();
    const sideMenu = useExtension(SideMenuExtension);
    const suggestionMenu = useExtension(SuggestionMenu);
    const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block });
    if (block === undefined) return null;
    const add = () => {
        // An empty line becomes the new block; otherwise one is made below it.
        const empty = Array.isArray(block.content) && block.content.length === 0;
        const target = empty
            ? block
            : editor.insertBlocks([{ type: "paragraph" }], block, "after")[0];
        if (target === undefined) return;
        editor.setTextCursorPosition(target);
        suggestionMenu.openSuggestionMenu("/");
    };
    return (
        <div
            className="happy-document-editor__side-menu"
            data-happy-desktop-ui="document-editor-side-menu"
        >
            <button
                aria-label="Add a block"
                className="happy-document-editor__side-button"
                data-testid="document-editor-add-block"
                onClick={add}
                type="button"
            >
                <Octicon name="plus" size={16} />
            </button>
            <button
                aria-label="Drag to move"
                className="happy-document-editor__side-button"
                data-testid="document-editor-drag-block"
                draggable
                onDragEnd={sideMenu.blockDragEnd}
                onDragStart={(event) => sideMenu.blockDragStart(event, block)}
                type="button"
            >
                <Octicon name="grabber" size={16} />
            </button>
        </div>
    );
}
