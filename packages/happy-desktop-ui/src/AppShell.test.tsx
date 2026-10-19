import "./styles.css";
import type { CSSProperties } from "react";
import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import { AppShell } from "./AppShell";
import { Button } from "./Button";
import { ChannelHeader } from "./ChannelHeader";
import { Sidebar } from "./Sidebar";
import { TabbedPane } from "./TabbedPane";
import { createRenderer } from "./testing";

function slot(id: string, style: CSSProperties) {
    return <div data-testid={id} style={{ height: "100%", width: "100%", ...style }} />;
}

function appRegion(element: Element): string {
    const style = getComputedStyle(element);
    return style.getPropertyValue("app-region") || style.getPropertyValue("-webkit-app-region");
}

it("keeps both integrated tab strips underlined across pane focus in light and dark", async () => {
    const pane = (id: string) => (
        <TabbedPane
            data-testid={id}
            tabs={[
                { id: "active", label: "File" },
                { id: "inactive", label: "Longer document title" },
            ]}
            activeId="active"
            onSelect={() => undefined}
            onClose={() => undefined}
            closePresentation="overlay"
            tabSizing="content"
        >
            <button data-testid={`${id}-body`}>Focus {id}</button>
        </TabbedPane>
    );
    for (const theme of ["light", "dark"]) {
        const view = createRenderer().render(
            () => (
                <AppShell
                    className={`happy-theme-${theme}`}
                    navigationChrome="integrated"
                    panel={pane("panel")}
                >
                    {pane("main")}
                </AppShell>
            ),
            { height: 800, width: 1280 },
        );
        await view.ready();
        for (const focus of ["panel", "main"]) {
            await userEvent.click(view.$(`[data-testid="${focus}-body"]`).element);
            await expect
                .poll(() =>
                    view.$(".happy-desktop-app-shell").element.getAttribute("data-focused-pane"),
                )
                .toBe(focus === "panel" ? "panel" : "workspace");
            for (const id of ["main", "panel"]) {
                const root = `[data-testid="${id}"]`;
                const tab = view.$(`${root} [data-tab-id="active"]`);
                const inactive = view.$(`${root} [data-tab-id="inactive"]`);
                const underline = view.$(`${root} [data-happy-desktop-ui="tab-underline"]`);
                const band = view.$(`${root} .happy-tabbed-pane__bar`).bounds();
                const mark = underline.bounds();
                expect(mark.height).toBe(2);
                expect(mark.y + mark.height).toBe(band.y + band.height);
                expect(mark.width).toBe(tab.bounds().width);
                expect(mark.x).toBe(band.x);
                expect(underline.computedStyle("background-color")).toBe(
                    theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
                );
                await expect.poll(() => underline.computedStyle("opacity")).toBe("1");
                expect(
                    tab.computedStyles([
                        "background-color",
                        "border-width",
                        "border-radius",
                        "box-shadow",
                        "color",
                    ]),
                ).toEqual({
                    "background-color": "rgba(0, 0, 0, 0)",
                    "border-width": "0px",
                    "border-radius": "0px",
                    "box-shadow": "none",
                    color: theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
                });
                expect(inactive.bounds().width).toBeGreaterThan(tab.bounds().width);
                expect(inactive.computedStyle("color")).toBe(
                    theme === "light" ? "rgb(73, 69, 79)" : "rgb(202, 196, 208)",
                );
                const before = inactive.bounds();
                await userEvent.hover(inactive.element);
                await expect
                    .poll(() => inactive.computedStyle("color"))
                    .toBe(tab.computedStyle("color"));
                expect(inactive.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");
                expect(inactive.bounds()).toEqual(before);
            }
        }
        view.destroy();
    }
});

it("composes Happy's flat desktop shell with clamped navigation and inspector surfaces", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="shell"
                panel={slot("panel-slot", { background: "var(--surface)" })}
                rail={slot("rail-slot", {
                    background: "var(--header-background)",
                    width: "64px",
                })}
                sidebar={slot("sidebar-slot", {
                    background: "var(--groupped-background)",
                    width: "100%",
                })}
                titleBar={slot("title-slot", {
                    background: "var(--header-background)",
                    height: "56px",
                })}
            >
                {slot("workspace-slot", { background: "var(--surface)" })}
            </AppShell>
        ),
        { height: 800, width: 1280 },
    );

    await view.ready();

    const shell = view.$('[data-testid="shell"]');
    expect(shell.bounds()).toEqual({ height: 800, width: 1280, x: 0, y: 0 });
    expect(shell.computedStyles(["background-color", "min-height", "min-width"])).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "min-height": "640px",
        "min-width": "720px",
    });
    expect(view.$('[data-happy-desktop-ui="app-shell-title-bar"]').bounds()).toEqual({
        height: 56,
        width: 1280,
        x: 0,
        y: 0,
    });
    expect(view.$('[data-happy-desktop-ui="app-shell-rail"]').bounds()).toEqual({
        height: 744,
        width: 64,
        x: 0,
        y: 56,
    });
    expect(view.$('[data-happy-desktop-ui="app-shell-content"]').bounds()).toEqual({
        height: 744,
        width: 1216,
        x: 64,
        y: 56,
    });
    expect(view.$('[data-happy-desktop-ui="app-shell-main"]').bounds()).toEqual({
        height: 744,
        width: 856,
        x: 64,
        y: 56,
    });
    expect(view.$('[data-happy-desktop-ui="app-shell-sidebar"]').bounds()).toEqual({
        height: 744,
        width: 360,
        x: 64,
        y: 56,
    });
    expect(
        view
            .$('[data-happy-desktop-ui="app-shell-panel"]')
            .computedStyles(["border-left-width", "border-radius", "width"]),
    ).toEqual({
        "border-left-width": "1px",
        "border-radius": "0px",
        width: "360px",
    });
});

it("keeps a workspace-only shell flat and free of legacy card insets", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell
                data-testid="bare-shell"
                rail={slot("bare-rail", {
                    background: "var(--header-background)",
                    width: "64px",
                })}
                titleBar={slot("bare-title", {
                    background: "var(--header-background)",
                    height: "56px",
                })}
            >
                {slot("bare-workspace", { background: "var(--surface)" })}
            </AppShell>
        ),
        { height: 800, width: 1280 },
    );

    await view.ready();

    const main = view.$('[data-testid="bare-shell"] [data-happy-desktop-ui="app-shell-main"]');
    expect(main.bounds()).toEqual({ height: 744, width: 1216, x: 64, y: 56 });
    expect(main.computedStyles(["border-top-width", "border-radius", "padding-bottom"])).toEqual({
        "border-top-width": "0px",
        "border-radius": "0px",
        "padding-bottom": "0px",
    });
});

it("reserves macOS chrome and keeps real desktop header controls clickable", async () => {
    let memberClicks = 0;
    let searchClicks = 0;
    const view = createRenderer().render(
        () => (
            <AppShell
                sidebar={
                    <Sidebar
                        activeItemId="general"
                        brand
                        onItemSelect={() => undefined}
                        sections={[
                            {
                                id: "chats",
                                items: [
                                    {
                                        id: "general",
                                        kind: "channel",
                                        label: "General",
                                    },
                                ],
                            },
                        ]}
                    />
                }
                windowControls
            >
                <ChannelHeader
                    actions={
                        <Button
                            aria-label="Search"
                            icon="search"
                            iconOnly
                            onClick={() => searchClicks++}
                            size="small"
                            variant="ghost"
                        />
                    }
                    memberCount={3}
                    onMembersClick={() => memberClicks++}
                    title="Checks"
                />
            </AppShell>
        ),
        { height: 600, width: 900 },
    );

    await view.ready();

    expect(view.container.querySelector('[data-happy-desktop-ui="window-drag-region"]')).toBeNull();
    const sidebarHeader = view.$('[data-happy-desktop-ui="sidebar-header"]');
    const logo = view.$('[data-happy-desktop-ui="sidebar-brand-logo"]');
    const channelHeader = view.$('[data-happy-desktop-ui="channel-header"]');
    const members = view.$('[data-happy-desktop-ui="channel-header-members"]');
    const search = view.$('button[aria-label="Search"]');
    // The heading clears the native lights (x=14…68) with 16px trailing
    // clearance. A supplied collapse toggle docks independently at the
    // sidebar's right edge, so it does not widen this leading reservation.
    expect(sidebarHeader.computedStyle("padding-left")).toBe("84px");
    expect(logo.bounds().x).toBeGreaterThanOrEqual(84);
    if (server.browser === "chromium") {
        expect(appRegion(sidebarHeader.element)).toBe("drag");
        expect(appRegion(channelHeader.element)).toBe("drag");
        expect(appRegion(members.element)).toBe("no-drag");
        expect(appRegion(search.element)).toBe("no-drag");
    }

    await userEvent.click(members.element);
    await userEvent.click(search.element);
    expect(memberClicks).toBe(1);
    expect(searchClicks).toBe(1);
});

it("reserves a non-overlapping drag row for a standalone desktop surface", async () => {
    const view = createRenderer().render(
        () => (
            <AppShell windowControls>
                <button data-testid="standalone-control" type="button">
                    Settings control
                </button>
            </AppShell>
        ),
        { height: 600, width: 900 },
    );

    await view.ready();

    const titleBar = view.$('[data-happy-desktop-ui="app-shell-standalone-title-bar"]');
    const control = view.$('[data-testid="standalone-control"]');
    expect(titleBar.bounds()).toEqual({ height: 56, width: 900, x: 0, y: 0 });
    expect(control.bounds().y).toBeGreaterThanOrEqual(56);
    if (server.browser === "chromium") expect(appRegion(titleBar.element)).toBe("drag");
});
