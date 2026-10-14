import { useState } from "react";
import { REORDERING_LIST_STATIC, ReorderingList } from "../../src/ReorderingList";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-296";

interface Entry {
    readonly id: string;
    readonly label: string;
}

const ENTRIES: readonly Entry[] = [
    { id: "a", label: "Buy oat milk" },
    { id: "b", label: "Book the venue" },
    { id: "c", label: "Send the invoice" },
    { id: "d", label: "Water the plants" },
    { id: "e", label: "Call the bank" },
];

const rowStyle = {
    alignItems: "center",
    background: "var(--surface-high)",
    borderRadius: "10px",
    boxSizing: "border-box",
    display: "flex",
    flex: "1 1 auto",
    gap: "8px",
    padding: "0 12px",
} as const;

function moved(entries: readonly Entry[], key: string, toIndex: number): readonly Entry[] {
    const from = entries.findIndex((entry) => entry.id === key);
    if (from < 0 || from === toIndex) return entries;
    const next = [...entries];
    const [entry] = next.splice(from, 1);
    next.splice(toIndex, 0, entry!);
    return next;
}

/** A live list: drag any row; the button on each row is static and only removes it. */
function LiveList() {
    const [entries, setEntries] = useState(ENTRIES);
    const [added, setAdded] = useState(0);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "360px" }}>
            <ReorderingList
                aria-label="Errands"
                footer={
                    <button
                        onClick={() => {
                            setAdded(added + 1);
                            setEntries([
                                ...entries,
                                {
                                    id: `n${String(added)}`,
                                    label: `New errand ${String(added + 1)}`,
                                },
                            ]);
                        }}
                        type="button"
                    >
                        Add one (footer: never dragged)
                    </button>
                }
                gap={4}
                itemHeight={40}
                itemKey={(entry) => entry.id}
                items={entries}
                onMove={(key, toIndex) => setEntries(moved(entries, key, toIndex))}
                renderItem={(entry) => (
                    <div style={rowStyle}>
                        <span style={{ flex: "1 1 auto" }}>{entry.label}</span>
                        <button
                            {...REORDERING_LIST_STATIC}
                            onClick={() => setEntries(entries.filter((other) => other !== entry))}
                            type="button"
                        >
                            Remove
                        </button>
                    </div>
                )}
                style={{ gap: "12px" }}
            />
        </div>
    );
}

export function ReorderingListPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Fixed-height rows placed by slot: a press that travels 4px drags a row, the others glide out of its way, and every slot crossed is reported as it is crossed. Controls marked static never start a drag."
            title="ReorderingList"
        >
            <Specimen
                detail="360px · 40px rows on 4px gaps · drag a row; Remove and the footer are not draggable"
                label="Live"
                number="01"
                stage="surface"
            >
                <LiveList />
            </Specimen>
            <Specimen
                detail="360px · no onMove · nothing can be dragged"
                label="Static"
                number="02"
                stage="surface"
            >
                <div style={{ width: "360px" }}>
                    <ReorderingList
                        aria-label="Errands"
                        gap={4}
                        itemHeight={40}
                        itemKey={(entry) => entry.id}
                        items={ENTRIES.slice(0, 3)}
                        renderItem={(entry) => <div style={rowStyle}>{entry.label}</div>}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
