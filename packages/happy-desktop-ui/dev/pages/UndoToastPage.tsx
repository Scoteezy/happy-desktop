import { commandShortcut } from "../../src/keyboardShortcut";
import { UndoToast } from "../../src/UndoToast";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-284";

export function UndoToastPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The one line that follows a pin, snooze, or settle: what was done and the way to take it back. It is a status over the window, never a dialog, and it holds no timer of its own."
            title="UndoToast"
        >
            <Specimen
                detail="Pinned to the bottom of the window in product; shown in flow here. Undo wears the chord that also undoes it."
                label="With shortcut"
                number="01"
            >
                <UndoToast
                    label="Settled happy · feat/release"
                    onDismiss={() => undefined}
                    onUndo={() => undefined}
                    shortcut={commandShortcut("z")}
                    style={{ position: "static", transform: "none" }}
                />
            </Specimen>
            <Specimen
                detail="No dismiss control; the offer lapses on its own."
                label="Plain"
                number="02"
            >
                <UndoToast
                    label="Pinned happy"
                    onUndo={() => undefined}
                    style={{ position: "static", transform: "none" }}
                />
            </Specimen>
        </ComponentPage>
    );
}
