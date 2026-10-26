import type { BrowserLoginSecretInput } from "./browserLoginVault";

const maximumFileBytes = 16 * 1024 * 1024;
const maximumRows = 20_000;
const maximumColumns = 64;
const maximumFieldLength = 65_536;

// README identifies happy.engineering as Happy's website; docs/releases.md also
// identifies local.app.happy.engineering as the hosted application. Exclude the
// whole owned domain, including cloud/auth hosts, rather than listing subdomains.
const happyDomains = ["happy.engineering"];

/**
 * Pure main-only parser for Chrome, Firefox, and Safari password CSV exports.
 * External file syntax is interpreted here; the rest of main receives explicit
 * canonical HTTPS origins. Neither errors nor skipped counts expose secret data.
 */
export function browserPasswordCsvParse(source: string): {
    logins: readonly BrowserLoginSecretInput[];
    skipped: number;
} {
    if (source.length > maximumFileBytes || Buffer.byteLength(source, "utf8") > maximumFileBytes)
        throw new Error("This password export is too large.");
    const logins: BrowserLoginSecretInput[] = [];
    let headers: readonly string[] | undefined;
    let originIndex = -1;
    let usernameIndex = -1;
    let passwordIndex = -1;
    let realmIndex = -1;
    let skipped = 0;
    let rows = 0;
    csvRowsRead(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source, (row) => {
        // Browsers may leave a final blank line. A quoted empty field is also blank.
        if (row.length === 1 && row[0] === "") return;
        if (!headers) {
            headers = row;
            originIndex = columnRequire(row, ["URL", "url", "origin"]);
            usernameIndex = columnRequire(row, ["Username", "username"]);
            passwordIndex = columnRequire(row, ["Password", "password"]);
            realmIndex = row.indexOf("httpRealm");
            return;
        }
        if (++rows > maximumRows) throw new Error("This password export has too many rows.");
        const username = row[usernameIndex];
        const password = row[passwordIndex];
        const origin = externalOrigin(row[originIndex]);
        if (
            row.length !== headers.length ||
            !origin ||
            username === undefined ||
            username.length > 4096 ||
            !password ||
            // Firefox also exports HTTP authentication credentials, which cannot
            // be filled into a web form using the top-frame login picker.
            (realmIndex >= 0 && row[realmIndex] !== "")
        ) {
            skipped++;
            return;
        }
        logins.push({ origin, username, password });
    });
    if (!headers) throw new Error("This file is not a supported browser password export.");
    return { logins, skipped };
}

function columnRequire(headers: readonly string[], accepted: readonly string[]): number {
    const indexes = headers.flatMap((header, index) => (accepted.includes(header) ? [index] : []));
    if (indexes.length !== 1)
        throw new Error("This file is not a supported browser password export.");
    return indexes[0];
}

function externalOrigin(value: string | undefined): string | undefined {
    if (!value || value.length > 8192) return undefined;
    try {
        const url = new URL(value);
        // A final DNS dot denotes the same owned host but URL.origin preserves it.
        const host = url.hostname.replace(/\.$/, "");
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            happyDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
        )
            return undefined;
        return url.origin;
    } catch {
        return undefined;
    }
}

/** Strict RFC-style CSV: embedded commas/newlines and doubled quotes are supported. */
function csvRowsRead(source: string, receive: (row: readonly string[]) => void): void {
    let row: string[] = [];
    let field = "";
    let state: "start" | "plain" | "quoted" | "closed" = "start";
    const invalid = () => new Error("This password export contains invalid CSV data.");
    const fieldFinish = () => {
        row.push(field);
        if (row.length > maximumColumns)
            throw new Error("This password export has too many columns.");
        field = "";
        state = "start";
    };
    const rowFinish = () => {
        fieldFinish();
        receive(row);
        row = [];
    };
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (state === "quoted") {
            if (character === '"') {
                if (source[index + 1] === '"') {
                    field += '"';
                    index++;
                } else state = "closed";
            } else field += character;
        } else if (character === ",") fieldFinish();
        else if (character === "\n" || character === "\r") {
            if (character === "\r" && source[index + 1] === "\n") index++;
            rowFinish();
        } else if (character === '"' && state === "start") state = "quoted";
        else {
            if (state === "closed" || character === '"') throw invalid();
            field += character;
            state = "plain";
        }
        if (field.length > maximumFieldLength)
            throw new Error("This password export contains an oversized field.");
    }
    if (state === "quoted") throw invalid();
    if (state !== "start" || row.length > 0) rowFinish();
}
