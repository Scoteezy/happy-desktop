import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { testDepthBrowsers, testDepthRead } from "./sources/testDepth.js";

const depth = testDepthRead(process.env.HAPPY_TEST_DEPTH);

export default defineConfig({
    define: { "import.meta.env.HAPPY_TEST_DEPTH": JSON.stringify(depth) },
    test: {
        include: ["tests/playwright/**/*.test.ts"],
        // Retina pixel sweeps run in three browsers at once and can exceed
        // Vitest's 15s default when other local browser suites share the host.
        testTimeout: 30_000,
        browser: {
            enabled: true,
            headless: true,
            instances: testDepthBrowsers(depth).map((browser) => ({ browser })),
            provider: playwright({
                contextOptions: {
                    deviceScaleFactor: 2,
                    viewport: {
                        height: 900,
                        width: 900,
                    },
                },
            }),
            ui: false,
            viewport: {
                height: 800,
                width: 800,
            },
        },
    },
});
