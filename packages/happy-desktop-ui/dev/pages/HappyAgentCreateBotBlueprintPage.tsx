import type { ComposerSnapshot } from "happy-desktop-state";
import type { ReactNode } from "react";
import { ComposerFooterBar } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { HappyAgentCreateBotPage } from "../../src/HappyAgentCreateBotPage";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-238";

/** The content region this surface is given in the 1280×800 design reference. */
const REGION = { height: "640px", width: "1000px" };
/** The same region in the 720×480 Electron minimum window, sidebar deducted. */
const MINIMUM_REGION = { height: "480px", width: "470px" };

/** Fixed seeds, so the four faces on the blueprint are the same four every time. */
const FACES = ["blueprint1", "blueprint2", "blueprint3", "blueprint4"] as const;

const noop = () => {};

const HANDLERS = {
    onFacePick: noop,
    onFacesRoll: noop,
    onNameChange: noop,
    onSubmit: noop,
} as const;

const TASK =
    "Watch the release branch. When CI goes green, draft the changelog from the merged pull requests and ask me before tagging.";

const screenshotPreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#1e1b4b"/><rect x="20" y="28" width="120" height="16" rx="4" fill="#a5b4fc"/><rect x="20" y="56" width="88" height="10" rx="3" fill="#6366f1"/><rect x="20" y="74" width="104" height="10" rx="3" fill="#6366f1"/><rect x="20" y="104" width="56" height="24" rx="6" fill="#22c55e"/></svg>',
)}`;

/**
 * What a first message can carry, exactly as a conversation's can: a small
 * image that travels inline, and a file placed in the bot's workspace.
 */
const ATTACHMENTS: ComposerSnapshot["attachments"] = [
    {
        kind: "inlineImage",
        id: "attachment:screenshot",
        name: "ci-dashboard.png",
        size: 412_902,
        mediaType: "image/png",
        file: new File([], "ci-dashboard.png", { type: "image/png" }),
        previewUrl: screenshotPreview,
    },
    {
        kind: "workspaceFile",
        id: "attachment:notes",
        name: "release-checklist.md",
        size: 6_210,
        mediaType: "text/markdown",
        file: new File([], "release-checklist.md", { type: "text/markdown" }),
    },
];

/** The bot's composer, holding whatever has been written into it and attached to it. */
function composerWith(
    text: string,
    attachments: ComposerSnapshot["attachments"] = [],
): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments,
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: "bot-create",
        submission: { status: "idle" },
        text,
    };
}

/** The surface fills the window's content region, so a specimen gives it one. */
function region(children: ReactNode, size: { height: string; width: string } = REGION) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                display: "flex",
                height: size.height,
                overflow: "hidden",
                width: size.width,
            }}
        >
            {children}
        </div>
    );
}

/**
 * The panel as the app shows it: the empty content of the conversation the bot
 * is about to become, over the composer that is already that conversation's.
 */
function inPlace(
    panel: ReactNode,
    text: string,
    submitDisabled = false,
    disabled = false,
    attachments: ComposerSnapshot["attachments"] = [],
) {
    return (
        <ConversationView
            composer={composerWith(text, attachments)}
            composerDisabled={disabled}
            composerFooterControl={<ComposerFooterBar note="Sending also creates the bot" />}
            composerPlaceholder="What should it work on?"
            composerSubmitDisabled={submitDisabled}
            emptyContent={panel}
            entries={[]}
            onComposerAttachmentRemove={noop}
            onComposerAttachmentsSelect={noop}
            onComposerSend={noop}
            onComposerValueChange={noop}
        />
    );
}

export function HappyAgentCreateBotBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What is decided about a bot before it exists — a face already picked, a name that may be left blank, Create — standing over the composer that will be the bot's own."
            title="HappyAgentCreateBotPage"
        >
            <Specimen
                detail="the panel gathers at the bottom of the empty body, flush with the composer · the first face is picked · the composer has the focus on arrival"
                label="Opened, in place"
                number="01"
                stage="app"
            >
                {region(
                    inPlace(
                        <HappyAgentCreateBotPage
                            {...HANDLERS}
                            faceSlot={0}
                            faces={FACES}
                            name=""
                        />,
                        "",
                    ),
                )}
                <DimensionRule label="chat measure 880px · faces 56px · name field 288px · panel bottom 12px above the dock" />
            </Specimen>
            <Specimen
                detail="another face picked · a name three or four words long · a task written in the composer with a screenshot and a file attached, as any conversation's can be · Enter sends and makes the bot, Create makes it and keeps the words and the files as the draft"
                label="Filled in, in place"
                number="02"
                stage="app"
            >
                {region(
                    inPlace(
                        <HappyAgentCreateBotPage
                            {...HANDLERS}
                            faceSlot={2}
                            faces={FACES}
                            name="Release helper"
                        />,
                        TASK,
                        false,
                        false,
                        ATTACHMENTS,
                    ),
                )}
            </Specimen>
            <Specimen
                detail="the bot is being made · every control is inert · and beside it, a creation the machine refused"
                label="Creating and refused"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {region(
                        inPlace(
                            <HappyAgentCreateBotPage
                                {...HANDLERS}
                                faceSlot={2}
                                faces={FACES}
                                name="Release helper"
                                submitting
                            />,
                            TASK,
                            false,
                            true,
                        ),
                        MINIMUM_REGION,
                    )}
                    {region(
                        inPlace(
                            <HappyAgentCreateBotPage
                                {...HANDLERS}
                                error="The bot's folder could not be created."
                                faceSlot={2}
                                faces={FACES}
                                name="Release helper"
                            />,
                            TASK,
                        ),
                        MINIMUM_REGION,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · faces, name and the composer stay editable · only making the bot is unavailable, and the panel says why"
                label="Happy Agent offline"
                number="04"
                stage="app"
            >
                {region(
                    inPlace(
                        <HappyAgentCreateBotPage
                            {...HANDLERS}
                            faceSlot={0}
                            faces={FACES}
                            name=""
                            submitDisabledReason="Happy Agent is offline. The draft is preserved."
                        />,
                        TASK,
                        true,
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
