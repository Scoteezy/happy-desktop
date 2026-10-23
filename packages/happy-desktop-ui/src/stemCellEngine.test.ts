import { expect, it } from "vitest";
import { stemCellGrowthGate, stemCellSupportOf } from "./stemCellGate";
import {
    STEM_CELL_VARIANTS,
    stemCellModel,
    stemCellRendererSoftware,
    stemCellTimeline,
    stemCellVariantFor,
} from "./stemCellEngine";
import { stemCellGeometry } from "./stemCellGeometry";

const TAU = Math.PI * 2;
const ids = ["window-navigation", "release-note-ideas", "shortcut-ideas", "", "a", "ckx9z2"];

it("draws the same cell as the SVG's samples", () => {
    for (const id of ids) {
        const model = stemCellModel(id);
        const geometry = stemCellGeometry(id);
        const h = model.harmonics;
        const c = model.core;
        for (let i = 0; i < 32; i++) {
            const t = (i / 32) * TAU;
            const membrane =
                1 +
                h.a1 * Math.cos(h.L * t + h.p1) +
                h.a2 * Math.cos(2 * h.L * t + 2 * h.p1) +
                h.a3 * Math.cos((h.L - 1) * t + h.p3) +
                h.a4 * Math.cos((h.L + 1) * t + h.p4) +
                h.a5 * Math.cos(t + h.p5);
            const core = 1 + c.a2 * Math.cos(2 * t + c.p2) + c.a3 * Math.cos(3 * t + c.p3);
            const [mx, my] = geometry.membrane[i]!;
            const [cx, cy] = geometry.core[i]!;
            expect(Math.abs(model.x + Math.cos(t) * model.r * membrane - mx)).toBeLessThan(1e-6);
            expect(Math.abs(model.y + Math.sin(t) * model.r * membrane - my)).toBeLessThan(1e-6);
            expect(Math.abs(c.x + Math.cos(t) * c.r * core - cx)).toBeLessThan(1e-6);
            expect(Math.abs(c.y + Math.sin(t) * c.r * core - cy)).toBeLessThan(1e-6);
        }
    }
});

it("fits every division into the first 62% of 2.5 s and converges in the rest", () => {
    for (const variant of Object.values(STEM_CELL_VARIANTS)) {
        for (const depth of [1, 2, variant.generations]) {
            const timeline = stemCellTimeline(depth, variant.total);
            expect(timeline.end).toBe(2500);
            expect(timeline.intro).toBeCloseTo(100, 9);
            expect(timeline.divisionsEnd).toBeCloseTo(1550, 9);
            expect(timeline.starts).toHaveLength(depth);
            expect(timeline.starts[0]).toBeCloseTo(timeline.intro, 9);
            const lastEnd = timeline.starts.at(-1)! + timeline.durs.at(-1)!;
            expect(lastEnd).toBeCloseTo(timeline.divisionsEnd, 9);
            expect(timeline.durs.reduce((sum, d) => sum + d, 0)).toBeCloseTo(1450, 9);
            for (let g = 1; g < depth; g++)
                expect(timeline.starts[g]).toBeCloseTo(
                    timeline.starts[g - 1]! + timeline.durs[g - 1]!,
                    9,
                );
            // The first cleavage, the one people actually see, gets the most room.
            for (const d of timeline.durs.slice(1)) expect(d).toBeLessThan(timeline.durs[0]!);
        }
    }
});

it("divides into 8 cells in a 20px lane and 16 where the mark has room", () => {
    expect(stemCellVariantFor(16)).toBe(STEM_CELL_VARIANTS.eight);
    expect(stemCellVariantFor(20)).toBe(STEM_CELL_VARIANTS.eight);
    expect(stemCellVariantFor(32)).toBe(STEM_CELL_VARIANTS.eight);
    expect(stemCellVariantFor(33)).toBe(STEM_CELL_VARIANTS.sixteen);
    expect(stemCellVariantFor(64)).toBe(STEM_CELL_VARIANTS.sixteen);
    expect(STEM_CELL_VARIANTS.eight.generations).toBe(3);
    expect(STEM_CELL_VARIANTS.sixteen.generations).toBe(4);
});

it("names CPU rasterisers as software and real GPUs as not", () => {
    for (const renderer of [
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
        "Google SwiftShader",
        "llvmpipe (LLVM 15.0.7, 256 bits)",
        "softpipe",
        "Software Rasterizer",
        "Microsoft Basic Render Driver",
        "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "Mesa OffScreen",
    ])
        expect(stemCellRendererSoftware(renderer), renderer).toBe(true);
    for (const renderer of [
        "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)",
        "Apple GPU",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "Mesa Intel(R) UHD Graphics 620 (KBL GT2)",
        "AMD Radeon Pro 5500M OpenGL Engine",
        "",
    ])
        expect(stemCellRendererSoftware(renderer), renderer).toBe(false);
});

it("plays only with an OffscreenCanvas and a hardware WebGL2 context", () => {
    const gpu = { accelerated: true, renderer: "Apple GPU" };
    const cpu = { accelerated: false, renderer: "llvmpipe" };
    expect(stemCellSupportOf({ offscreenCanvas: false, webgl2: gpu, allowSoftware: true })).toEqual(
        { supported: false, reason: "No OffscreenCanvas" },
    );
    expect(stemCellSupportOf({ offscreenCanvas: true, webgl2: null, allowSoftware: true })).toEqual(
        { supported: false, reason: "No hardware WebGL2" },
    );
    expect(stemCellSupportOf({ offscreenCanvas: true, webgl2: cpu, allowSoftware: false })).toEqual(
        { supported: false, reason: "Software renderer: llvmpipe" },
    );
    expect(stemCellSupportOf({ offscreenCanvas: true, webgl2: cpu, allowSoftware: true })).toEqual({
        supported: true,
        renderer: "llvmpipe",
        accelerated: false,
    });
    expect(stemCellSupportOf({ offscreenCanvas: true, webgl2: gpu, allowSoftware: false })).toEqual(
        { supported: true, renderer: "Apple GPU", accelerated: true },
    );
});

it("shows the icon at once unless the setting, motion, and GPU all allow the growth", () => {
    const supported = { supported: true, renderer: "Apple GPU", accelerated: true } as const;
    const unsupported = { supported: false, reason: "No hardware WebGL2" } as const;
    expect(stemCellGrowthGate({ enabled: true, reducedMotion: false, support: supported })).toEqual(
        { kind: "play" },
    );
    expect(
        stemCellGrowthGate({ enabled: false, reducedMotion: false, support: supported }),
    ).toEqual({ kind: "skip", reason: "setting" });
    expect(stemCellGrowthGate({ enabled: true, reducedMotion: true, support: supported })).toEqual({
        kind: "skip",
        reason: "reducedMotion",
    });
    expect(
        stemCellGrowthGate({ enabled: true, reducedMotion: false, support: unsupported }),
    ).toEqual({ kind: "skip", reason: "unsupported" });
    // The worker has not answered yet: the stem cell stays up while it is asked.
    expect(stemCellGrowthGate({ enabled: true, reducedMotion: false, support: undefined })).toEqual(
        { kind: "probe" },
    );
    // Neither the setting nor reduced motion waits for the worker.
    expect(
        stemCellGrowthGate({ enabled: false, reducedMotion: false, support: undefined }),
    ).toEqual({ kind: "skip", reason: "setting" });
    expect(stemCellGrowthGate({ enabled: true, reducedMotion: true, support: undefined })).toEqual({
        kind: "skip",
        reason: "reducedMotion",
    });
});
