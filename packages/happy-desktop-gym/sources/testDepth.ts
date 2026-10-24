export type TestDepth = "cheap" | "full";

/** One release-validation budget, shared by browser suites and Electron gyms. */
export function testDepthRead(value: string | undefined): TestDepth {
    if (value === undefined || value === "cheap") return "cheap";
    if (value === "full") return "full";
    throw new Error(`Invalid HAPPY_TEST_DEPTH=${JSON.stringify(value)}; expected cheap or full.`);
}

export function testDepthBrowsers(depth: TestDepth): ("chromium" | "firefox" | "webkit")[] {
    return depth === "full" ? ["chromium", "firefox", "webkit"] : ["chromium", "firefox"];
}
