import { fireEvent, render, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreCreate,
    type HappyAgentSpacesDeps,
    type HappyAgentSpacesStore,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

/*
 * A stem cell is a row like any other: the person can drag it past another
 * stem cell and into a section, and the daemon keeps it where it was dropped.
 */

const ROW_HEIGHT = 28;

function space(id: string, title: string | null) {
    return {
        id,
        title,
        icon: title === null ? { type: "stem_cell" as const } : null,
        target: {
            kind: "task" as const,
            id: `task-${id}`,
            agentId: `agent-${id}`,
            workspaceId: "w",
        },
        sectionId: null,
        orderKey: "0",
        placement: "settled" as const,
        visibility: "shown" as const,
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    };
}

const SPACES = [
    space("stemA", null),
    space("stemB", null),
    space("release", "Release"),
    space("voice", "Voice"),
];

/** A daemon that keeps whatever document the window saves. */
function daemonCreate() {
    const daemon = fakeHappyAgentDaemonCreate();
    let saved = {
        version: 1,
        html: [
            "<nav>",
            "  <happy-search/>",
            "  <happy-create/>",
            '  <happy-space id="stemA"/>',
            '  <happy-space id="stemB"/>',
            '  <happy-space id="release"/>',
            '  <happy-section id="desktop" label="Desktop"/>',
            '  <happy-space id="voice"/>',
            "</nav>",
        ].join("\n"),
    };
    const answer = () => ({ artifactId: "sidebar", ...saved, spaces: SPACES });
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces: SPACES, sections: [] }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.getSpaceSidebar = vi.fn(async () => answer());
    daemon.client.updateSpaceSidebar = vi.fn(
        async (request: { html: string; baseVersion: number }) => {
            expect(request.baseVersion).toBe(saved.version);
            saved = { version: saved.version + 1, html: request.html };
            return answer();
        },
    );
    return { daemon, saved: () => saved };
}

/** A connection that has just reconciled and then stays quiet until it is left. */
const sync: HappyAgentSpacesDeps["sync"] = {
    async *follow({ signal }) {
        yield { kind: "reconcile" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
    },
    health: () => undefined,
};

/** The rows the saved document lists, in order. */
const order = (html: string) =>
    [...html.matchAll(/<happy-(?:space|section) id="([^"]+)"/g)].map((m) => m[1]);

function Spaces(props: { store: HappyAgentSpacesStore }) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const sidebar: HappyAgentSpacesSidebarProps = {
        store: props.store,
        snapshot,
        places: { bots: [], tasks: [], chatGroupOf: () => undefined },
        focus: {},
        navigation: { onChatSelect: () => {} },
        actions: {
            taskLeave: () => {},
            taskArchive: () => {},
            botArchive: () => {},
            surfaceLeave: () => {},
        },
        now: 1,
        titleShimmerEnabled: false,
        stemCellAnimation: true,
        brand: false,
        footer: null,
        sessionRow: () => undefined,
        worktreeRows: () => [],
        onChildSelect: () => {},
    };
    return <HappyAgentSpacesSidebar {...sidebar} />;
}

afterEach(() => vi.restoreAllMocks());

it("drags a stem cell past another stem cell and into a section, and the daemon saves it", async () => {
    // jsdom lays nothing out: each row stands ROW_HEIGHT below the one before it.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        function (this: HTMLElement) {
            const rows = [...document.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')];
            const index = rows.indexOf(this);
            return new DOMRect(0, Math.max(index, 0) * ROW_HEIGHT, 280, index < 0 ? 0 : ROW_HEIGHT);
        },
    );
    Element.prototype.animate ??= () => ({ finished: Promise.resolve() }) as unknown as Animation;
    window.matchMedia ??= () => ({ matches: false }) as MediaQueryList;
    const { daemon, saved } = daemonCreate();
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    const view = render(<Spaces store={store} />);
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="space:${id}"]`)!;
    const drag = (id: string, rows: number) => {
        const node = row(id);
        const y = node.getBoundingClientRect().top + ROW_HEIGHT / 2;
        fireEvent.pointerDown(node, { button: 0, buttons: 1, pointerId: 1, clientY: y });
        fireEvent.pointerMove(node, { buttons: 1, pointerId: 1, clientY: y + 8 });
        fireEvent.pointerMove(node, {
            buttons: 1,
            pointerId: 1,
            clientY: y + rows * ROW_HEIGHT + 2,
        });
        fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientY: y + rows * ROW_HEIGHT + 2 });
    };
    try {
        await waitFor(() => expect(row("stemA")).toBeTruthy());
        expect(row("stemA").querySelector('[data-happy-desktop-ui="stem-cell"]')).not.toBeNull();

        drag("stemA", 1);
        await waitFor(() => expect(saved().version).toBe(2));
        expect(order(saved().html)).toEqual(["stemB", "stemA", "release", "desktop", "voice"]);

        drag("stemA", 2);
        await waitFor(() => expect(saved().version).toBe(3));
        expect(order(saved().html)).toEqual(["stemB", "release", "desktop", "stemA", "voice"]);
        // The window draws what the daemon saved.
        expect(
            [...view.container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map(
                (node) => node.getAttribute("data-item-id"),
            ),
        ).toEqual([
            "space:stemB",
            "space:release",
            "section:desktop",
            "space:stemA",
            "space:voice",
        ]);
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});
