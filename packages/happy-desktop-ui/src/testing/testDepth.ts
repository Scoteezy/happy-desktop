import { testDepthRead } from "happy-desktop-gym/test-depth";

// Vite injects the validated value, including for direct `vitest run` invocations.
export const testDepth = testDepthRead(import.meta.env.HAPPY_TEST_DEPTH);
export const testDepthCount = (cheap: number, full: number) =>
    testDepth === "full" ? full : cheap;
