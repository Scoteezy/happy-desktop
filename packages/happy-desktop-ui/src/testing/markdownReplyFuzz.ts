/* Seeded random Markdown replies for the row-height differential test: prose,
 * lists nested two deep, long URLs and unbroken tokens, inline code, emphasis
 * and links, emoji, CJK, right-to-left words, quotes, headings, code blocks,
 * tables and rules. The same seed always gives the same reply and widths. */
const WIDTHS_PER_SEED = 6;

function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const WORDS = (
    "the a reply check build release agent transcript wraps line height model browser " +
    "sign-in account provider restart config update channel preview footer overlap " +
    "measure layout token width column paragraph Kermit Happy desktop worktree"
).split(" ");
const CJK =
    "我们已经开始登录请在浏览器中完成授权代码只能使用一次日本語のテキストを折り返す한국어문장도섞여있습니다";
const RTL = ["مرحبا", "بالعالم", "التحقق", "من", "الحساب", "שלום", "עולם", "בדיקה"];
const EMOJI = ["🙂", "🚀", "✅", "⚠️", "👍🏽", "🇺🇸", "👨‍👩‍👧"];

/** One seeded Markdown reply and the column widths to lay it out at. */
export function markdownReplyGenerate(seed: number): {
    readonly text: string;
    readonly widths: readonly number[];
} {
    const next = random(seed);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)]!;
    const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
    const hex = (length: number) =>
        Array.from({ length }, () => "0123456789abcdef"[int(0, 15)]).join("");
    const url = () =>
        pick([
            () => `https://example.com/${WORDS.slice(0, int(1, 6)).join("/")}`,
            () =>
                `https://claude.com/cai/oauth/authorize?code=true&client_id=${hex(8)}-${hex(4)}-${hex(4)}&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&state=${hex(int(10, 60))}`,
            () => `https://github.com/slopus/happy-desktop/commit/${hex(40)}`,
            () => `www.${pick(WORDS)}-${pick(WORDS)}.dev/${hex(int(4, 30))}`,
        ])();
    const token = () =>
        pick([
            () => hex(int(12, 90)),
            () => `/Users/someone/Developer/${WORDS.slice(int(0, 5), int(6, 30)).join("/")}.ts`,
            () => `${pick(WORDS)}_${pick(WORDS)}_${pick(WORDS)}@bra1ndump.com`,
            () => "AV".repeat(int(10, 60)),
            () => `${pick(WORDS)}-${hex(int(4, 12))}-${pick(WORDS)}-${hex(int(4, 40))}`,
        ])();
    const word = (): string => {
        const roll = next();
        if (roll < 0.62) return pick(WORDS);
        if (roll < 0.68) return `\`${pick([pick(WORDS), token(), "pnpm check", "a < b"])}\``;
        if (roll < 0.73) return `**${pick(WORDS)} ${pick(WORDS)}**`;
        if (roll < 0.76) return `*${pick(WORDS)}*`;
        if (roll < 0.8) return `[${pick(WORDS)} ${pick(WORDS)}](${url()})`;
        if (roll < 0.83) return url();
        if (roll < 0.86) return token();
        if (roll < 0.89) return pick(EMOJI);
        if (roll < 0.93) {
            const start = int(0, CJK.length - 4);
            return CJK.slice(start, start + int(2, 30));
        }
        if (roll < 0.96) return pick(RTL);
        return `${pick(WORDS)}${pick([",", ".", ";", ":", "!", "?", ")", "—"])}`;
    };
    const sentence = (min = 3, max = 40) => Array.from({ length: int(min, max) }, word).join(" ");
    const list = (depth: number): string => {
        const ordered = next() < 0.4;
        const indent = "   ".repeat(depth);
        return Array.from({ length: int(1, 5) }, (_, index) => {
            const marker = ordered ? `${String(index + 1)}.` : pick(["-", "*"]);
            let item = `${indent}${marker} ${sentence(1, 25)}`;
            if (next() < 0.2) item += `\n${indent}   ${sentence(1, 12)}`;
            if (depth < 2 && next() < 0.2) item += `\n${list(depth + 1)}`;
            return item;
        }).join("\n");
    };
    const block = (): string => {
        const roll = next();
        if (roll < 0.42) return sentence();
        if (roll < 0.66) return list(0);
        if (roll < 0.74) return `${"#".repeat(int(1, 4))} ${sentence(1, 10).replace(/\n/gu, " ")}`;
        if (roll < 0.82) return `> ${sentence(2, 30)}`;
        if (roll < 0.9)
            return [
                "```ts",
                ...Array.from({ length: int(1, 6) }, () => sentence(1, 14).replace(/`/gu, "")),
                "```",
            ].join("\n");
        if (roll < 0.97) {
            const columns = int(2, 4);
            const row = () =>
                `| ${Array.from({ length: columns }, () => sentence(1, 6).replace(/\|/gu, "")).join(" | ")} |`;
            return [
                row(),
                `|${" --- |".repeat(columns)}`,
                ...Array.from({ length: int(1, 4) }, row),
            ].join("\n");
        }
        return "---";
    };
    return {
        text: Array.from({ length: int(1, 6) }, block).join("\n\n"),
        widths: Array.from({ length: WIDTHS_PER_SEED }, () => int(320, 1000)),
    };
}
