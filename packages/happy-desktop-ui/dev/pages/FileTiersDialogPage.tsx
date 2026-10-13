import { useState, type ReactNode } from "react";
import { FileTiersDialog, type FileTiersDialogTier } from "../../src/FileTiersDialog";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-295";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode, height = 560) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: `${String(height)}px`,
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

const handlers = {
    onClose: () => undefined,
    onTierAdd: () => undefined,
    onTierMove: () => undefined,
    onTierNameChange: () => undefined,
    onTierPatternsChange: () => undefined,
    onTierRemove: () => undefined,
};

const configured: FileTiersDialogTier[] = [
    { id: "tests", name: "Tests", patterns: ["*.test.ts", "*.test.tsx"], count: 3 },
    { id: "text", name: "Text fixtures", patterns: ["*.text.ts"], count: 1 },
    { id: "docs", name: "Docs", patterns: ["docs/", "*.md"], count: 0 },
];

/** The editor wired to its own state, so every control answers. */
function LiveDialog() {
    const [tiers, tiersSet] = useState<FileTiersDialogTier[]>(configured);
    const [added, addedSet] = useState(0);
    return (
        <FileTiersDialog
            onClose={() => undefined}
            onTierAdd={() => {
                addedSet(added + 1);
                tiersSet([...tiers, { id: `new-${String(added)}`, name: "", patterns: [] }]);
            }}
            onTierMove={(tierId, direction) => {
                const index = tiers.findIndex((tier) => tier.id === tierId);
                const target = direction === "earlier" ? index - 1 : index + 1;
                if (index === -1 || target < 0 || target >= tiers.length) return;
                const next = [...tiers];
                next[index] = tiers[target]!;
                next[target] = tiers[index]!;
                tiersSet(next);
            }}
            onTierNameChange={(tierId, name) =>
                tiersSet(tiers.map((tier) => (tier.id === tierId ? { ...tier, name } : tier)))
            }
            onTierPatternsChange={(tierId, patterns) =>
                tiersSet(tiers.map((tier) => (tier.id === tierId ? { ...tier, patterns } : tier)))
            }
            onTierRemove={(tierId) => tiersSet(tiers.filter((tier) => tier.id !== tierId))}
            projectName="happy-desktop"
            tiers={tiers}
        />
    );
}

export function FileTiersDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The tiers a project's Changes listing splits secondary files into: a name and glob patterns per tier, in match order. Edits apply as they are made, so the footer holds Add tier and Done and nothing to save."
            title="FileTiersDialog"
        >
            <Specimen
                detail="480px · no tiers yet · Add tier"
                label="Empty"
                number="01"
                stage="app"
            >
                {frame(
                    <FileTiersDialog {...handlers} projectName="happy-desktop" tiers={[]} />,
                    420,
                )}
            </Specimen>

            <Specimen
                detail="480px · three tiers in match order · each states what it claims in the open checkout"
                label="Configured"
                number="02"
                stage="app"
            >
                {frame(
                    <FileTiersDialog
                        {...handlers}
                        projectName="happy-desktop"
                        tiers={configured}
                    />,
                    640,
                )}
            </Specimen>

            <Specimen
                detail="480px · the project holds as many tiers as it may, so Add tier is withheld · no checkout to count against"
                label="Full"
                number="03"
                stage="app"
            >
                {frame(
                    <FileTiersDialog
                        {...handlers}
                        canAdd={false}
                        tiers={configured.map(({ count: _count, ...tier }) => tier)}
                    />,
                    640,
                )}
            </Specimen>

            <Specimen
                detail="Every control answers: rename, edit patterns, move, remove, add"
                label="Live"
                number="04"
                stage="app"
            >
                {frame(<LiveDialog />, 640)}
            </Specimen>
        </ComponentPage>
    );
}
