import { type ReactNode } from "react";
import type { HappyReference } from "happy-desktop-state";
import { Message } from "../../src/Message";
import type { MessageReferences, MessageReferenceView } from "../../src/messageReferences";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};

/** What each fixture id reads as; anything else is unknown to this surface. */
const VIEWS: ReadonlyMap<string, MessageReferenceView> = new Map([
    ["artifact:q3report", { type: "link", label: "Q3 revenue report", busy: false }],
    [
        "artifact:longtitle",
        {
            type: "link",
            label: "Migration plan for moving every desktop surface onto the realtime difference APIs",
            busy: false,
        },
    ],
    ["artifact:gone", { type: "text", label: "Old onboarding deck" }],
    ["agent:builder", { type: "link", label: "Release build", busy: true }],
    ["service:preview", { type: "link", label: "Blueprint preview", busy: true }],
    ["workspace:quiet", { type: "link", label: "happy-references", busy: false }],
]);

const references: MessageReferences = {
    view(reference: HappyReference) {
        return (
            VIEWS.get(`${reference.kind}:${reference.id}`) ?? {
                type: "text",
                label:
                    reference.kind === "artifact" || reference.kind === "agent"
                        ? `an unavailable ${reference.kind}`
                        : "an unavailable reference",
            }
        );
    },
    open: () => undefined,
};

function channelFrame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: "680px",
            }}
        >
            {children}
        </div>
    );
}

function agentReply(body: string, streaming = false) {
    return (
        <Message
            agent
            author="Happy"
            body={body}
            {...(streaming ? { generationStatus: "streaming" as const } : {})}
            initials="HA"
            references={references}
            time="10:51"
            tone="mint"
        />
    );
}

export function MessageReferencesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Happy references an agent writes as <happy-KIND id/> tags, read as underlined links titled with the live name of what they point at. A busy target carries the shimmer band; anything that cannot be opened is plain words; a tag still arriving never shows."
            title="Message references"
        >
            <Specimen
                detail="The same underline and colour as every Markdown link · inline, alone on a line, and pinned to a version (still the current title; the pin only decides what opens)"
                label="Idle references"
                number="01"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        agentReply(
                            [
                                'I published <happy-artifact id="q3report"/> with the numbers you asked for.',
                                "",
                                '<happy-artifact id="q3report" version="2"/>',
                                "",
                                'The longer one wraps like prose: <happy-artifact id="longtitle"/>, and the checkout is <happy-workspace id="quiet"/>.',
                            ].join("\n"),
                        ),
                    )}
                    <DimensionRule label="16/24 body · underline in --text · no chip, no card" />
                </div>
            </Specimen>
            <Specimen
                detail="An agent working and a service running · ShimmerText sheen, inherit tone, inline"
                label="Busy references"
                number="02"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        'Handed the packaging to <happy-agent id="builder"/>; you can watch it in <happy-service id="preview"/> meanwhile.',
                    ),
                )}
            </Specimen>
            <Specimen
                detail="Deleted, missing, not visible, and unknown kinds read as plain text and never as the raw tag"
                label="Unavailable references"
                number="03"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        '<happy-artifact id="gone"/> was deleted, <happy-artifact id="missing"/> never existed, and <happy-gizmo id="x1"/> is a kind this build does not know.',
                    ),
                )}
            </Specimen>
            <Specimen
                detail="A tag that has only partly arrived is held back until it completes"
                label="Streaming"
                number="04"
                stage="app"
            >
                {channelFrame(agentReply("Here is the report: <happy-arti", true))}
            </Specimen>
            <Specimen
                detail="Tags inside inline code and fenced code stay literal"
                label="Code stays code"
                number="05"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        [
                            'Write `<happy-artifact id="q3report"/>` to link it:',
                            "",
                            "```md",
                            '<happy-artifact id="q3report"/>',
                            "```",
                        ].join("\n"),
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
