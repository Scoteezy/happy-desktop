import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Client, ItemOverview, VaultOverview, Website } from "@1password/sdk";
import {
    browserLoginRelation,
    BrowserLoginUseError,
    type BrowserLoginCandidate,
    type BrowserLoginRelation,
    type BrowserLoginSaveTarget,
    type BrowserLoginSecret,
    type BrowserLoginSource,
    type BrowserLoginSourceList,
} from "./browserLoginSources";
import {
    BrowserLoginLibraryRefusedError,
    browserLoginLibraryVerify,
    type BrowserLoginLibraryPublisher,
} from "./browserLoginLibraryTrust";
import { browserLoginOriginNormalize } from "./browserLoginProfiles";

/**
 * The one place Happy loads 1Password's SDK library from: the desktop app,
 * as AgileBits' installer package puts it, owned by root. The SDK would also
 * search the person's own folders, where any program could leave a library;
 * the patched SDK loads only the file Happy verified and hands it.
 */
const macBundle = "/Applications/1Password.app";
const macLibrary = `${macBundle}/Contents/Frameworks/libop_sdk_ipc_client.dylib`;

/** AgileBits Inc., which signs 1Password: Apple Team ID 2BUA8C4S2C, as its installer's Developer ID shows. */
const agileBits: BrowserLoginLibraryPublisher = {
    refusal:
        "Happy uses 1Password only when it is installed for all users and signed by AgileBits. Install it with the installer package from 1password.com, then try again.",
    appleTeamId: "2BUA8C4S2C",
    appleIdentifiers: { bundle: "com.1password.1password", library: "libop_sdk_ipc_client" },
    macBundle: (library) => (library === macLibrary ? macBundle : null),
};

/** Whether 1Password can be used here at all, and whether its app is installed. */
export type BrowserLoginOnePasswordInstall = "unsupported" | "missing" | "installed";

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
    private refusalLogged = false;

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

    /** Only macOS: see browserLoginLibraryVerify for why Windows is refused. */
    install(): BrowserLoginOnePasswordInstall {
        if (process.platform !== "darwin") return "unsupported";
        return existsSync(macLibrary) ? "installed" : "missing";
    }

    accountGet(): string | null {
        return this.account;
    }

    connected(): boolean {
        return this.account !== null && this.install() === "installed";
    }

    /** 1Password asks the person to approve Happy; their approval is the connection. */
    async connect(account: string): Promise<void> {
        const name = account.trim();
        if (!accountValid(name)) throw new Error("Enter your 1Password account name.");
        if (this.install() !== "installed")
            throw new Error("Install the 1Password app and sign in to it, then connect again.");
        let client: Client;
        try {
            client = await this.clientCreate(name);
            await client.vaults.list();
        } catch (error) {
            if (error instanceof BrowserLoginLibraryRefusedError) throw error;
            throw new Error(
                "1Password did not connect. In 1Password, turn on Settings › Developer › Integrate with other apps, check the account name, and approve Happy when asked.",
            );
        }
        this.account = name;
        this.client = Promise.resolve(client);
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
                    this.use(item, pageOrigin, match, field, deliver).catch((error: unknown) => {
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
     * account name. With a single item for exactly this origin, only its
     * username field is resolved to compare; with none or several, or when it
     * cannot be resolved, the save is offered and nothing else is read.
     */
    async has(origin: string, username: string): Promise<boolean> {
        const exact = (await this.logins()).filter(
            (item) => itemMatch(item, origin)?.relation === "exact",
        );
        if (exact.length !== 1) return false;
        const { vaultId, id } = exact[0]!;
        if (!/^[a-z0-9]+$/i.test(vaultId) || !/^[a-z0-9]+$/i.test(id)) return false;
        try {
            const client = await this.clientGet();
            return (await client.secrets.resolve(`op://${vaultId}/${id}/username`)) === username;
        } catch {
            return false;
        }
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
        pageOrigin: string,
        listed: { readonly origin: string; readonly relation: BrowserLoginRelation },
        kind: "username" | "password",
        deliver: (login: BrowserLoginSecret) => Promise<void>,
    ): Promise<void> {
        const client = await this.clientGet();
        const item = await client.items.get(overview.vaultId, overview.id);
        // The item, or its autofill settings, may have changed since the picker listed it.
        const match = itemMatch(item, pageOrigin);
        if (match?.origin !== listed.origin || match.relation !== listed.relation)
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
            client.catch((error: unknown) => {
                if (this.client === client) this.client = null;
                if (error instanceof BrowserLoginLibraryRefusedError && !this.refusalLogged) {
                    this.refusalLogged = true;
                    console.warn(`Saved logins: not reading 1Password. ${error.message}`);
                }
            });
        }
        return this.client;
    }

    /** Verifies the library for this load alone; nothing is awaited between that and loading it. */
    private async clientCreate(account: string): Promise<Client> {
        const sdk = await import("@1password/sdk");
        const verified = await browserLoginLibraryVerify(macLibrary, agileBits);
        let client: Promise<Client>;
        try {
            verified.unchanged();
            // createClient loads the library synchronously, before it first
            // awaits, from the open file that was verified.
            client = sdk.createClient({
                auth: new sdk.DesktopAuth(account, verified.file),
                integrationName: "Happy",
                integrationVersion: this.options.integrationVersion,
            });
        } finally {
            verified.close();
        }
        return client;
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

/**
 * The closest of an item's websites to the page: its exact origin first. A
 * website set never to autofill never matches, and one set to its exact
 * domain only matches that origin, never as a related site.
 */
function itemMatch(
    item: { readonly websites: readonly Website[] },
    pageOrigin: string,
): { origin: string; relation: BrowserLoginRelation } | null {
    let related: { origin: string; relation: "related" } | null = null;
    for (const website of item.websites) {
        const behavior = website.autofillBehavior as string;
        if (behavior === "Never") continue;
        const origin = websiteOrigin(website.url);
        if (!origin) continue;
        const relation = browserLoginRelation(pageOrigin, origin);
        if (relation === "exact") return { origin, relation };
        if (relation === "related" && behavior === "AnywhereOnWebsite")
            related ??= { origin, relation };
    }
    return related;
}
