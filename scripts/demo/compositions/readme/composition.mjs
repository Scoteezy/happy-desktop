/*
 * The README movie: the recorded desktop window and its synchronized phone on
 * one photographic backdrop, staged the way the website's player stages them.
 *
 * The desktop is centered with a macOS-style window shadow. The phone parks
 * beside it, its right edge running off the frame, and during the take's
 * phone-focus cues it grows by the website's 1.18 and slides left only far
 * enough to keep its right bezel inside the frame, with the website's 850ms
 * cubic-bezier(.22,.8,.24,1) transition. It may overlap the desktop.
 *
 * Geometry is in output pixels. The desktop's corner radius is 14 recorded
 * CSS pixels of its 780-pixel-wide app, like the website's window.
 */
export default {
    id: "readme",
    title: "README: desktop with the paired phone",
    output: { width: 1920, height: 1080, fps: 60 },
    backdrop: { source: "backdrop.jpg", blur: 1.2 },
    desktop: { x: 406, y: 52, width: 1109, height: 944, cssWidth: 780, cssRadius: 14 },
    phone: {
        frame: "../../demos/core/assets/device/iphone-16-pro-black.png",
        alpha: "../../demos/core/assets/device/screen-alpha.png",
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
        width: 414,
        left: 1620,
        bottom: 1016,
        focusScale: 1.18,
        focusMargin: 14,
        transition: { seconds: 0.85, easing: [0.22, 0.8, 0.24, 1] },
    },
    cues: "cues.json",
    poster: { seconds: 6 },
    encode: { crf: 18, preset: "veryslow", audioBitrate: "96k", maximumBytes: 10_000_000 },
};
