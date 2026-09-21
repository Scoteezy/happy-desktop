import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, join, sep } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const rootRequire = createRequire(join(workspace, "package.json"));
const gymRequire = createRequire(join(workspace, "packages/happy-desktop-gym/package.json"));
const sharp = rootRequire("sharp");
const { chromium } = gymRequire("playwright");
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
    if (!["--captures", "--out"].includes(args[index]) || !args[index + 1]) {
        throw new Error("Use --captures <captures.json> --out <output directory>.");
    }
    options[args[index].slice(2)] = resolve(args[index + 1]);
}
if (!options.captures || !options.out) throw new Error("Both --captures and --out are required.");
const manifest = JSON.parse(await readFile(options.captures, "utf8"));
if (
    manifest.version !== 1 ||
    !manifest.provenance ||
    typeof manifest.font !== "string" ||
    typeof manifest.supportFont !== "string"
) {
    throw new Error("Expected a version-1 capture manifest with provenance and explicit fonts.");
}
const supplied = manifest.provenance;
if (
    !/^[a-f0-9]{40,64}$/u.test(supplied.mobileCommit ?? "") ||
    !/^[a-f0-9]{40,64}$/u.test(supplied.desktopCommit ?? "") ||
    typeof supplied.mobileDirty !== "boolean" ||
    typeof supplied.desktopDirty !== "boolean" ||
    !/^[a-f0-9-]{36}$/iu.test(supplied.simulator ?? "") ||
    typeof supplied.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(supplied.capturedAt)) ||
    !Array.isArray(supplied.fixtures) ||
    supplied.fixtures.length > 20 ||
    supplied.fixtures.some((value) => typeof value !== "string" || value.length > 512)
)
    throw new Error(
        "Invalid capture provenance; provide revision, Simulator, time, and fixture descriptions only.",
    );
// A richer runtime object must never carry auth or environment values into the
// exported composition report. Copy only the declared non-secret contract.
const provenance = {
    mobileCommit: supplied.mobileCommit,
    desktopCommit: supplied.desktopCommit,
    mobileDirty: supplied.mobileDirty,
    desktopDirty: supplied.desktopDirty,
    simulator: supplied.simulator,
    capturedAt: supplied.capturedAt,
    fixtures: supplied.fixtures,
};

const specs = [
    { id: "models", title: ["Your models.", "One place."], detail: "Claude, GPT, and more." },
    {
        id: "sessions",
        title: ["Every agent.", "Within reach."],
        detail: "Follow your work across projects.",
    },
    {
        id: "continuity",
        title: ["From desk", "to anywhere."],
        detail: "The same conversation, on your phone.",
    },
    {
        id: "multiplayer",
        title: ["Build", "together."],
        detail: "You, your team, and your agents.",
    },
    {
        id: "source",
        title: ["Open source.", "By design."],
        detail: "Explore the code. Make it yours.",
    },
];
const escape = (value) =>
    value.replace(
        /[&<>"']/gu,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
const data = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;
const images = {};
const sources = {};
const captureDirectory = await realpath(dirname(options.captures));
for (const id of [...specs.map((spec) => spec.id), "desktop"]) {
    if (typeof manifest.screens?.[id] !== "string")
        throw new Error(`Missing explicit ${id} capture.`);
    const selected = manifest.screens[id];
    if (isAbsolute(selected)) throw new Error("Screens must be relative to the capture directory.");
    const path = resolve(captureDirectory, selected);
    const info = await lstat(path);
    const canonical = await realpath(path);
    const inside = relative(captureDirectory, canonical);
    if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        canonical !== path ||
        inside === ".." ||
        inside.startsWith(`..${sep}`) ||
        isAbsolute(inside)
    ) {
        throw new Error("Every screen must be an ordinary file inside the capture directory.");
    }
    const bytes = await readFile(path);
    const metadata = await sharp(bytes).metadata();
    if (metadata.width < 700 || metadata.height < 500)
        throw new Error(`${id} capture is too small.`);
    if (id !== "desktop" && Math.abs(metadata.width / metadata.height - 1206 / 2622) > 0.002) {
        throw new Error(`${id} does not match the declared phone frame aspect ratio.`);
    }
    images[id] = data(await sharp(bytes).png().toBuffer(), "image/png");
    sources[id] = {
        width: metadata.width,
        height: metadata.height,
        sha256: createHash("sha256").update(bytes).digest("hex"),
    };
}
const font = data(await readFile(resolve(dirname(options.captures), manifest.font)), "font/ttf");
const supportFont = data(
    await readFile(resolve(dirname(options.captures), manifest.supportFont)),
    "font/ttf",
);
const frame = data(
    await readFile(
        join(workspace, "scripts/demo/demos/core/assets/device/iphone-16-pro-black.png"),
    ),
    "image/png",
);
const screenMask = data(
    await readFile(join(workspace, "scripts/demo/demos/core/assets/device/screen-alpha.png")),
    "image/png",
);
// Require a fresh export directory: rerendering may never overwrite a raw
// capture or the last selected image set, even if the caller mixes paths.
await mkdir(dirname(options.out), { recursive: true });
await mkdir(options.out);
const browser = await chromium.launch({ headless: true });
const report = { version: 1, provenance, sources, cards: [] };
try {
    const page = await browser.newPage({
        viewport: { width: 660, height: 1434 },
        deviceScaleFactor: 2,
    });
    // Entirely offline. Compositions embed the approved local capture bytes;
    // no page can fetch fonts, analytics, arbitrary files, or external content.
    await page.route("**/*", (route) => route.abort());
    for (const [index, spec] of specs.entries()) {
        const crossDevice = spec.id === "continuity";
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
            @font-face{font-family:Headline;src:url('${font}') format('truetype');font-weight:700;font-display:block}
            @font-face{font-family:Support;src:url('${supportFont}') format('truetype');font-weight:400;font-display:block}
            *{box-sizing:border-box}html,body{margin:0;width:660px;height:1434px;overflow:hidden}
            body{background:#f5f0e7;color:#183f38;font-family:Support,sans-serif;display:flex;flex-direction:column}
            main{display:flex;flex-direction:column;align-items:center;gap:0;width:100%;height:100%;padding:44px 40px 0}
            header{display:flex;flex-direction:column;align-items:center;gap:20px;width:100%;flex:none;text-align:center;z-index:2}
            .brand{font-family:Headline;font-size:18px;line-height:24px;letter-spacing:-.5px}
            h1{display:flex;flex-direction:column;align-items:center;margin:0;font:700 66px/.99 Headline;letter-spacing:-2.4px}
            h1 span:last-child{color:#e6522c}p{margin:0;font-size:26px;line-height:1.4;letter-spacing:-.5px;white-space:nowrap}
            .scene{display:flex;flex:1;width:100%;min-height:0;align-items:flex-start;justify-content:center;padding-top:40px;position:relative}
            .phone{width:520px;flex:none;aspect-ratio:1406/2822;position:relative}
            /* Screen and licensed bezel are exact overlapping layers, not flow layout. */
            .screen{position:absolute;left:7.25462%;top:3.543586%;width:85.775249%;height:92.912828%;object-fit:contain;background:#000;mask-image:url('${screenMask}');mask-mode:luminance;mask-size:100% 100%}
            .bezel{position:absolute;inset:0;width:100%;height:100%}
            /* Cross-device narrative intentionally overlaps two real captures. */
            .desktop{position:absolute;top:48px;left:-8px;width:596px;border-radius:10px;box-shadow:0 18px 30px #193e3725;border:1px solid #444}
            .cross .phone{width:404px;margin-top:280px;transform:translateX(67px)}
        </style></head><body><main><header><div class="brand">Happy</div><h1>${spec.title.map((line) => `<span>${escape(line)}</span>`).join("")}</h1><p>${escape(spec.detail)}</p></header><section class="scene ${crossDevice ? "cross" : ""}">${crossDevice ? `<img class="desktop" src="${images.desktop}" alt="">` : ""}<div class="phone"><img class="screen" src="${images[spec.id]}" alt=""><img class="bezel" src="${frame}" alt=""></div></section></main></body></html>`);
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((image) => image.decode()));
        });
        const geometry = await page.evaluate(() => {
            const box = (selector) => {
                const rect = document.querySelector(selector)?.getBoundingClientRect();
                return rect
                    ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                    : null;
            };
            if (!document.fonts.check("700 66px Headline"))
                throw new Error("Headline font did not load.");
            if (!document.fonts.check("400 26px Support"))
                throw new Error("Supporting font did not load.");
            for (const node of document.querySelectorAll("header, h1, h1 span, p")) {
                const rect = node.getBoundingClientRect();
                if (
                    rect.left < 0 ||
                    rect.right > innerWidth ||
                    node.scrollWidth > node.clientWidth + 1
                )
                    throw new Error("Copy overflows.");
            }
            const phone = box(".phone");
            if (
                phone.x < 0 ||
                phone.y < 0 ||
                phone.x + phone.width > innerWidth ||
                phone.y + phone.height > innerHeight
            ) {
                throw new Error("Device artwork must remain fully visible.");
            }
            if (Math.abs(phone.width / phone.height - 1406 / 2822) > 0.0001)
                throw new Error("Device aspect ratio changed.");
            return { headline: box("h1"), phone, screen: box(".screen"), desktop: box(".desktop") };
        });
        const name = `${String(index + 1).padStart(2, "0")}-${spec.id}.png`;
        const bytes = await page.screenshot({ type: "png" });
        const path = join(options.out, name);
        await sharp(bytes)
            .flatten({ background: "#f5f0e7" })
            .toColourspace("srgb")
            .removeAlpha()
            .png()
            .toFile(path);
        const metadata = await sharp(path).metadata();
        if (metadata.width !== 1320 || metadata.height !== 2868 || metadata.hasAlpha)
            throw new Error(`Invalid App Store export ${name}.`);
        report.cards.push({
            file: name,
            ...spec,
            geometry,
            width: metadata.width,
            height: metadata.height,
            hasAlpha: metadata.hasAlpha,
        });
    }
} finally {
    await browser.close();
}
const thumbnails = await Promise.all(
    report.cards.map(async (card, index) => ({
        input: await sharp(join(options.out, card.file)).resize({ width: 220 }).png().toBuffer(),
        left: index * 240 + 20,
        top: 20,
    })),
);
await sharp({ create: { width: 1220, height: 518, channels: 3, background: "#ddd9d0" } })
    .composite(thumbnails)
    .png()
    .toFile(join(options.out, "contact-sheet.png"));
await writeFile(join(options.out, "composition.json"), JSON.stringify(report, null, 2) + "\n");
console.log(join(options.out, "contact-sheet.png"));
