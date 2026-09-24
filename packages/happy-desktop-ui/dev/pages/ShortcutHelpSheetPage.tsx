import { commandShortcut, controlShortcut, keyShortcut } from "../../src/keyboardShortcut";
import { ShortcutHelpSheet } from "../../src/ShortcutHelpSheet";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-283";

const groups = [
    {
        label: "Navigate",
        rows: [
            { label: "Command palette", shortcut: commandShortcut("k") },
            {
                label: "Next conversation needing you",
                shortcut: commandShortcut("u", { shift: true }),
            },
            { label: "Mark everything read", shortcut: keyShortcut("escape", { shift: true }) },
            { label: "Walk recent conversations", shortcut: controlShortcut("tab") },
            { label: "Next tab", shortcut: commandShortcut("]", { shift: true }) },
            { label: "Previous tab", shortcut: commandShortcut("[", { shift: true }) },
        ],
    },
    {
        label: "Workspace",
        rows: [
            { label: "New chat", shortcut: commandShortcut("t") },
            { label: "New workspace", shortcut: commandShortcut("n") },
            { label: "Close tab", shortcut: commandShortcut("w") },
            { label: "Toggle side panel", shortcut: commandShortcut("j") },
        ],
    },
    {
        label: "Sidebar",
        rows: [
            {
                label: "Pin or unpin this workspace",
                shortcut: commandShortcut("p", { shift: true }),
            },
            {
                label: "Settle or reopen this workspace",
                shortcut: commandShortcut("s", { shift: true }),
            },
            { label: "Archive this workspace", shortcut: commandShortcut("a", { shift: true }) },
        ],
    },
    {
        label: "Help",
        rows: [{ label: "Keyboard shortcuts", shortcut: commandShortcut("/") }],
    },
];

export function ShortcutHelpSheetPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Every chord the window answers, grouped by what it is about, each wearing the same cap the palette and the controls wear. A reading surface with nothing to press but Close."
            title="ShortcutHelpSheet"
        >
            <Specimen
                detail="Four groups; caps for Command, Control, Shift, and the special keys are drawn by KeyCap."
                label="Sheet"
                number="01"
            >
                <ShortcutHelpSheet groups={groups} onClose={() => undefined} />
            </Specimen>
        </ComponentPage>
    );
}
