import { useState } from "react";
import {
    HappyAgentPasswordSettings,
    HappyAgentSettingsShell,
    type HappyAgentPasswordSettingsProps,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-012d";

const noop = () => {};

function PasswordSettingsSpecimen(props: {
    readonly label: string;
    readonly detail: string;
    readonly number: string;
    readonly screen?: string;
    readonly window?: { readonly width: number; readonly height: number };
    readonly settings?: Partial<HappyAgentPasswordSettingsProps>;
}) {
    // Blueprint interaction state only. The application supplies the store's draft.
    const [draft, draftSet] = useState(props.settings?.onePasswordAccountDraft ?? "");
    return (
        <FullScreenSpecimen
            detail={props.detail}
            label={props.label}
            number={props.number}
            screen={props.screen}
            window={props.window ?? { width: 720, height: 640 }}
        >
            <div style={{ display: "flex", contain: "layout paint" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="passwords"
                    categories={[
                        { id: "general", icon: "settings", label: "General" },
                        { id: "passwords", icon: "lock", label: "Passwords" },
                    ]}
                    description="Saved logins from your browsers and 1Password"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Passwords"
                >
                    <HappyAgentPasswordSettings
                        available
                        onePasswordAccount={null}
                        onePasswordInstall="installed"
                        onOnePasswordAccountDraftChange={draftSet}
                        onOnePasswordConnect={noop}
                        onOnePasswordDisconnect={noop}
                        {...props.settings}
                        onePasswordAccountDraft={draft}
                    />
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    );
}

export function HappyAgentPasswordSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The one-sentence promise about saved logins, and the 1Password connection."
            title="Passwords settings"
        >
            <PasswordSettingsSpecimen
                detail="1100 × 760 desktop window; 1Password installed, not connected"
                label="Not connected"
                number="01"
                screen="01-passwords-1100x760"
                window={{ width: 1100, height: 760 }}
            />
            <PasswordSettingsSpecimen
                detail="720 × 640 minimum desktop window"
                label="Not connected — minimum desktop"
                number="02"
                screen="01-passwords-720x640"
            />
            <PasswordSettingsSpecimen
                detail="An account name typed; Connect waits for 1Password's approval"
                label="Connecting"
                number="03"
                settings={{ onePasswordAccountDraft: "my.1password.com", pending: true }}
            />
            <PasswordSettingsSpecimen
                detail="The connected account and the way to disconnect it"
                label="Connected"
                number="04"
                screen="02-connected-1100x760"
                settings={{ onePasswordAccount: "my.1password.com" }}
                window={{ width: 1100, height: 760 }}
            />
            <PasswordSettingsSpecimen
                detail="1Password refused or was not set up; the account name stays for a retry"
                label="Connect failed"
                number="05"
                settings={{
                    onePasswordAccountDraft: "my.1password.com",
                    error: "1Password did not connect. In 1Password, turn on Settings › Developer › Integrate with other apps, check the account name, and approve Happy when asked.",
                }}
            />
            <PasswordSettingsSpecimen
                detail="Without the 1Password app there is nothing to connect"
                label="1Password not installed"
                number="06"
                settings={{ onePasswordInstall: "missing" }}
            />
            <PasswordSettingsSpecimen
                detail="A host that reads no saved logins still says what Happy never does"
                label="Unavailable"
                number="07"
                settings={{ available: false }}
            />
        </ComponentPage>
    );
}
