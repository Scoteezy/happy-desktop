import { Composer } from "../../src/Composer";
import { ConfirmPopover } from "../../src/ConfirmPopover";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-310";

export function ConfirmPopoverPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A question asked in place, above the control that raised it: title, optional message, and right-aligned Cancel and confirm actions on the menus' raised surface. Focus starts on Cancel, Escape cancels, and Tab cycles between the two actions. The host anchors it and decides what an outside press does."
            title="Confirm popover"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="280px card · 12px padding · 28px actions · destructive confirm"
                    label="Danger"
                    number="CP-01"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="width 280" />
                        <ConfirmPopover
                            confirmLabel="Stop subagents"
                            message="Agents this chat started will stop their current work. Nothing is archived."
                            onCancel={() => {}}
                            onConfirm={() => {}}
                            title="Stop all subagents?"
                            tone="danger"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="title only · primary confirm"
                    label="Default"
                    number="CP-02"
                    stage="surface"
                >
                    <ConfirmPopover
                        confirmLabel="Discard"
                        onCancel={() => {}}
                        onConfirm={() => {}}
                        title="Discard this draft?"
                    />
                </Specimen>
                <Specimen
                    detail="own turn idle · subagents working · Stop asks above itself when pressed"
                    label="In the composer"
                    number="CP-03"
                    stage="app"
                >
                    <div style={{ paddingTop: "140px", width: "520px" }}>
                        <Composer
                            onSend={() => {}}
                            onSubagentsStop={() => {}}
                            onValueChange={() => {}}
                            subagentsRunning
                            value=""
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
