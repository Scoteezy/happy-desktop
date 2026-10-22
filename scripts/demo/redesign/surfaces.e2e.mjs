// Run inside .context/demo/stack.sh --vite after restoring the redesign seed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
const { ok, until } = await import(join(process.env.DEMO, "api.mjs"));
const require = createRequire(join(process.env.DESKTOP, "packages/happy-desktop-ui/package.json"));
const { chromium } = require("playwright");
let context, page;
const row = (name) =>
    page
        .locator('[data-happy-desktop-ui="sidebar-item"]')
        .filter({
            has: page.locator('[data-happy-desktop-ui="sidebar-item-label"]', {
                hasText: new RegExp(`^${name}$`),
            }),
        })
        .first();
before(async () => {
    await ok("POST", "/v0/surfaces", { type: "todo", name: "Empty fixture" });
    await ok("POST", "/v0/surfaces", { type: "system_monitor", name: "Monitor fixture" });
    context = await chromium.launchPersistentContext(join(process.env.DEMO, "profile"), {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "dark",
    });
    await context.addInitScript(() =>
        localStorage.setItem(
            "happy.experiments.v1",
            JSON.stringify({ spacesSidebar: true, stemCells: true, batchNotes: true }),
        ),
    );
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5199/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await until(
        async () => {
            if (
                await row("Release checklist")
                    .isVisible()
                    .catch(() => false)
            )
                return true;
            const next = page
                .getByRole("button", { name: /Go Happy|Continue|Get started|Skip/ })
                .first();
            if (await next.isVisible().catch(() => false)) await next.click();
        },
        "demo browser to finish its first-run intro",
        60000,
    );
    await row("Release checklist").waitFor({ timeout: 60000 });
});
after(async () => {
    await context?.close();
});
test("joined useful Surfaces appear; empty lists and monitors do not", async () => {
    for (const name of ["Release checklist", "Design notes", "Team calendar"])
        assert.ok(await row(name).isVisible(), name);
    assert.equal(await row("Empty fixture").count(), 0);
    assert.equal(await row("Monitor fixture").count(), 0);
});
test("the checklist opens its real todos", async () => {
    await row("Release checklist").click();
    await page
        .getByText("Kirill · Verify the Windows signing certificate before Friday", { exact: true })
        .waitFor();
});
test("the document opens its persisted content", async () => {
    await row("Design notes").click();
    await page
        .getByText("Keep the three header lanes stable while the sidebar and right pane change.", {
            exact: true,
        })
        .waitFor();
});
test("the calendar opens its real event", async () => {
    await row("Team calendar").click();
    await page.getByText("Preview release go/no-go", { exact: true }).first().waitFor();
});
test("a Surface drags across sections and leaves through its menu", async () => {
    const spaces = (await ok("GET", "/v0/spaces")).spaces;
    const notes = spaces.find((space) => space.title === "Design notes");
    assert.equal(notes.target.kind, "surface");
    await row("Reviewer history access").scrollIntoViewIfNeeded();
    await row("Design notes").scrollIntoViewIfNeeded();
    const a = await row("Design notes").boundingBox();
    const b = await row("Reviewer history access").boundingBox();
    await page.mouse.move(a.x + 70, a.y + 16);
    await page.mouse.down();
    await page.mouse.move(a.x + 70, a.y + 24, { steps: 4 });
    await page.mouse.move(a.x + 70, b.y + 2, { steps: 30 });
    await page.mouse.up();
    await until(async () => {
        const { html } = await ok("GET", "/v0/spaces/sidebar");
        const section = html.match(
            /<happy-section[^>]*id="agent"[^>]*>([\s\S]*?)<\/happy-section>/,
        )?.[1];
        return section?.includes(`ref="${notes.id}"`) || undefined;
    }, "Surface to move into Agent");
    await row("Design notes").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Leave", exact: true }).click();
    await row("Design notes").waitFor({ state: "hidden" });
    await until(
        async () =>
            !(await ok("GET", "/v0/spaces")).spaces.some((space) => space.id === notes.id) ||
            undefined,
        "Surface Space to leave",
    );
    const catalog = (await ok("GET", "/v0/surfaces")).surfaces;
    assert.ok(
        catalog.some((surface) => surface.id === notes.target.id),
        "Leaving keeps the shared document",
    );
});
