# Third-party notices

`src/dither/` contains an adapted subset of [Dither Kit](https://github.com/Boring-Software-Inc/dither-kit), by Boring Software Inc., pinned at commit `1e7faee9aa252e499651e6736ed65f7a07d9a6bd`.

The source repository declares **MIT** in its `package.json` at that commit, but includes no LICENSE file. Each ported source file records “MIT per its package.json.” The original files are under `registry/dither-kit/`: `chart-context.tsx`, `cartesian-root.tsx`, `cartesian-canvas.tsx`, `dither-paint.ts`, `scales.ts`, `palette.ts`, `area-chart.tsx`, `area.tsx`, `tooltip.tsx`, and `sparkline.tsx`.

The port preserves the ordered Bayer dither and area painter. Happy supplies typed series, theme colors, local scale and monotone interpolation, finite animation, shared visibility/resize observers, and accessible scrubbing. Registry installation, telemetry, bloom, continuous sparkles, unrelated charts, and external animation/geometry dependencies are omitted.
