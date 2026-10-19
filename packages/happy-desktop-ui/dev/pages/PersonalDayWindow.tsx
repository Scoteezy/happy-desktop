import { useState } from "react";
import { ConnectionShell } from "../../src/ConnectionShell";
import { MakeStuffView } from "../../src/MakeStuffView";
import { MarkdownDocument } from "../../src/MarkdownDocument";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { WorkTranscript, type WorkTranscriptRow } from "../../src/WorkTranscript";
import { PersonalDayShell } from "./PersonalDayShell";
import { dayCoordination, dayPairingAnswer } from "./dayCoordination";
import {
    dayAfterBatch,
    dayFocus,
    dayHappyImage,
    dayPerson,
    dayWaiting,
    dayWork,
    dayWorkIdIs,
    type DayFrame,
    type DayWorkId,
} from "./personalDayFixtures";
import { redesignComposer, redesignConnections } from "./windowRedesignFixtures";

const noop = () => undefined;
const taskCopy: Partial<Record<DayWorkId, { request: string; reply: string }>> = {
    viewer: {
        request: "Check the preview viewer before we move on.",
        reply: "I'm working through the viewer pass.",
    },
    credentials: {
        request: "Keep credential attachment explicit at the boundary.",
        reply: "I'm checking which credentials the provider needs and where that attachment is declared.",
    },
    resize: {
        request: "Check what happens when the artifact is resized.",
        reply: "The resize probe is ready to inspect.",
    },
    redesign: {
        request: "Check the sidebar at its normal desktop width.",
        reply: "Work rows are 32 px. Long titles truncate before their status.",
    },
    port: {
        request: "Replicate onboarding end to end and finish the native settings pages.",
        reply: "I'm continuing the UIKit onboarding and settings pages.",
    },
    keyboard: {
        request: "Investigate the keyboard drag delay and compare it with Telegram.",
        reply: "I haven't confirmed the cause of the drag delay.",
    },
    connector: {
        request: "Use the new Tailcat pairing API in the native connector.",
        reply: "",
    },
};

export function PersonalDayWindow({ frame }: { frame: DayFrame }) {
    const person = dayPerson(frame);
    const initialFocus = dayFocus(frame);
    const [space, setSpace] = useState(frame === "browse" ? ("steve" as const) : person);
    const [selected, setSelected] = useState<string>(dayFocus(frame));
    const [taskTab, setTaskTab] = useState<DayWorkId>(
        dayWorkIdIs(initialFocus) ? initialFocus : person === "steve" ? "port" : "redesign",
    );
    const [draft, setDraft] = useState(
        frame === "browse" || frame === "return" ? "Keep the sidebar steady while I work." : "",
    );
    const [pairingReply, setPairingReply] = useState<string | null>(
        frame === "reply" ? dayPairingAnswer : null,
    );
    const pairingResolved = pairingReply !== null || !dayWaiting(frame);
    const open = (id: string) => {
        if (dayWorkIdIs(id)) setTaskTab(id);
        setSelected(id);
    };
    const happyMessage = (id: string, text: string): WorkTranscriptRow => ({
        id,
        kind: "message",
        author: "Happy",
        imageMark: dayHappyImage,
        text,
    });
    const coordination = dayCoordination(pairingResolved, () => open("backend"));
    const replyRows: WorkTranscriptRow[] =
        pairingReply === null
            ? []
            : [
                  {
                      id: "pairing-answer",
                      kind: "message",
                      author: "Kirill",
                      own: true,
                      text: pairingReply,
                  },
              ];
    const happyRows: WorkTranscriptRow[] = [
        happyMessage(
            "initial-batch",
            person === "kirill"
                ? "Grouped your desktop and agent work; Steve's native work is folded below."
                : "Kept native work first and folded Kirill's desktop and agent work below.",
        ),
        ...(dayAfterBatch(frame)
            ? [happyMessage("finished-batch", "Moved Preview viewer release to Older.")]
            : []),
        ...(dayWaiting(frame) || frame === "reply" ? [coordination, ...replyRows] : []),
    ];
    const source = dayWorkIdIs(selected) ? dayWork[selected] : undefined;
    const copy = dayWorkIdIs(selected) ? taskCopy[selected] : undefined;
    const taskRows: WorkTranscriptRow[] = copy
        ? [
              {
                  id: "request",
                  kind: "message",
                  author: source?.owner === "steve" ? "Steve" : "Kirill",
                  own: true,
                  text: copy.request,
              },
              ...(selected === "connector"
                  ? [coordination, ...replyRows]
                  : [happyMessage("progress", copy.reply)]),
          ]
        : [happyMessage("context", "Ready to continue.")];
    const composer = {
        composer: { ...redesignComposer, text: draft },
        onComposerValueChange: setDraft,
        onComposerSend: () => {
            if (!draft.trim()) return;
            if (
                person === "kirill" &&
                !pairingResolved &&
                (selected === "happy" || selected === "connector")
            )
                setPairingReply(draft.trim());
            setDraft("");
        },
        composerPlaceholder:
            selected === "happy" ? "Message Happy…" : `Message ${source?.label ?? "Happy"}…`,
        composerFocusOnType: false,
    };
    const content =
        selected === "new" ? (
            <MakeStuffView
                stage={{
                    kind: "request",
                    id: `new-${person}-work`,
                    placement: "automatic",
                    composer,
                }}
            />
        ) : selected === "plans" ? (
            <MarkdownDocument
                text={
                    "# Desktop delivery notes\n\n## Sidebar\n\nUse 280 px at the default width, with 32 px work rows. Check long titles and trailing status at the minimum width.\n\n## Rendering\n\nCapture Chromium, Firefox and WebKit at desktop sizes. Check text, icon geometry and focus retention."
                }
            />
        ) : selected === "ultralist" ? (
            <MarkdownDocument
                text={
                    "# UltraList engine docs\n\n## Keyboard and content movement\n\nCompare keyboard movement and list behavior with Telegram. The drag delay remains unconfirmed.\n\n## UIKit integration\n\nCheck content offsets during interactive dismissal and restore the visible item anchor after the transition."
                }
            />
        ) : selected === "native" ? (
            <MarkdownDocument
                text={
                    "# iOS & UltraView\n\nB1 remains blocked: 58 regressions against clean main.\n\nThe fallback fix is verified but unshipped. The cause of the keyboard drag delay is still unconfirmed."
                }
            />
        ) : (
            <WorkTranscript
                rows={selected === "happy" ? happyRows : taskRows}
                composer={composer}
            />
        );
    return (
        <ThemeScope mode="light">
            <div
                style={{
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    contain: "layout paint",
                }}
            >
                <ConnectionShell
                    items={redesignConnections}
                    selectedId={person === "kirill" ? "kirill-mac" : "steve"}
                    onSelect={noop}
                    windowControls
                    windowFullScreen
                >
                    <PersonalDayShell
                        connectionRail
                        frame={frame}
                        activeId={selected}
                        space={space}
                        pairingResolved={pairingResolved}
                        onSpaceChange={setSpace}
                        onSelect={open}
                        onOrganize={(label) => {
                            open("happy");
                            setDraft(`Organize ${label} with its related work.`);
                        }}
                    >
                        <TabbedPane
                            tabs={[
                                { id: "happy", label: "Happy", imageMark: dayHappyImage },
                                {
                                    id: taskTab,
                                    label: dayWork[taskTab].label,
                                    imageMark: { src: dayWork[taskTab].image },
                                },
                                ...(selected === "new" ? [{ id: "new", label: "New" }] : []),
                            ]}
                            activeId={selected}
                            onSelect={open}
                            tabSizing="content"
                            overflowFade
                            size="medium"
                        >
                            {content}
                        </TabbedPane>
                    </PersonalDayShell>
                </ConnectionShell>
            </div>
        </ThemeScope>
    );
}
