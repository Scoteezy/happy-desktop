import { DataDisclosure, type DataDisclosureGroup } from "../../DataDisclosure";
import { FormRow } from "../../FormRow";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** What product analytics sends and, above all, what it never sends. */
const PRODUCT_ANALYTICS_DISCLOSURE: readonly DataDisclosureGroup[] = [
    {
        kind: "shared",
        title: "Examples of what we send",
        items: [
            "Happy opened, and how many times",
            "Which setup step you reached, and which subscriptions are signed in",
            "A conversation, project, workspace, or bot was created",
            "A message was sent, with its model and effort level, and whether it went to a bot or a subtask",
            "A one-way code that tells two accounts of one provider apart, never the account itself",
            "App and Happy Agent versions, and the operating system",
        ],
    },
    {
        kind: "withheld",
        title: "What we never send",
        items: [
            "Your messages, prompts, or anything an agent writes",
            "Files, file paths, or folder names",
            "Project, repository, branch, workspace, or bot names",
            "Your name, email address, or computer name",
            "Screen recordings, clicks, keystrokes, or page addresses",
        ],
    },
];

export interface HappyAgentProductAnalyticsSettingsProps {
    readonly enabled: boolean;
    readonly onChange: (enabled: boolean) => void;
}

/**
 * The switch for anonymous product analytics, with what it sends beside what
 * it never sends, so the choice is made knowing both.
 */
export function HappyAgentProductAnalyticsSettings(props: HappyAgentProductAnalyticsSettingsProps) {
    return (
        <HappyAgentSettingsSection title="Privacy">
            <FormRow
                control={
                    <Switch
                        aria-label="Share anonymous product analytics"
                        checked={props.enabled}
                        id="happy-agent-settings-product-analytics"
                        onChange={props.onChange}
                        size="small"
                    />
                }
                description="Helps us see where setup gets stuck and which features people use. Events are tied to a random ID for this installation, not to you, and we don't use your IP address or location."
                htmlFor="happy-agent-settings-product-analytics"
                label="Share anonymous product analytics"
            />
            <DataDisclosure
                data-testid="happy-agent-settings-product-analytics-disclosure"
                groups={PRODUCT_ANALYTICS_DISCLOSURE}
            />
        </HappyAgentSettingsSection>
    );
}
