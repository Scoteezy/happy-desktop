import { FileTreeFamilyIcon } from "../../src/FileTree";
import { ArtifactTypeGlyph } from "../../src/pages/artifacts/artifactPresentation";
import { ResultCard } from "../../src/ResultCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-291";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
};

export function ResultCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One thing an agent produced — a published artifact, a presented document, any other file — as a full-width card the reader opens."
            title="ResultCard"
        >
            <Specimen
                detail="64px high · 40px kind chip · title 14/600 · detail 12 · trailing chevron"
                label="Artifacts"
                number="01"
                stage="surface"
            >
                <div style={{ ...column, width: "560px" }}>
                    <ResultCard
                        detail="Web page · Version 1"
                        glyph={<ArtifactTypeGlyph size={20} type="html" />}
                        onOpen={() => {}}
                        title="Relay flagship landing page"
                    />
                    <ResultCard
                        detail="Document · Version 4"
                        glyph={<ArtifactTypeGlyph size={20} type="document" />}
                        onOpen={() => {}}
                        title="Q3 launch readiness review"
                    />
                    <ResultCard
                        detail="Image series · Version 2"
                        glyph={<ArtifactTypeGlyph size={20} type="image_series" />}
                        title="Deleted moodboard (not openable)"
                    />
                    <DimensionRule label="full width of its column · the whole card is one button" />
                </div>
            </Specimen>
            <Specimen
                detail="colourful file-family glyph · type and size"
                label="Presented files"
                number="02"
                stage="surface"
            >
                <div style={{ ...column, width: "560px" }}>
                    <ResultCard
                        detail="PDF · 1.7 MB"
                        glyph={
                            <span className="happy-file-family-glyph" data-family="prose">
                                <FileTreeFamilyIcon family="prose" size={20} />
                            </span>
                        }
                        onOpen={() => {}}
                        title="Q3 launch readiness review.pdf"
                    />
                    <ResultCard
                        detail="File · 40.2 MB"
                        glyph={
                            <span className="happy-file-family-glyph" data-family="archive">
                                <FileTreeFamilyIcon family="archive" size={20} />
                            </span>
                        }
                        onOpen={() => {}}
                        title="release-assets.zip"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="a long title truncates; the detail line never wraps"
                label="Truncation"
                number="03"
                stage="surface"
            >
                <div style={{ ...column, width: "320px" }}>
                    <ResultCard
                        detail="Markdown · Version 12"
                        glyph={<ArtifactTypeGlyph size={20} type="markdown" />}
                        onOpen={() => {}}
                        title="Mobile launch readiness review — final FINAL v2 with appendix"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
