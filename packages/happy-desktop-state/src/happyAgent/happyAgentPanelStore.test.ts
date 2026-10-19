import { expect, it } from "vitest";
import type { HappyAgentTerminalHandle } from "./happyAgentTerminalStore.js";
import { happyAgentPanelStoreCreate, type HappyAgentPanelStore } from "./happyAgentPanelStore.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import type { HappyAgentPanelMemory } from "./happyAgentWorkspaceMemory.js";

const GROUP_A = "grp_a" as HappyAgentGroupId;
const GROUP_B = "grp_b" as HappyAgentGroupId;
const AGENT = "ses_a" as HappyAgentSessionId;

function panelCreate(memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>()): {
    store: HappyAgentPanelStore;
    terminalsOpened: HappyAgentSessionId[];
} {
    const terminalsOpened: HappyAgentSessionId[] = [];
    const store = happyAgentPanelStoreCreate({
        terminalOpen: (sessionId) => {
            terminalsOpened.push(sessionId);
            return { [Symbol.dispose]: () => undefined } as unknown as HappyAgentTerminalHandle;
        },
        memoryRead: (group) => memory.get(group),
        memoryWrite: (group, next) => memory.set(group, next),
    });
    store.scopeApply(GROUP_A, AGENT);
    return { store, terminalsOpened };
}

it("opens a new tab as a blank page beside Files", () => {
    const { store } = panelCreate();
    store.browserAdd();
    const panel = store.get();
    expect(panel.open).toBe(true);
    expect(panel.filesViewOpen).toBe(true);
    expect(panel.tabs).toMatchObject([{ kind: "browser", url: "about:blank", label: "New tab" }]);
    expect(panel.activeViewId).toBe(panel.tabs[0]?.id);
});

it("turns a new tab into a terminal in its place", () => {
    const { store, terminalsOpened } = panelCreate();
    store.browserAdd("https://example.com/");
    store.browserAdd();
    const blank = store.get().tabs[1]!;
    store.terminalAdd(blank.id);
    const panel = store.get();
    expect(terminalsOpened).toEqual([AGENT]);
    expect(panel.tabs.map((tab) => tab.kind)).toEqual(["browser", "terminal"]);
    expect(panel.activeViewId).toBe(panel.tabs[1]?.id);
});

it("keeps recent pages per group and remembers them", () => {
    const memory = new Map<HappyAgentGroupId, HappyAgentPanelMemory>();
    const { store } = panelCreate(memory);
    store.browserAdd();
    const tab = store.get().tabs[0]!;
    store.browserUpdate(tab.id, { url: "https://one.example/" });
    store.browserUpdate(tab.id, { url: "https://two.example/", title: "Two" });
    expect(store.get().browserRecent).toEqual([
        { url: "https://two.example/", label: "Two" },
        { url: "https://one.example/", label: "one.example" },
    ]);

    store.scopeApply(GROUP_B, AGENT);
    expect(store.get().browserRecent).toEqual([]);
    store.scopeApply(GROUP_A, AGENT);
    expect(store.get().browserRecent.map((page) => page.url)).toEqual([
        "https://two.example/",
        "https://one.example/",
    ]);

    // A new window reads the same pages back.
    const reopened = panelCreate(memory).store;
    expect(reopened.get().browserRecent.map((page) => page.url)).toEqual([
        "https://two.example/",
        "https://one.example/",
    ]);
});

it("closes the pane with its last tab and brings Files back", () => {
    const { store } = panelCreate();
    store.browserAdd();
    const tab = store.get().tabs[0]!;
    store.filesSelect();
    store.filesClose();
    expect(store.get()).toMatchObject({ open: true, filesViewOpen: false, activeViewId: tab.id });

    store.tabClose(tab.id);
    expect(store.get()).toMatchObject({ open: false, filesViewOpen: true, activeViewId: "files" });

    store.panelToggle();
    store.filesClose();
    expect(store.get()).toMatchObject({ open: false, filesViewOpen: true });
});
