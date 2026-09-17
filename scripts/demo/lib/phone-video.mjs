import { execFile as exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { simulatorOpen } from "./simulator.mjs";

const execFile = promisify(exec);
const workspace = resolve(import.meta.dirname, "../../..");

async function run(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
        child.on("error", reject);
        child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
        );
    });
}

/** Nine-slice Apple's installed Simulator frame; retain the original corners. */
export async function frameBuild(directory) {
    const renderer = join(directory, "phone-pdf");
    await run("swiftc", [
        "-module-cache-path",
        join(workspace, ".context", "swift-cache"),
        join(import.meta.dirname, "phone-pdf.swift"),
        "-o",
        renderer,
    ]);
    const chrome = "/Library/Developer/DeviceKit/Chrome/phone11.devicechrome/Contents/Resources";
    const pdf = async (name, output, scale = 3) => {
        const target = join(directory, output);
        await execFile(renderer, [join(chrome, `${name}.pdf`), target, String(scale)]);
        return target;
    };
    const source = await pdf("PhoneComposite", "chrome.png");
    const metadata = await sharp(source).metadata();
    const cap = 330;
    const bodyWidth = 1314;
    const bodyHeight = 2730;
    const width = 1368;
    const padding = 27;
    const pieces = [];
    const xs = [0, cap, metadata.width - cap, metadata.width];
    const ys = [0, cap, metadata.height - cap, metadata.height];
    const tx = [0, cap, bodyWidth - cap, bodyWidth];
    const ty = [0, cap, bodyHeight - cap, bodyHeight];
    for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
            pieces.push({
                input: await sharp(source)
                    .extract({
                        left: xs[x],
                        top: ys[y],
                        width: xs[x + 1] - xs[x],
                        height: ys[y + 1] - ys[y],
                    })
                    .resize(tx[x + 1] - tx[x], ty[y + 1] - ty[y], { fit: "fill" })
                    .png()
                    .toBuffer(),
                left: padding + tx[x],
                top: ty[y],
            });
        }
    // Normal (unpressed) hardware buttons, behind the body, using chrome.json's offsets.
    const buttons = [];
    for (const [asset, side, offset] of [
        ["Mute BTN", "left", 160],
        ["Vol BTN", "left", 221],
        ["Vol BTN", "left", 300],
        ["X_Power BTN", "right", 262],
    ]) {
        const file = await pdf(asset, `${asset.replaceAll(" ", "-")}.png`);
        const size = await sharp(file).metadata();
        buttons.push({
            input: file,
            left: side === "left" ? 24 : padding + bodyWidth - 24,
            top: offset * 3,
        });
        if (buttons.at(-1).left + size.width > width)
            throw new Error("Simulator button exceeds its frame.");
    }
    const frame = join(directory, "phone-frame.png");
    await sharp({ create: { width, height: bodyHeight, channels: 4, background: "#00000000" } })
        .composite([...buttons, ...pieces])
        .png()
        .toFile(frame);
    const mask = join(directory, "phone-screen-mask.png");
    await execFile(renderer, [
        "/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17 Pro.simdevicetype/Contents/Resources/4E5532ED-1470-47D1-BDF4-7AA90C26957A.pdf",
        mask,
        "1",
    ]);
    const alpha = join(directory, "phone-screen-alpha.png");
    await sharp(mask).extractChannel("alpha").png().toFile(alpha);
    return {
        frame,
        alpha,
        framing:
            "Apple Simulator phone11 device chrome, 3× rasterization, original corners and hardware buttons",
        width,
        height: bodyHeight,
        screen: { x: 81, y: 54, width: 1206, height: 2622 },
    };
}

/** One concurrently captured phone source supplies both phone deliverables. */
export async function phoneVideoOpen({ udid, output, work, frame }) {
    const directory = join(work, "phone");
    await mkdir(directory, { recursive: true });
    const simulator = await simulatorOpen({ udid });
    const cues = [];
    let capture;
    let captureExit;
    let clock;
    const source = join(directory, "phone-source.mov");
    let nativeScreens = [];
    return {
        get simulator() {
            return simulator;
        },
        async prepare({ sessionTitle, relaunch = false } = {}) {
            if (relaunch) {
                // Each take restarts its private daemon. Reopen only this
                // Simulator development app off camera so its socket lifetime
                // begins against the new daemon and prepared catalog.
                await execFile("xcrun", ["simctl", "terminate", udid, "com.slopus.happy.dev"]);
                await execFile("xcrun", ["simctl", "launch", udid, "com.slopus.happy.dev"]);
                await execFile("xcrun", ["simctl", "openurl", udid, "happy:///"]);
            }
            const deadline = Date.now() + 45000;
            for (;;) {
                const screen = await simulator.inspect();
                if (
                    screen.some((item) => item.text === "Sessions") &&
                    (sessionTitle === undefined ||
                        screen.some((item) => item.text?.startsWith(`${sessionTitle},`)))
                ) {
                    nativeScreens.push({ phase: "prepared", screen });
                    await writeFile(
                        join(output, "phone-prepared.json"),
                        JSON.stringify(screen, null, 2),
                    );
                    return;
                }
                if (Date.now() >= deadline) {
                    await writeFile(
                        join(output, "phone-prepare-failure.json"),
                        JSON.stringify(screen, null, 2),
                    );
                    throw new Error("The phone must start on its actual session list.");
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        },
        async start() {
            const requestedAt = performance.now();
            capture = spawn(
                "xcrun",
                ["simctl", "io", udid, "recordVideo", "--codec=h264", "--mask=ignored", source],
                { stdio: ["ignore", "pipe", "pipe"] },
            );
            let diagnostics = "";
            captureExit = new Promise((resolve, reject) => {
                capture.once("error", reject);
                capture.once("exit", (code) =>
                    code === 0
                        ? resolve()
                        : reject(new Error(`Phone capture exited ${code}: ${diagnostics}`)),
                );
            });
            // Retain the error until finish(), including when the take itself fails.
            captureExit.catch(() => {});
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("Phone capture did not start.")),
                    15000,
                );
                const receive = (chunk) => {
                    diagnostics += chunk;
                    if (!clock && diagnostics.includes("Recording started")) {
                        clock = {
                            requestedAt,
                            acknowledgedAt: performance.now(),
                            epochOrigin: performance.timeOrigin,
                        };
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                capture.stdout.on("data", receive);
                capture.stderr.on("data", receive);
                capture.once("error", (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                capture.once("exit", () => {
                    clearTimeout(timeout);
                    if (!clock) reject(new Error(diagnostics));
                });
            });
        },
        cue(name, director) {
            cues.push({
                name,
                frame: director.timing.frames,
                seconds: director.timing.frames / director.timing.fps,
            });
        },
        async inspect(phase) {
            const startedAt = performance.now();
            const screen = await simulator.inspect();
            nativeScreens.push({ phase, milliseconds: performance.now() - startedAt, screen });
            return screen;
        },
        async screenshot(name) {
            await execFile("xcrun", [
                "simctl",
                "io",
                udid,
                "screenshot",
                join(output, `${name}.png`),
            ]);
        },
        async finish(timing) {
            if (!capture) {
                await simulator.close();
                return;
            }
            // Persist the shared clock before native-driver teardown. An
            // unrelated cleanup failure must not discard an otherwise valid
            // take's exact synchronization evidence.
            if (clock) {
                clock.desktopStartedAt = timing.startedAt;
                clock.trimSeconds = (timing.startedAt - clock.acknowledgedAt) / 1000;
                clock.desktopFinishedAt = performance.now();
                await writeFile(
                    join(output, "phone-capture.json"),
                    JSON.stringify(
                        {
                            source: "Concurrent iPhone 17 Pro Simulator capture, connected through the real Happy encrypted integration",
                            clock,
                            cues,
                            nativeScreens,
                        },
                        null,
                        2,
                    ),
                );
            }
            try {
                // Simulator writes only changed frames. A real, off-camera
                // navigation after the desktop ends flushes its idle tail;
                // the export trims before this navigation, with no freeze pad.
                if (clock) {
                    await execFile("xcrun", ["simctl", "openurl", udid, "happy:///"]);
                    await simulator.inspect();
                    // The final shot can already be home. A real off-camera
                    // navigation guarantees a changed frame after the tail,
                    // rather than assuming reopening home changes pixels.
                    await simulator.run("- tapOn:\n    text: Settings\n    index: 0");
                    await new Promise((resolve) => setTimeout(resolve, 350));
                }
            } finally {
                try {
                    await simulator.close();
                } finally {
                    capture.kill("SIGINT");
                    await captureExit;
                }
            }
        },
        async export({ fps, frames }) {
            if (!clock) throw new Error("No native phone capture was started.");
            const probe = JSON.parse(
                (
                    await execFile("ffprobe", [
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "json",
                        source,
                    ])
                ).stdout,
            );
            if (Number(probe.format.duration) < Math.max(0, clock.trimSeconds) + frames / fps)
                throw new Error(
                    "Native phone capture does not cover the continuous desktop timeline.",
                );
            const geometry = frame ?? (await frameBuild(directory));
            const screenVideo = join(output, "phone-screen.mp4");
            await run("ffmpeg", [
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                String(Math.max(0, clock.trimSeconds)),
                "-i",
                source,
                "-vf",
                `fps=${fps}`,
                "-frames:v",
                String(frames),
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "16",
                "-preset",
                "slow",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                screenVideo,
            ]);
            await run("ffmpeg", [
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                screenVideo,
                "-loop",
                "1",
                "-framerate",
                String(fps),
                "-i",
                geometry.alpha,
                "-loop",
                "1",
                "-framerate",
                String(fps),
                "-i",
                geometry.frame,
                "-filter_complex",
                `[0:v]format=rgb24[screen];[1:v]format=gray[mask];[screen][mask]alphamerge[cut];[2:v]format=rgba[frame];[frame][cut]overlay=${geometry.screen.x}:${geometry.screen.y}:format=auto,format=yuva420p[out]`,
                "-map",
                "[out]",
                "-frames:v",
                String(frames),
                "-r",
                String(fps),
                "-an",
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                "18",
                "-row-mt",
                "1",
                "-cpu-used",
                "4",
                "-pix_fmt",
                "yuva420p",
                join(output, "phone-bezel.webm"),
            ]);
            await sharp(geometry.frame).toFile(join(output, "phone-frame.png"));
            await writeFile(
                join(output, "phone-timing.json"),
                JSON.stringify(
                    {
                        fps,
                        frames,
                        duration: frames / fps,
                        startTogetherAt: 0,
                        cues,
                        screen: { width: 1206, height: 2622 },
                        bezel: geometry.screen,
                        bezelCanvas: { width: geometry.width, height: geometry.height },
                        framing: geometry.framing,
                    },
                    null,
                    2,
                ),
            );
        },
    };
}
