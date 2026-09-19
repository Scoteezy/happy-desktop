import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { BotFace, botFaceCredit } from "./BotFace";
import { Button } from "./Button";
import { TextField } from "./TextField";

/** One of the four faces on offer, by position. */
export type HappyAgentCreateBotFaceSlot = 0 | 1 | 2 | 3;

export type HappyAgentCreateBotPageProps = {
    /** The chosen name. Blank, the host names the bot from its first message. */
    name: string;
    /** The four face seeds on offer, in the order they stand. */
    faces: readonly [string, string, string, string];
    /** Which of the four the bot gets. Always one of them. */
    faceSlot: HappyAgentCreateBotFaceSlot;
    /** True while the bot is being made: the surface stays up and inert. */
    submitting?: boolean;
    /** A refused creation, stated here rather than thrown away. */
    error?: string;
    /** Why the bot cannot currently be made on its Happy Agent. */
    submitDisabledReason?: string;
    onNameChange: (name: string) => void;
    onFacePick: (slot: HappyAgentCreateBotFaceSlot) => void;
    onFacesRoll: () => void;
    /** Makes the bot without saying anything to it. */
    onSubmit: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** The size a face is offered at: big enough to have an expression, small enough for four. */
const FACE_SIZE = 56;

/**
 * C-238 HappyAgentCreateBotPage — what is decided about a bot before it exists,
 * standing in the body of the conversation it is about to become.
 *
 * It is reached from the "+" on the sidebar's Bots heading and rendered as the
 * empty content of a conversation view whose composer is the bot's own: the
 * first message is written down there, where every later one will be, and
 * sending it makes the bot on the way. This panel is everything else — the
 * face, with one already picked from the four on offer; the name, which may be
 * left blank for the host to give from that first message; and Create, for
 * making the bot without saying anything to it yet. Nothing here is required.
 *
 * The faces are drawn from a named artist's pack, and the credit sits under
 * them where the faces are, with the artist linked: a pack we chose because it
 * is hand-drawn should say so where it is seen.
 *
 * Props only, and every state is directly renderable: fresh, filled in, a
 * creation in flight, one the machine refused, and one whose Happy Agent is
 * away. The draft belongs to the caller, so navigating away and back keeps it.
 */
export function HappyAgentCreateBotPage(props: HappyAgentCreateBotPageProps) {
    const submitting = props.submitting === true;
    const submittable = !submitting && props.submitDisabledReason === undefined;
    const submit = () => {
        if (submittable) props.onSubmit();
    };
    return (
        <div
            className={["happy-agent-create-bot", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-create-bot"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <h1
                className="happy-agent-create-bot__title"
                data-happy-desktop-ui="happy-agent-create-bot-title"
            >
                New bot
            </h1>

            <div
                className="happy-agent-create-bot__faces"
                data-happy-desktop-ui="happy-agent-create-bot-faces"
            >
                {/* Four faces and the die that rolls four more. Picking is by
                    position: the ring stays where it was put through a roll,
                    wearing whatever face lands there. */}
                <div
                    aria-label="Face"
                    className="happy-agent-create-bot__face-row"
                    data-happy-desktop-ui="happy-agent-create-bot-face-row"
                    role="radiogroup"
                >
                    {props.faces.map((seed, index) => {
                        const slot = index as HappyAgentCreateBotFaceSlot;
                        const picked = slot === props.faceSlot;
                        return (
                            <button
                                aria-checked={picked}
                                className="happy-agent-create-bot__face"
                                data-happy-desktop-ui="happy-agent-create-bot-face"
                                data-picked={picked ? "" : undefined}
                                disabled={submitting}
                                key={slot}
                                onClick={() => props.onFacePick(slot)}
                                role="radio"
                                type="button"
                            >
                                <BotFace seed={seed} size={FACE_SIZE} />
                            </button>
                        );
                    })}
                </div>
                <Button
                    aria-label="Roll four new faces"
                    disabled={submitting}
                    icon="dice"
                    iconOnly
                    onClick={() => props.onFacesRoll()}
                    title="Roll four new faces"
                    variant="secondary"
                />
            </div>
            <p
                className="happy-agent-create-bot__credit"
                data-happy-desktop-ui="happy-agent-create-bot-credit"
            >
                {botFaceCredit.pack} by{" "}
                <a
                    className="happy-agent-create-bot__artist"
                    data-happy-desktop-ui="happy-agent-create-bot-artist"
                    href={botFaceCredit.artistUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    {botFaceCredit.artist}
                </a>
            </p>

            <div
                className="happy-agent-create-bot__name-row"
                data-happy-desktop-ui="happy-agent-create-bot-name-row"
            >
                <TextField
                    aria-label="Name"
                    className="happy-agent-create-bot__name"
                    data-testid="happy-agent-create-bot-name"
                    disabled={submitting}
                    onSubmit={submit}
                    onValueChange={props.onNameChange}
                    placeholder="Name, generated if left blank"
                    value={props.name}
                />
                {/* Makes the bot with nothing said to it yet. It stands beside
                    the name because that is the last thing decided up here;
                    the other way of making the bot is the send below. */}
                <Button
                    disabled={!submittable}
                    onClick={submit}
                    title={props.submitDisabledReason}
                    variant="secondary"
                >
                    {submitting ? "Creating…" : "Create"}
                </Button>
            </div>

            {props.submitDisabledReason ? (
                <p
                    className="happy-agent-create-bot__reason"
                    data-happy-desktop-ui="happy-agent-create-bot-reason"
                >
                    {props.submitDisabledReason}
                </p>
            ) : null}
            {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
        </div>
    );
}
