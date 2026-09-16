import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

/*
 * The last pass: composed frames into a file anyone can post.
 *
 * H.264 in yuv420p with faststart, because that is the one combination every
 * browser, every timeline, and every social upload accepts without
 * re-encoding it themselves and undoing the work above. The fades live in the
 * composed frames (in linear light); the encoder adds nothing but the codec.
 *
 * The composed JPEG frames are full-range BT.601. Browsers assume a limited
 * range BT.709 H.264 stream and decode a full-range one about fourteen levels
 * too dark, so the conversion happens here, once, and the stream is tagged.
 */
const colourConversion = [
    "scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int",
    "format=yuv420p",
    "setparams=range=tv:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709",
].join(",");

export async function encode(options) {
    const seconds = options.frames / options.fps;
    const argv = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        ...(options.numbered
            ? ["-framerate", String(options.fps), "-i", join(dirname(options.listing), "f%06d.jpg")]
            : ["-f", "concat", "-safe", "0", "-i", options.listing]),
        ...(options.soundtrack ? ["-i", options.soundtrack] : []),
        "-vf",
        `fps=${options.fps},${colourConversion}`,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-frames:v",
        String(options.frames),
        ...(options.soundtrack ? ["-c:a", "aac", "-b:a", "160k", "-shortest"] : []),
        "-movflags",
        "+faststart",
        options.target,
    ];
    await new Promise((settle, fail) => {
        const child = spawn("ffmpeg", argv, { stdio: ["ignore", "inherit", "inherit"] });
        child.once("error", fail);
        child.once("exit", (code) =>
            code === 0 ? settle() : fail(new Error(`ffmpeg exited with ${code}.`)),
        );
    });
    return { seconds };
}
