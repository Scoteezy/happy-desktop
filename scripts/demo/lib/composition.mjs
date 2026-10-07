import { spawn, execFile as exec } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { encode } from "./encode.mjs";

/*
 * Stages an already recorded take: the desktop movie and its synchronized
 * phone movie, composed onto a backdrop as one delivered shot.
 *
 * Nothing here re-records or retimes anything. Both movies are decoded in
 * lockstep from frame zero, so frame i of the output is frame i of each
 * source — the take's one shared clock. The phone's movement is a pure
 * function of that clock and the take's own focus cues.
 *
 * Static layers (backdrop, window shadow, window trim, phone shadow) are built
 * once. A frame is then the desktop laid into the window hole, the backdrop
 * overlay dropped over it, and the phone — screen, bezel, and shadow, resized
 * once from its full-resolution composite — placed on top.
 */

const execFile = promisify(exec);
const workspace = resolve(import.meta.dirname, "../../..");
const rootRequire = createRequire(resolve(workspace, "package.json"));
const sharp = rootRequire("sharp");

/** The decoder's half of encode.mjs's contract: limited BT.709 in, full-range RGB out. */
const decodeColour =
    "flags=lanczos+accurate_rnd+full_chroma_int:in_range=tv:in_color_matrix=bt709:out_range=pc";

/** CSS cubic-bezier(x1, y1, x2, y2), solved for y at x by bisection. */
function cubicBezier([x1, y1, x2, y2]) {
    const curve = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let low = 0;
        let high = 1;
        for (let step = 0; step < 40; step += 1) {
            const middle = (low + high) / 2;
            if (curve(x1, x2, middle) < x) low = middle;
            else high = middle;
        }
        return curve(y1, y2, (low + high) / 2);
    };
}

async function probe(file) {
    const { stdout } = await execFile("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height,r_frame_rate,nb_frames",
        "-of",
        "json",
        file,
    ]);
    const streams = JSON.parse(stdout).streams;
    const video = streams.find((stream) => stream.codec_type === "video");
    if (!video) throw new Error(`${file} has no video stream.`);
    return { video, audio: streams.some((stream) => stream.codec_type === "audio") };
}

/** One decoder, yielding exact raw RGB frames resampled onto the output clock. */
function decoderOpen(file, filter, size) {
    const argv = ["-hide_banner", "-loglevel", "error", "-i", file, "-an", "-vf", filter];
    argv.push("-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
    const child = spawn("ffmpeg", argv, { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.pause();
    const exit = new Promise((settle, fail) => {
        child.once("error", fail);
        child.once("exit", (code) =>
            code === 0 ? settle() : fail(new Error(`ffmpeg decoding ${file} exited ${code}.`)),
        );
    });
    exit.catch(() => {});
    // Frames are copied into one preallocated buffer each; concatenating
    // 64 KiB chunks into a 9 MB phone frame would be quadratic.
    async function* frames() {
        let frame = Buffer.allocUnsafe(size);
        let filled = 0;
        for await (const chunk of child.stdout) {
            let offset = 0;
            while (offset < chunk.length) {
                const count = Math.min(size - filled, chunk.length - offset);
                chunk.copy(frame, filled, offset, offset + count);
                filled += count;
                offset += count;
                if (filled === size) {
                    yield frame;
                    frame = Buffer.allocUnsafe(size);
                    filled = 0;
                }
            }
        }
        await exit;
        if (filled !== 0) throw new Error(`${file} ended inside a frame.`);
    }
    return { frames: frames(), kill: () => child.kill("SIGKILL") };
}

const svg = (width, height, body) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
    );

/** A blurred silhouette: the cheapest believable soft shadow, and the most predictable one. */
async function shadow(width, height, body, sigma) {
    return sharp(svg(width, height, body))
        .blur(sigma)
        .png()
        .toBuffer();
}

/**
 * Backdrop with the desktop's shadow, and the window knocked out of it, plus
 * the trim drawn over the window's edge after the desktop is laid in.
 */
async function desktopLayersBuild(composition, directory) {
    const { output, desktop } = composition;
    const backdropSource = resolve(directory, composition.backdrop.source);
    // The photograph is softened just past its own grain: it sits behind the
    // work, and grain is the one thing in this frame that costs bits every
    // frame without telling the viewer anything.
    const backdrop = await sharp(backdropSource)
        .resize(output.width, output.height, { fit: "cover", kernel: "lanczos3" })
        .blur(composition.backdrop.blur)
        .png()
        .toBuffer();
    const radius = (desktop.cssRadius * desktop.width) / desktop.cssWidth;
    const rectangle = (inset, dy, fill) =>
        `<rect x="${desktop.x - inset}" y="${desktop.y - inset + dy}" width="${desktop.width + inset * 2}" height="${desktop.height + inset * 2}" rx="${radius + inset}" fill="${fill}"/>`;
    // An ambient shadow that lifts the window off the photograph, and a
    // contact shadow that keeps its edge from floating.
    const ambient = await shadow(
        output.width,
        output.height,
        rectangle(8, 30, "rgba(0,0,0,0.55)"),
        34,
    );
    const contact = await shadow(
        output.width,
        output.height,
        rectangle(1, 3, "rgba(0,0,0,0.5)"),
        4,
    );
    const overlay = await sharp(backdrop)
        .composite([
            { input: ambient },
            { input: contact },
            { blend: "dest-out", input: svg(output.width, output.height, rectangle(0, 0, "#000")) },
        ])
        .png()
        .toBuffer();
    // A dark outer hairline, then the website's light inner one.
    const trim = svg(
        output.width,
        output.height,
        `<rect x="${desktop.x - 0.5}" y="${desktop.y - 0.5}" width="${desktop.width + 1}" height="${desktop.height + 1}" rx="${radius + 0.5}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
         <rect x="${desktop.x + 0.75}" y="${desktop.y + 0.75}" width="${desktop.width - 1.5}" height="${desktop.height - 1.5}" rx="${radius - 0.75}" fill="none" stroke="rgba(255,255,255,0.17)" stroke-width="1.5"/>`,
    );
    return { overlay, trim: await sharp(trim).png().toBuffer() };
}

/**
 * The bezel artwork and its screen mask at their own full resolution, so each
 * frame's handset is resampled exactly once, and its shadow at the focused
 * output size, where a soft blur loses nothing by being resized.
 */
async function phoneLayersBuild(composition, directory) {
    const { phone } = composition;
    const frame = resolve(directory, phone.frame);
    const { width, height } = await sharp(frame).metadata();
    const alpha = await sharp(resolve(directory, phone.alpha)).extractChannel(0).raw().toBuffer();
    // The bezel's inner edge and the screen mask are both anti-aliased on the
    // same boundary; where both are half transparent the backdrop would show
    // through as a hairline. A black underlay grown a few pixels under the
    // bezel closes it without moving the artwork.
    const underlay = await sharp(resolve(directory, phone.alpha))
        .extractChannel(0)
        .blur(3)
        .linear(4, 0)
        .raw()
        .toBuffer();
    const black = Buffer.alloc(phone.screen.width * phone.screen.height * 3);
    const underlayRgba = await sharp(black, {
        raw: { width: phone.screen.width, height: phone.screen.height, channels: 3 },
    })
        .joinChannel(underlay, {
            raw: { width: phone.screen.width, height: phone.screen.height, channels: 1 },
        })
        .png()
        .toBuffer();
    const bezel = await sharp(frame).png().toBuffer();
    const focusedWidth = phone.width * phone.focusScale;
    const scale = focusedWidth / width;
    const pad = Math.ceil(80 * phone.focusScale);
    const focused = { width: Math.round(focusedWidth), height: Math.round(height * scale) };
    const silhouette = await sharp(frame)
        .resize(focused.width, focused.height)
        .extractChannel(3)
        .raw()
        .toBuffer();
    const shadowBlack = (opacity) =>
        sharp(Buffer.alloc(focused.width * focused.height * 3), {
            raw: { width: focused.width, height: focused.height, channels: 3 },
        })
            .joinChannel(Buffer.from(silhouette.map((value) => Math.round(value * opacity))), {
                raw: { width: focused.width, height: focused.height, channels: 1 },
            })
            .png()
            .toBuffer();
    const canvas = { width: focused.width + pad * 2, height: focused.height + pad * 2 };
    const empty = { create: { ...canvas, channels: 4, background: "#00000000" } };
    const ambient = await sharp(
        await sharp(empty)
            .composite([{ input: await shadowBlack(0.6), left: pad, top: pad + 22 }])
            .png()
            .toBuffer(),
    )
        .blur(24)
        .png()
        .toBuffer();
    const contact = await sharp(
        await sharp(empty)
            .composite([{ input: await shadowBlack(0.45), left: pad, top: pad + 3 }])
            .png()
            .toBuffer(),
    )
        .blur(3)
        .png()
        .toBuffer();
    const phoneShadow = await sharp(ambient)
        .composite([{ input: contact }])
        .png()
        .toBuffer();
    return {
        alpha,
        bezel,
        canvas: { width, height },
        shadow: { image: phoneShadow, pad, focused },
        underlay: underlayRgba,
    };
}

/** Where the phone is at one instant: parked, focused, or easing between. */
function phonePose(composition, focus, seconds) {
    const { output, phone } = composition;
    const ease = cubicBezier(phone.transition.easing);
    const progress =
        seconds < focus.enter
            ? 0
            : seconds < focus.exit
              ? ease((seconds - focus.enter) / phone.transition.seconds)
              : 1 - ease((seconds - focus.exit) / phone.transition.seconds);
    const scale = 1 + (phone.focusScale - 1) * progress;
    // The website moves only the excess beyond the frame's right margin.
    const shift = Math.min(
        0,
        output.width - phone.left - phone.width * phone.focusScale - phone.focusMargin,
    );
    return { scale, left: phone.left + shift * progress, bottom: phone.bottom };
}

/** One output frame, from one desktop frame and the phone screen at the same instant. */
async function frameCompose({ composition, layers, desktopRgb, phoneRgb, seconds, focus }) {
    const { output, desktop, phone } = composition;
    const screen = phone.screen;
    const masked = await sharp(phoneRgb, {
        raw: { width: screen.width, height: screen.height, channels: 3 },
    })
        .joinChannel(layers.phone.alpha, {
            raw: { width: screen.width, height: screen.height, channels: 1 },
        })
        .png({ compressionLevel: 0 })
        .toBuffer();
    const handset = await sharp({
        create: { ...layers.phone.canvas, channels: 4, background: "#00000000" },
    })
        .composite([
            { input: layers.phone.underlay, left: screen.x, top: screen.y },
            { input: masked, left: screen.x, top: screen.y },
            { input: layers.phone.bezel },
        ])
        .png({ compressionLevel: 0 })
        .toBuffer();
    const pose = phonePose(composition, focus, seconds);
    const width = Math.round(phone.width * pose.scale);
    const height = Math.round((width * layers.phone.canvas.height) / layers.phone.canvas.width);
    const left = Math.round(pose.left);
    const top = Math.round(pose.bottom - height);
    const handsetScaled = await sharp(handset)
        .resize(width, height, { kernel: "lanczos3" })
        .png({ compressionLevel: 0 })
        .toBuffer();
    const { shadow } = layers.phone;
    const shadowScale = width / shadow.focused.width;
    const shadowWidth = Math.round((shadow.focused.width + shadow.pad * 2) * shadowScale);
    const shadowHeight = Math.round((shadow.focused.height + shadow.pad * 2) * shadowScale);
    const shadowScaled = await sharp(shadow.image).resize(shadowWidth, shadowHeight).toBuffer();
    // Sharp clips a layer at the canvas edge only if it starts inside it; the
    // parked phone deliberately runs off the right edge, so crop it first.
    const placed = async (input, x, y, w, h) => {
        const visibleWidth = Math.min(w, output.width - x) - Math.max(0, -x);
        const visibleHeight = Math.min(h, output.height - y) - Math.max(0, -y);
        if (visibleWidth <= 0 || visibleHeight <= 0) return [];
        return [
            {
                input: await sharp(input)
                    .extract({
                        left: Math.max(0, -x),
                        top: Math.max(0, -y),
                        width: visibleWidth,
                        height: visibleHeight,
                    })
                    .toBuffer(),
                left: Math.max(0, x),
                top: Math.max(0, y),
            },
        ];
    };
    const shadowLeft = Math.round(left - shadow.pad * shadowScale);
    const shadowTop = Math.round(top - shadow.pad * shadowScale);
    return sharp({
        create: { width: output.width, height: output.height, channels: 3, background: "#000" },
    }).composite([
        {
            input: desktopRgb,
            raw: { width: desktop.width, height: desktop.height, channels: 3 },
            left: desktop.x,
            top: desktop.y,
        },
        { input: layers.desktop.overlay },
        { input: layers.desktop.trim },
        ...(await placed(shadowScaled, shadowLeft, shadowTop, shadowWidth, shadowHeight)),
        ...(await placed(handsetScaled, left, top, width, height)),
    ]);
}

function focusRead(cues) {
    const at = (name) => {
        const cue = cues.find((entry) => entry.name === name);
        if (!cue) throw new Error(`The cues have no "${name}" cue.`);
        return cue.seconds;
    };
    const focus = { enter: at("phone-enter"), exit: at("phone-exit") };
    if (!(focus.exit > focus.enter)) throw new Error("phone-exit must follow phone-enter.");
    return focus;
}

/**
 * Renders a composition end to end: decode both takes in lockstep, compose,
 * encode, and refuse a result above the composition's size ceiling.
 */
export async function compositionRender({ composition, directory, desktop, phone, cues, out }) {
    const started = Date.now();
    const { output } = composition;
    const focus = focusRead(JSON.parse(await readFile(cues, "utf8")));
    const [desktopInfo, phoneInfo] = await Promise.all([probe(desktop), probe(phone)]);
    if (desktopInfo.video.r_frame_rate !== phoneInfo.video.r_frame_rate)
        throw new Error("The desktop and phone takes must share one frame rate.");
    if (
        phoneInfo.video.width !== composition.phone.screen.width ||
        phoneInfo.video.height !== composition.phone.screen.height
    )
        throw new Error(
            `The phone take must be the ${composition.phone.screen.width}×${composition.phone.screen.height} screen.`,
        );
    const work = join(out, ".work", composition.id);
    const composed = join(work, "composed");
    await rm(work, { force: true, recursive: true });
    await mkdir(composed, { recursive: true });

    process.stdout.write(`\n  ${composition.title}\n`);
    const layers = {
        desktop: await desktopLayersBuild(composition, directory),
        phone: await phoneLayersBuild(composition, directory),
    };
    const { width: desktopWidth, height: desktopHeight } = composition.desktop;
    const desktopDecoder = decoderOpen(
        desktop,
        `fps=${output.fps},scale=${desktopWidth}:${desktopHeight}:${decodeColour},format=rgb24`,
        desktopWidth * desktopHeight * 3,
    );
    const { width: screenWidth, height: screenHeight } = composition.phone.screen;
    const phoneDecoder = decoderOpen(
        phone,
        `fps=${output.fps},scale=${screenWidth}:${screenHeight}:${decodeColour},format=rgb24`,
        screenWidth * screenHeight * 3,
    );
    const posterFrame = Math.round(composition.poster.seconds * output.fps);
    const poster = join(out, `${composition.id}.poster.png`);
    const inFlight = new Set();
    let frames = 0;
    try {
        for (;;) {
            const [desktopNext, phoneNext] = await Promise.all([
                desktopDecoder.frames.next(),
                phoneDecoder.frames.next(),
            ]);
            if (desktopNext.done !== phoneNext.done)
                throw new Error(
                    "The desktop and phone takes end on different frames; they are not one timeline.",
                );
            if (desktopNext.done) break;
            const index = frames;
            frames += 1;
            const job = (async () => {
                const frame = await frameCompose({
                    composition,
                    layers,
                    desktopRgb: desktopNext.value,
                    phoneRgb: phoneNext.value,
                    seconds: index / output.fps,
                    focus,
                });
                const { data, info } = await frame.raw().toBuffer({ resolveWithObject: true });
                if (index === posterFrame) await sharp(data, { raw: info }).png().toFile(poster);
                await sharp(data, { raw: info })
                    .jpeg({ chromaSubsampling: "4:4:4", quality: 95 })
                    .toFile(join(composed, `f${String(index).padStart(6, "0")}.jpg`));
            })();
            const tracked = job.finally(() => inFlight.delete(tracked));
            inFlight.add(tracked);
            if (inFlight.size >= 6) await Promise.race(inFlight);
            if (frames % 25 === 0) process.stdout.write(`\r    composing ${frames} frames`);
        }
        await Promise.all(inFlight);
    } catch (error) {
        desktopDecoder.kill();
        phoneDecoder.kill();
        await Promise.allSettled(inFlight);
        throw error;
    }
    process.stdout.write(`\r    composing ${frames} frames — done\n`);
    if (posterFrame >= frames) throw new Error("The poster instant is past the end of the take.");

    // The desktop take carries the recorded soundtrack; the phone is silent.
    let soundtrack;
    if (desktopInfo.audio) {
        soundtrack = join(work, "soundtrack.wav");
        await execFile("ffmpeg", ["-y", "-v", "error", "-i", desktop, "-vn", soundtrack]);
    }
    const target = join(out, `${composition.id}.mp4`);
    const { crf, preset, audioBitrate, maximumBytes } = composition.encode;
    const { seconds } = await encode({
        audioBitrate,
        crf,
        fps: output.fps,
        frames,
        // A numbered encode reads f%06d.jpg from the listing's directory.
        listing: join(composed, "frames.txt"),
        numbered: true,
        preset,
        soundtrack,
        target,
    });
    const { size } = await stat(target);
    await writeFile(
        join(out, `${composition.id}.json`),
        JSON.stringify({ desktop, phone, cues, focus, frames, seconds, bytes: size }, null, 2) +
            "\n",
    );
    if (size > maximumBytes)
        throw new Error(
            `${target} is ${size} bytes, above the ${maximumBytes}-byte ceiling; raise the CRF.`,
        );
    await rm(work, { force: true, recursive: true });
    process.stdout.write(
        `    ${target}  (${seconds.toFixed(1)}s, ${(size / 1e6).toFixed(2)} MB, took ${((Date.now() - started) / 1000).toFixed(0)}s)\n    ${poster}\n`,
    );
    return target;
}
