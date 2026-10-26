import { useState } from "react";
import {
    HappyAgentPasswordSettings,
    HappyAgentSettingsShell,
    type HappyAgentPasswordImportProposal,
    type HappyAgentPasswordLogin,
    type HappyAgentPasswordSettingsProps,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-012d";

// Deliberately metadata only: no password field or value exists in these fixtures.
const logins: readonly HappyAgentPasswordLogin[] = [
    {
        id: "docs-personal",
        origin: "https://docs.example.com",
        username: "alex@example.com",
        updatedAt: "18 June 2026, 10:24",
    },
    {
        id: "docs-work",
        origin: "https://docs.example.com",
        username: "alex@work.example",
        updatedAt: "17 June 2026, 14:08",
    },
    {
        id: "studio",
        origin: "https://studio.example.org:8443",
        username: "alex",
        updatedAt: "16 June 2026, 09:40",
    },
    {
        id: "no-username",
        origin: "https://account.example.net",
        username: "",
        updatedAt: "15 June 2026, 12:12",
    },
];

const proposal: HappyAgentPasswordImportProposal = {
    sites: [
        {
            origin: "https://docs.example.com",
            usernames: ["alex@example.com", "alex@work.example"],
            count: 2,
        },
        { origin: "https://studio.example.org:8443", usernames: ["alex"], count: 1 },
        { origin: "https://account.example.net", usernames: [], count: 1 },
    ],
    skipped: 5,
};

const largeLogins: readonly HappyAgentPasswordLogin[] = Array.from(
    { length: 4000 },
    (_, index) => ({
        id: `metadata-${String(index)}`,
        origin: `https://site-${String(index)}.example.com`,
        username: `account-${String(index)}@example.com`,
        updatedAt: "18 June 2026, 10:24",
    }),
);

const largeProposal: HappyAgentPasswordImportProposal = {
    sites: largeLogins.map((login) => ({
        origin: login.origin,
        usernames: [login.username],
        count: 1,
    })),
    skipped: 12,
};

const noop = () => {};

function PasswordSettingsSpecimen(props: {
    readonly label: string;
    readonly detail: string;
    readonly number: string;
    readonly screen?: string;
    readonly window?: { readonly width: number; readonly height: number };
    readonly settings?: Partial<HappyAgentPasswordSettingsProps>;
}) {
    // Blueprint interaction state only. The application supplies store-owned selection.
    const [selection, selectionSet] = useState<ReadonlySet<string>>(
        props.settings?.selectedOrigins ?? new Set(),
    );
    const [importOpen, importOpenSet] = useState(props.settings?.proposal !== undefined);
    return (
        <FullScreenSpecimen
            detail={props.detail}
            label={props.label}
            number={props.number}
            screen={props.screen}
            window={props.window ?? { width: 720, height: 640 }}
        >
            {/* Layout containment gives fixed overlays this specimen's desktop
                viewport, so every fixture keeps its own modal and scrim. */}
            <div style={{ display: "flex", contain: "layout paint" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="passwords"
                    categories={[
                        { id: "general", icon: "settings", label: "General" },
                        { id: "passwords", icon: "lock", label: "Passwords" },
                    ]}
                    description="Your encrypted vault on this device"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Passwords"
                >
                    <HappyAgentPasswordSettings
                        available
                        logins={logins}
                        onBrowserImportChoose={noop}
                        onImportCancel={() => importOpenSet(false)}
                        onImportChoose={() => {
                            selectionSet(new Set());
                            importOpenSet(true);
                        }}
                        onImportCommit={noop}
                        onImportSiteSelect={(origin, selected) =>
                            selectionSet((current) => {
                                const next = new Set(current);
                                if (selected) next.add(origin);
                                else next.delete(origin);
                                return next;
                            })
                        }
                        onLoginRemove={noop}
                        onLoginReveal={noop}
                        {...props.settings}
                        proposal={importOpen ? (props.settings?.proposal ?? proposal) : undefined}
                        selectedOrigins={selection}
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
            summary="Metadata-only password management, native reveal, and explicit per-site import; virtualized lists at desktop sizes."
            title="Passwords settings"
        >
            <PasswordSettingsSpecimen
                detail="1100 × 760 desktop window; origin, username, timestamp, native reveal, and remove"
                label="Saved login metadata"
                number="01"
                screen="01-passwords-1100x760"
                window={{ width: 1100, height: 760 }}
            />
            <PasswordSettingsSpecimen
                detail="720 × 640 minimum desktop window; one device vault shared across networks"
                label="Saved logins — minimum desktop"
                number="02"
                screen="01-passwords-720x640"
            />
            <PasswordSettingsSpecimen
                detail="Import remains available with an empty vault"
                label="Empty vault"
                number="03"
                settings={{ logins: [] }}
            />
            <PasswordSettingsSpecimen
                detail="Reading metadata disables secure actions without replacing existing row identities"
                label="Loading"
                number="04"
                settings={{ loading: true, logins: [] }}
            />
            <PasswordSettingsSpecimen
                detail="Native authentication or a secure write is underway; duplicate actions are disabled"
                label="Pending secure action"
                number="05"
                settings={{ pending: true }}
            />
            <PasswordSettingsSpecimen
                detail="Failure remains visible alongside saved metadata"
                label="Vault action error"
                number="06"
                settings={{ error: "Touch ID was cancelled. Your saved logins are unchanged." }}
            />
            <PasswordSettingsSpecimen
                detail="Native desktop availability on macOS and Windows with an explicit Windows Chrome CSV explanation"
                label="Desktop vault unavailable"
                number="07"
                settings={{ available: false, logins: [] }}
            />
            <PasswordSettingsSpecimen
                detail="640 px modal at 1100 × 760; nothing is selected by default"
                label="Import — desktop window"
                number="08a"
                screen="02-import-1100x760"
                window={{ width: 1100, height: 760 }}
                settings={{ proposal }}
            />
            <PasswordSettingsSpecimen
                detail="640 px modal; no sites preselected and import disabled until the person chooses"
                label="Import — minimum window"
                number="08b"
                screen="02-import-720x640"
                settings={{ proposal }}
            />
            <PasswordSettingsSpecimen
                detail="Explicit commit names the login count; selected sites, excluded sites, and skipped entries stay visible"
                label="Import — selected site"
                number="09"
                settings={{ proposal, selectedOrigins: new Set([proposal.sites[0]!.origin]) }}
            />
            <PasswordSettingsSpecimen
                detail="A pending commit locks site selection and dismissal"
                label="Import — pending"
                number="10"
                settings={{
                    proposal,
                    selectedOrigins: new Set([proposal.sites[0]!.origin]),
                    pending: true,
                }}
            />
            <PasswordSettingsSpecimen
                detail="Selection remains intact when the import fails"
                label="Import — error"
                number="11"
                settings={{
                    proposal,
                    selectedOrigins: new Set([proposal.sites[0]!.origin]),
                    error: "The source browser could not be unlocked. Try importing again.",
                }}
            />
            <PasswordSettingsSpecimen
                detail="Unsupported records are counted; an empty proposal cannot be committed"
                label="Import — no supported sites"
                number="12"
                settings={{ proposal: { sites: [], skipped: 7 } }}
            />
            <PasswordSettingsSpecimen
                detail="360 px shared confirmation dialog; no password is rendered"
                label="Remove login confirmation"
                number="13"
                settings={{ initialRemoveLoginId: logins[0]!.id }}
            />
            <PasswordSettingsSpecimen
                detail="4,000 metadata entries use a bounded mounted row count; arrow keys, Home, and End navigate the list"
                label="Large vault"
                number="14"
                settings={{ logins: largeLogins }}
            />
            <PasswordSettingsSpecimen
                detail="4,000 candidate sites remain virtualized and start unselected"
                label="Large import proposal"
                number="15"
                settings={{ proposal: largeProposal }}
            />
            <PasswordSettingsSpecimen
                detail="Unbounded account metadata truncates with full text in its title; controls remain whole"
                label="Long metadata"
                number="16"
                settings={{
                    logins: [
                        {
                            id: "long-metadata",
                            origin: "https://a-very-long-workspace-hostname.enterprise.example.com:8443",
                            username: "alexandra.long-account-name+workspace@example.com",
                            updatedAt: "18 June 2026, 10:24",
                        },
                    ],
                }}
            />
        </ComponentPage>
    );
}
