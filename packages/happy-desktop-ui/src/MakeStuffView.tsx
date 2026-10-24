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
     * The conversation has begun: the mark stays where it was, its line keeps
     * its place hidden, and the kinds of thing to make give way to the first
     * message, which lands where they began.
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
/** `.happy-make-stuff__empty`: 16px padding, and 16px between the mark, its line, and the options. */
const INTRO_INSET = 16;
const INTRO_MARK = 64;
/** `.happy-make-stuff__line` and the options' caption: 14/20, the caption 4px under the line. */
const INTRO_LINE_HEIGHT = 20;
const INTRO_CAPTION_GAP = 4;
/** `.happy-make-stuff__options`: wraps at 480px, 8px across and between lines. */
const INTRO_OPTIONS_MEASURE = 480;
const INTRO_OPTIONS_GAP = 8;
/** A small Button with an icon: 10px padding and a 1px border per side, a 14px icon, 6px gap. */
const INTRO_OPTION_CHROME = 22 + 14 + 6;
const INTRO_OPTION_HEIGHT = 28;

/**
 * Where the options begin, from the intro's top: under the mark and its line.
 * The intro rests with this line at the height a send is lifted to, and the
 * first message takes the options' place on it.
 */
export function makeStuffIntroLift(width: number): number {
    const measure = Math.max(0, width - INTRO_INSET * 2);
    return (
        INTRO_INSET +
        INTRO_MARK +
        INTRO_INSET +
        uiTextHeight(INTRO_LINE, 14, INTRO_LINE_HEIGHT, measure)
    );
}

/** The intro's height at a row `width`, from its own content, as the transcript's first row. */
export function makeStuffIntroHeight(
    props: Pick<MakeStuffIntroProps, "options" | "settled">,
    width: number,
): number {
    const lift = makeStuffIntroLift(width);
    if (props.settled) return lift;
    const options = props.options ?? [];
    if (options.length === 0) return lift + INTRO_INSET;
    const measure = Math.max(0, width - INTRO_INSET * 2);
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
        lift +
        INTRO_CAPTION_GAP +
        uiTextHeight(INTRO_OPTIONS_LINE, 14, INTRO_LINE_HEIGHT, measure) +
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
        lift: makeStuffIntroLift,
    };
}

/**
 * C-302 — new work before its first message: its stem cell, one short line,
 * and the kinds of thing it can be made as straight away. Once the work has a
 * conversation, the same block opens its transcript: the mark stays, and the
 * first message takes the options' place.
 */
export function MakeStuffIntro(props: MakeStuffIntroProps) {
    const options = props.settled ? [] : (props.options ?? []);
    return (
        <div
            className="happy-make-stuff__empty"
            data-happy-desktop-ui="make-stuff-intro"
            data-settled={props.settled ? "" : undefined}
        >
            <div className="happy-make-stuff__lead">
                <StemCellGrowth
                    imageClassName="happy-make-stuff__image-mark"
                    size={64}
                    {...(props.imageMark
                        ? { imageMark: props.imageMark }
                        : { stemCell: { id: props.id } })}
                    {...(props.softwareRendering ? { softwareRendering: true } : {})}
                />
                <p className="happy-make-stuff__line">{INTRO_LINE}</p>
            </div>
            {options.length > 0 ? (
                <div className="happy-make-stuff__offer" data-happy-desktop-ui="make-stuff-offer">
                    <p className="happy-make-stuff__caption">{INTRO_OPTIONS_LINE}</p>
                    <div
                        className="happy-make-stuff__options"
                        data-happy-desktop-ui="make-stuff-options"
                    >
                        {options.map((option) => (
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
