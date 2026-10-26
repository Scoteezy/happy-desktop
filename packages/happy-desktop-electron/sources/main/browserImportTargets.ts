import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { session as electronSession } from "electron";
import type { DesktopBrowserNetwork, DesktopBrowserProxyTarget } from "../shared/desktopContract";
import type { BrowserImportNetworkTarget, BrowserImportTargetSource } from "./browserImport";
import { HappyAgentBrowser } from "./happyAgentBrowser";

/**
 * One network profile Happy has opened, with the agents Happy Agent named as
 * using it, most recent first. Many workspaces share one network, such as
 * this computer's, so the profile lives while any of them does.
 */
interface TargetRecord {
    readonly network: DesktopBrowserNetwork;
    readonly owners: readonly DesktopBrowserProxyTarget[];
    readonly openedAt: number;
}

interface TargetFile {
    readonly version: 2;
    readonly targets: readonly TargetRecord[];
}

const maximumTargets = 64;
const maximumOwners = 16;
/** A profile no browser has opened for this long stops receiving imports. */
const maximumIdle = 90 * 86_400_000;
const ownerCheckTimeout = 5000;

/**
 * Where imported sessions go: every network profile a workspace browser has
 * opened, kept across launches until every workspace that used it is archived
 * or no browser has opened it for 90 days. A profile is
 * persistent, so cookies can be written to it before its tab reopens; doing so
 * makes no network request.
 */
export class BrowserImportTargets implements BrowserImportTargetSource {
    private records = new Map<string, TargetRecord>();
    private loaded?: Promise<void>;
    private writing = Promise.resolve();

    constructor(
        private readonly options: {
            readonly path: string;
            /** False: the workspace is archived or gone. Throws while unreachable. */
            readonly ownerActive: (
                owner: DesktopBrowserProxyTarget,
                signal: AbortSignal,
            ) => Promise<boolean>;
        },
    ) {}

    /** A workspace browser opened this network for this agent. */
    async remember(
        network: DesktopBrowserNetwork,
        owner: DesktopBrowserProxyTarget,
    ): Promise<void> {
        if (network.artifactId !== undefined || owner.connectionId !== network.connectionId) return;
        await this.load();
        const partition = HappyAgentBrowser.partition(network);
        const named: DesktopBrowserProxyTarget = {
            connectionId: owner.connectionId,
            workspaceId: owner.workspaceId,
            agentId: owner.agentId,
        };
        const others = (this.records.get(partition)?.owners ?? []).filter(
            (entry) => entry.workspaceId !== named.workspaceId || entry.agentId !== named.agentId,
        );
        this.records.set(partition, {
            network: { connectionId: network.connectionId, networkId: network.networkId },
            owners: [named, ...others].slice(0, maximumOwners),
            openedAt: Date.now(),
        });
        for (const stale of [...this.records]
            .sort(([, left], [, right]) => right.openedAt - left.openedAt)
            .slice(maximumTargets))
            this.records.delete(stale[0]);
        this.persist();
    }

    /** Every known profile some still-active workspace has used. */
    async list(): Promise<readonly BrowserImportNetworkTarget[]> {
        await this.load();
        let changed = false;
        const now = Date.now();
        await Promise.all(
            [...this.records].map(async ([partition, record]) => {
                let retired = now - record.openedAt > maximumIdle;
                if (!retired) {
                    const answers = await Promise.all(
                        record.owners.map((owner) =>
                            this.options
                                .ownerActive(owner, AbortSignal.timeout(ownerCheckTimeout))
                                // Unreachable or slow: the profile may still be in use.
                                .catch(() => true),
                        ),
                    );
                    retired = !answers.includes(true);
                }
                if (!retired || this.records.get(partition) !== record) return;
                this.records.delete(partition);
                changed = true;
            }),
        );
        if (changed) this.persist();
        return [...this.records.keys()].map((partition) => ({
            partition,
            session: electronSession.fromPartition(partition, { cache: true }),
        }));
    }

    /** Synchronous: is this profile still known? */
    current(target: BrowserImportNetworkTarget): boolean {
        return this.records.has(target.partition);
    }

    private load(): Promise<void> {
        this.loaded ??= (async () => {
            let source: string;
            try {
                source = await readFile(this.options.path, "utf8");
            } catch {
                return;
            }
            try {
                for (const record of targetFileParse(JSON.parse(source)).targets)
                    this.records.set(HappyAgentBrowser.partition(record.network), record);
            } catch {
                // A damaged file only forgets destinations; profiles are untouched.
            }
        })();
        return this.loaded;
    }

    private persist(): void {
        const file: TargetFile = { version: 2, targets: [...this.records.values()] };
        this.writing = this.writing
            .then(async () => {
                const temporary = `${this.options.path}.${randomUUID()}.tmp`;
                try {
                    await mkdir(dirname(this.options.path), { recursive: true, mode: 0o700 });
                    const handle = await open(temporary, "wx", 0o600);
                    try {
                        await handle.writeFile(JSON.stringify(file), "utf8");
                        await handle.sync();
                    } finally {
                        await handle.close();
                    }
                    await rename(temporary, this.options.path);
                } finally {
                    await unlink(temporary).catch(() => undefined);
                }
            })
            .catch(() => undefined);
    }
}

function targetFileParse(value: unknown): TargetFile {
    const object = (entry: unknown): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry);
    const text = (entry: unknown): entry is string =>
        typeof entry === "string" && entry.length > 0 && entry.length <= 256;
    if (!object(value) || value.version !== 2 || !Array.isArray(value.targets)) throw new Error();
    const targets: TargetRecord[] = [];
    for (const record of value.targets.slice(0, maximumTargets)) {
        if (!object(record) || !object(record.network) || !Array.isArray(record.owners)) continue;
        const network = record.network;
        const connectionId = network.connectionId;
        if (
            !(connectionId === null || text(connectionId)) ||
            !text(network.networkId) ||
            typeof record.openedAt !== "number" ||
            !Number.isFinite(record.openedAt)
        )
            continue;
        const owners: DesktopBrowserProxyTarget[] = [];
        for (const owner of record.owners.slice(0, maximumOwners))
            if (
                object(owner) &&
                owner.connectionId === connectionId &&
                text(owner.workspaceId) &&
                text(owner.agentId)
            )
                owners.push({
                    connectionId,
                    workspaceId: owner.workspaceId,
                    agentId: owner.agentId,
                });
        if (owners.length === 0) continue;
        targets.push({
            network: { connectionId, networkId: network.networkId },
            owners,
            openedAt: record.openedAt,
        });
    }
    return { version: 2, targets };
}
