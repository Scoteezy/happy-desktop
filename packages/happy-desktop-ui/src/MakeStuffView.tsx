import { Button } from "./Button";
import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import type { ConversationLeadingHeader } from "./ConversationView";
import type { IconName } from "./Icon";
import { controlLabelNaturalWidth, uiTextHeight } from "./messageTextLayout";
import { StemCellGrowth, type ImageMark } from "./StemCellGrowth";
import { WorkTranscript, type WorkTranscriptRow } from "./WorkTranscript";

export type MakeStuffStage =
    | {
          kind: "request";
          id: string;
          composer: ConversationDockProps;
      }
    | {
          kind: "context";
          rows: readonly WorkTranscriptRow[];
          composer: ConversationDockProps;
      };

export type MakeStuffViewProps = { stage: MakeStuffStage };

/** One kind of thing the new item can be made as directly, instead of described. */
export type MakeStuffOption = {
    id: string;
    icon: IconName;
    label: string;
};

export type MakeStuffIntroProps = {
    /** The new item's identity, so its stem cell is the one its row wears. */
    id: string;
    /**
     * The picture the item wears once it has one, at 64px; its stem cell until
     * then. A stem cell this intro is showing grows into the picture.
     */
    imageMark?: ImageMark;
    /**
     * The conversation has begun: only the mark is shown. Everything under it
     * keeps its place, hidden, so the block stays the size it was.
     */
    settled?: boolean;
    /** Things that can be made at once, offered under the line; the chat stays. */
    options?: readonly MakeStuffOption[];
    onOptionSelect?: (id: string) => void;
    /** Grow on a software rasteriser too. For the Blueprint and verification only. */
    softwareRendering?: boolean;
};

const INTRO_LINE = "Say what it is — it’ll find its place.";
const INTRO_OPTIONS_LINE = "Or start one of these:";
/** `.happy-make-stuff__empty`: 16px padding and 16px between the mark, the lines, and the options. */
const INTRO_INSET = 16;
const INTRO_MARK = 64;
/** `.happy-make-stuff__explanation`: 14/20 lines, 4px apart. */
const INTRO_LINE_HEIGHT = 20;
const INTRO_LINE_GAP = 4;
/** `.happy-make-stuff__options`: wraps at 480px, 8px across and between lines. */
const INTRO_OPTIONS_MEASURE = 480;
const INTRO_OPTIONS_GAP = 8;
/** A small Button with an icon: 10px padding and a 1px border per side, a 14px icon, 6px gap. */
const INTRO_OPTION_CHROME = 22 + 14 + 6;
const INTRO_OPTION_HEIGHT = 28;

/** The intro's height at a row `width`, from its own content, as the transcript's first row. */
export function makeStuffIntroHeight(
    props: Pick<MakeStuffIntroProps, "options">,
    width: number,
): number {
    const measure = Math.max(0, width - INTRO_INSET * 2);
    const options = props.options ?? [];
    let height = INTRO_INSET + INTRO_MARK + INTRO_INSET;
    height += uiTextHeight(INTRO_LINE, 14, INTRO_LINE_HEIGHT, measure);
    if (options.length === 0) return height + INTRO_INSET;
    height += INTRO_LINE_GAP + uiTextHeight(INTRO_OPTIONS_LINE, 14, INTRO_LINE_HEIGHT, measure);
    /* The options wrap as flex does: each joins the line while it fits. */
    const line = Math.min(INTRO_OPTIONS_MEASURE, measure);
    let lines = 0;
    let used = 0;
    for (const option of options) {
        const button = controlLabelNaturalWidth(option.label, 12, 700, 0.12) + INTRO_OPTION_CHROME;
        if (lines === 0 || used + INTRO_OPTIONS_GAP + button > line + 1 / 64) {
            lines += 1;
            used = button;
        } else used += INTRO_OPTIONS_GAP + button;
    }
    return (
        height +
        INTRO_INSET +
        lines * INTRO_OPTION_HEIGHT +
        (lines - 1) * INTRO_OPTIONS_GAP +
        INTRO_INSET
    );
}

/** The intro as a conversation's first row, which stays when the conversation begins. */
export function makeStuffIntroHeader(props: MakeStuffIntroProps): ConversationLeadingHeader {
    return {
        content: <MakeStuffIntro {...props} />,
        height: (width) => makeStuffIntroHeight(props, width),
    };
}

/**
 * C-302 — new work before its first message: its stem cell, one short line,
 * and the kinds of thing it can be made as straight away. Once the work has a
 * conversation, the same block opens its transcript with only the mark shown.
 */
export function MakeStuffIntro(props: MakeStuffIntroProps) {
    return (
        <div
            className="happy-make-stuff__empty"
            data-happy-desktop-ui="make-stuff-intro"
            data-settled={props.settled ? "" : undefined}
        >
            <StemCellGrowth
                imageClassName="happy-make-stuff__image-mark"
                size={64}
                {...(props.imageMark
                    ? { imageMark: props.imageMark }
                    : { stemCell: { id: props.id } })}
                {...(props.softwareRendering ? { softwareRendering: true } : {})}
            />
            <div className="happy-make-stuff__explanation">
                <p>{INTRO_LINE}</p>
                {props.options?.length ? <p>{INTRO_OPTIONS_LINE}</p> : null}
            </div>
            {props.options?.length ? (
                <div
                    className="happy-make-stuff__options"
                    data-happy-desktop-ui="make-stuff-options"
                >
                    {props.options.map((option) => (
                        <Button
                            icon={option.icon}
                            key={option.id}
                            onClick={() => props.onOptionSelect?.(option.id)}
                            size="small"
                            variant="secondary"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** One intent becomes work or an artifact after its context has been resolved. */
export function MakeStuffView({ stage }: MakeStuffViewProps) {
    if (stage.kind === "context")
        return <WorkTranscript rows={stage.rows} composer={stage.composer} />;
    return (
        <div className="happy-make-stuff" data-happy-desktop-ui="make-stuff" data-stage="request">
            <MakeStuffIntro id={stage.id} />
            <ConversationDock {...stage.composer} />
        </div>
    );
}
