import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, win32 } from "node:path";
import type { Client, ItemOverview, VaultOverview } from "@1password/sdk";
import {
    browserLoginRelation,
    BrowserLoginUseError,
    type BrowserLoginCandidate,
    type BrowserLoginSaveTarget,
    type BrowserLoginSecret,
    type BrowserLoginSource,
    type BrowserLoginSourceList,
} from "./browserLoginSources";
import {
    browserLoginLibraryTrustRequire,
    type BrowserLoginLibraryPublisher,
} from "./browserLoginLibraryTrust";
import { browserLoginOriginNormalize } from "./browserLoginProfiles";

/**
 * AgileBits Inc., which signs 1Password: Apple Team ID 2BUA8C4S2C, as its
 * installer's Developer ID shows, and `Agilebits` on Windows, where it signs
 * through Microsoft Trusted Signing.
 */
const agileBits: BrowserLoginLibraryPublisher = {
    refusal:
        "Happy could not verify that 1Password is AgileBits' own install. Reinstall 1Password from 1password.com and try again.",
    appleTeamId: "2BUA8C4S2C",
    appleIdentifiers: { bundle: "com.1password.1password", library: "libop_sdk_ipc_client" },
    macBundle: (library) => (library === macLibrary ? macBundle : null),
    windowsOrganizations: ["Agilebits", "AgileBits Inc."],
    windowsLocation: (library, programFiles) =>
        programFiles.some((root) => library.toLowerCase() === windowsLibrary(root).toLowerCase()),
};

const macBundle = "/Applications/1Password.app";
const macLibrary = `${macBundle}/Contents/Frameworks/libop_sdk_ipc_client.dylib`;

function windowsLibrary(programFiles: string): string {
    return win32.join(programFiles, "1Password", "app", "8", "op_sdk_ipc_client.dll");
}

/**
 * The one place Happy loads 1Password's SDK library from: the system-wide
 * desktop app. The SDK would also search the person's own folders, where any
 * program could leave a library; Happy hands it this path only after the
 * signature check, and the patched SDK loads nothing else.
 */
function libraryPath(): string | null {
    switch (process.platform) {
        case "darwin":
            return macLibrary;
        case "win32":
            return process.env.ProgramFiles ? windowsLibrary(process.env.ProgramFiles) : null;
        default:
            return null;
    }
}

interface VaultItems {
    readonly contentVersion: number;
    readonly logins: readonly ItemOverview[];
}

/**
 * The person's 1Password, through its desktop app (`DesktopAuth`): 1Password
 * asks them to approve Happy, and holds every password. Happy keeps only the
 * account name it was told to use. The SDK is loaded and the app contacted
 * only on demand — when the person connects, opens the picker, or is offered
 * a save — never at startup.
 */
export class BrowserLoginOnePassword implements BrowserLoginSource, BrowserLoginSaveTarget {
    readonly label = "1Password";
    private account: string | null = null;
    private client: Promise<Client> | null = null;
    private readonly vaultItems = new Map<string, VaultItems>();

    constructor(
        private readonly options: {
            /** Holds `{ "account": string }` only: never an item, token, or password. */
            readonly path: string;
            readonly integrationVersion: string;
        },
    ) {}

    async load(): Promise<void> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.options.path, "utf8"));
            if (
                typeof parsed === "object" &&
                parsed !== null &&
                "account" in parsed &&
                typeof parsed.account === "string" &&
                accountValid(parsed.account)
            )
                this.account = parsed.account;
        } catch {
            this.account = null;
        }
    }

    installed(): boolean {
        const path = libraryPath();
        return path !== null && existsSync(path);
    }

    accountGet(): string | null {
        return this.account;
    }

    connected(): boolean {
        return this.account !== null && this.installed();
    }

    /** 1Password asks the person to approve Happy; their approval is the connection. */
    async connect(account: string): Promise<void> {
        const name = account.trim();
        if (!accountValid(name)) throw new Error("Enter your 1Password account name.");
        if (!this.installed())
            throw new Error("Install the 1Password app and sign in to it, then connect again.");
        const library = libraryPath()!;
        await browserLoginLibraryTrustRequire(library, agileBits);
        const client = this.clientCreate(name);
        try {
            await (await client).vaults.list();
        } catch {
            throw new Error(
                "1Password did not connect. In 1Password, turn on Settings › Developer › Integrate with other apps, check the account name, and approve Happy when asked.",
            );
        }
        this.account = name;
        this.client = client;
        this.vaultItems.clear();
        await this.persist();
    }

    async disconnect(): Promise<void> {
        this.account = null;
        this.client = null;
        this.vaultItems.clear();
        await this.persist();
    }

    async list(pageOrigin: string): Promise<BrowserLoginSourceList> {
        if (!this.connected()) return { candidates: [] };
        const candidates: BrowserLoginCandidate[] = [];
        for (const item of await this.logins()) {
            const match = itemMatch(item, pageOrigin);
            if (!match) continue;
            candidates.push({
                origin: match.origin,
                relation: match.relation,
                // An item overview carries no account name; reading one would
                // decrypt the whole item, so the picker shows its title.
                name: item.title || "1Password login",
                nameIsUsername: false,
                source: "1Password",
                use: (field, _window, deliver) =>
                    this.use(item, match.origin, field, deliver).catch((error: unknown) => {
                        throw error instanceof BrowserLoginUseError
                            ? error
                            : new BrowserLoginUseError("1Password did not return this login.");
                    }),
            });
        }
        return { candidates };
    }

    /**
     * Whether 1Password already keeps this login. Item overviews carry no
     * account name, so only a single item for exactly this origin is opened
     * to compare it. With several, none is opened and the save is offered.
     */
    async has(origin: string, username: string): Promise<boolean> {
        const exact = (await this.logins()).filter(
            (item) => itemMatch(item, origin)?.relation === "exact",
        );
        if (exact.length !== 1) return false;
        const client = await this.clientGet();
        const item = await client.items.get(exact[0]!.vaultId, exact[0]!.id);
        return field(item.fields, "username") === username;
    }

    async save(login: { origin: string; username: string; password: string }): Promise<void> {
        const sdk = await import("@1password/sdk");
        const client = await this.clientGet();
        const vaults = await client.vaults.list();
        const vault = vaults.find((each) => each.vaultType === sdk.VaultType.Personal) ?? vaults[0];
        if (!vault) throw new Error("1Password has no vault to save into.");
        await client.items.create({
            category: sdk.ItemCategory.Login,
            vaultId: vault.id,
            title: new URL(login.origin).hostname,
            fields: [
                {
                    id: "username",
                    title: "username",
                    fieldType: sdk.ItemFieldType.Text,
                    value: login.username,
                },
                {
                    id: "password",
                    title: "password",
                    fieldType: sdk.ItemFieldType.Concealed,
                    value: login.password,
                },
            ],
            websites: [
                {
                    url: login.origin,
                    label: "website",
                    autofillBehavior: sdk.AutofillBehavior.AnywhereOnWebsite,
                },
            ],
        });
        this.vaultItems.delete(vault.id);
    }

    private async use(
        overview: ItemOverview,
        origin: string,
        kind: "username" | "password",
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        const client = await this.clientGet();
        const item = await client.items.get(overview.vaultId, overview.id);
        // The item may have changed since the picker listed it.
        if (!item.websites.some((website) => websiteOrigin(website.url) === origin))
            throw new BrowserLoginUseError("This 1Password item no longer matches this site.");
        const username = field(item.fields, "username") ?? "";
        const password = field(item.fields, "password");
        if (kind === "password" && !password)
            throw new Error("This 1Password item has no password.");
        await deliver({ username, password: kind === "password" ? password! : null });
    }

    /** Login item overviews of every vault, reread only for a vault whose contents changed. */
    private async logins(): Promise<readonly ItemOverview[]> {
        const sdk = await import("@1password/sdk");
        const client = await this.clientGet();
        const vaults: VaultOverview[] = await client.vaults.list();
        const output: ItemOverview[] = [];
        for (const vault of vaults) {
            let cached = this.vaultItems.get(vault.id);
            if (cached?.contentVersion !== vault.contentVersion) {
                const items = await client.items.list(vault.id, {
                    type: "ByState",
                    content: { active: true, archived: false },
                });
                cached = {
                    contentVersion: vault.contentVersion,
                    logins: items.filter((item) => item.category === sdk.ItemCategory.Login),
                };
                this.vaultItems.set(vault.id, cached);
            }
            output.push(...cached.logins);
        }
        for (const id of this.vaultItems.keys())
            if (!vaults.some((vault) => vault.id === id)) this.vaultItems.delete(id);
        return output;
    }

    private clientGet(): Promise<Client> {
        if (!this.account) return Promise.reject(new Error("1Password is not connected."));
        if (!this.client) {
            const client = this.clientCreate(this.account);
            this.client = client;
            // A refused or expired session is retried at the next use.
            client.catch(() => {
                if (this.client === client) this.client = null;
            });
        }
        return this.client;
    }

    private async clientCreate(account: string): Promise<Client> {
        const library = libraryPath();
        if (!library) throw new Error("1Password is not installed.");
        await browserLoginLibraryTrustRequire(library, agileBits);
        const sdk = await import("@1password/sdk");
        return sdk.createClient({
            auth: new sdk.DesktopAuth(account, library),
            integrationName: "Happy",
            integrationVersion: this.options.integrationVersion,
        });
    }

    private async persist(): Promise<void> {
        await mkdir(dirname(this.options.path), { recursive: true });
        const temporary = `${this.options.path}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify({ account: this.account })}\n`, {
            mode: 0o600,
        });
        await rename(temporary, this.options.path);
    }
}

/** 1Password keeps a website as typed, often without its scheme. */
function websiteOrigin(url: string): string | undefined {
    return browserLoginOriginNormalize(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`,
    );
}

function accountValid(account: string): boolean {
    return account.length > 0 && account.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(account);
}

function field(
    fields: readonly { readonly id: string; readonly value: string }[],
    id: "username" | "password",
): string | undefined {
    return fields.find((each) => each.id === id)?.value;
}

/** The closest of an item's websites to the page: its exact origin first. */
function itemMatch(
    item: ItemOverview,
    pageOrigin: string,
): { origin: string; relation: "exact" | "related" } | null {
    let related: { origin: string; relation: "related" } | null = null;
    for (const website of item.websites) {
        if ((website.autofillBehavior as string) === "Never") continue;
        const origin = websiteOrigin(website.url);
        if (!origin) continue;
        const relation = browserLoginRelation(pageOrigin, origin);
        if (relation === "exact") return { origin, relation };
        if (relation === "related") related ??= { origin, relation };
    }
    return related;
}
