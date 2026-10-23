import type { StemCellEngineOptions } from "./stemCellEngine";

/** Whether this machine can draw the growth, asked of the worker once per session. */
export type StemCellSupport =
    | { readonly supported: true; readonly renderer: string; readonly accelerated: boolean }
    | { readonly supported: false; readonly reason: string };

/** How one growth ended. */
export type StemCellPlayResult =
    | {
          readonly played: true;
          readonly cells: number;
          readonly generations: number;
          readonly frames: number;
          readonly cpuMsPerFrame: number;
          readonly worstCpuMs: number;
          readonly wallMs: number;
      }
    | { readonly played: false; readonly reason: string };

export type StemCellWorkerRequest =
    | { readonly type: "probe"; readonly requestId: number; readonly allowSoftware: boolean }
    | {
          readonly type: "play";
          readonly runId: number;
          readonly canvas: OffscreenCanvas;
          readonly bitmap: ImageBitmap;
          /** Ms on the waiting cell's drift clock, to start in phase with it. */
          readonly clock: number;
          readonly options: StemCellEngineOptions;
      }
    | { readonly type: "dispose"; readonly runId: number };

export type StemCellWorkerReply =
    | { readonly type: "probe"; readonly requestId: number; readonly support: StemCellSupport }
    /** The first frame is on the canvas, so the SVG under it can go. */
    | { readonly type: "started"; readonly runId: number }
    | { readonly type: "end"; readonly runId: number; readonly result: StemCellPlayResult };
