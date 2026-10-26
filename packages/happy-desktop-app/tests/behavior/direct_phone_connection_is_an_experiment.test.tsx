import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    experimentsStoreCreate,
    happyAgentMobileConnectorStoreCreate,
    happyAgentMobileConnectorStoreNoop,
    type ExperimentsOutput,
    type HappyAgentClockStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStoreDeps,
} from "happy-desktop-state";
import {
    desktopMobilePairingOptionsCopy,
    HappyAgentMobileSettings,
    type MobilePairingMethod,
} from "happy-desktop-ui";
import { appMobilePairingOptions } from "../../sources/components/AppMobilePairing";

/*
 * Pairing a phone directly is an experiment. Onboarding and Mobile Access show
 * a Relay | Direct control at the top, with Direct tagged Experimental; it
 * shows Relay until the person chooses Direct, which is the same switch as
 * "Direct phone connection" in Settings › Experiments. Relay shows only the
 * relay code and nothing asks the daemon for a direct pairing; Direct shows
 * the direct code and emoji step in the same place. Off, Mobile Access also
 * leaves out the paired-phones section.
 */

const clock: HappyAgentClockStore = {
    get: () => 1_000,
    subscribe: () => () => undefined,
} as unknown as HappyAgentClockStore;

/** A direct code waiting on the phone, as the daemon reports one. */
const waiting: HappyAgentMobileConnectorSnapshot = {
    connector: {
        kind: "ready",
        connector: {
            status: "open",
            pairing: {
                id: "pairing",
                status: "waiting",
                qr: "happy://direct?code",
                expiresAt: 300_000,
                device: null,
                emoji: null,
                desktopConfirmed: false,
                mobileConfirmed: false,
                error: null,
            },
            devices: [],
            error: null,
        },
    },
    pairingOpen: true,
    starting: false,
    confirming: false,
    cancelling: false,
};

const relay = { kind: "waiting", data: "happy://relay", expiresAt: 300_000 } as const;

function slots(container: HTMLElement): string[] {
    return [
        ...container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="mobile-pairing-options-slot"]',
        ),
    ].map((slot) => slot.dataset.method ?? "");
}

function segment(container: HTMLElement, method: MobilePairingMethod): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(
        `[data-testid="mobile-pairing-method"] [data-value="${method}"]`,
    );
    if (!found) throw new Error(`No ${method} segment`);
    return found;
}

function options(
    layout: "setup" | "settings",
    method: MobilePairingMethod,
    onMethodSelect: (method: MobilePairingMethod) => void = () => undefined,
) {
    return appMobilePairingOptions({
        layout,
        method,
        onMethodSelect,
        relay,
        direct: happyAgentMobileConnectorStoreNoop,
        // Relay does not follow even a direct pairing the daemon still reports.
        snapshot: waiting,
        clock,
        online: () => true,
    });
}

it("is a device experiment, off until the person turns it on, and says where it changed", () => {
    expect(EXPERIMENTAL_FEATURES).toContainEqual({
        id: "mobileDirect",
        label: "Direct phone connection",
    });
    const written: unknown[] = [];
    const outputs: ExperimentsOutput[] = [];
    const store = experimentsStoreCreate(
        { read: () => undefined, write: (d) => written.push(d) },
        (output) => outputs.push(output),
    );
    expect(store.get().mobileDirect).toBe(false);
    // An old single switch never turns it on.
    expect(
        experimentsStoreCreate({
            read: () => ({ experimentalFeaturesEnabled: true }),
            write() {},
        }).get().mobileDirect,
    ).toBe(false);
    store.featureUpdate("mobileDirect", true, "onboarding");
    expect(store.get().mobileDirect).toBe(true);
    expect(written.at(-1)).toMatchObject({ mobileDirect: true });
    // Choosing what is already chosen changes and reports nothing.
    store.featureUpdate("mobileDirect", true, "mobile_access");
    store.featureUpdate("mobileDirect", false, "experiments");
    expect(outputs).toEqual([
        { type: "featureUpdated", feature: "mobileDirect", enabled: true, source: "onboarding" },
        { type: "featureUpdated", feature: "mobileDirect", enabled: false, source: "experiments" },
    ]);
});

it.each(["setup", "settings"] as const)(
    "shows Relay with the relay code alone until Direct is chosen (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const shown = options(layout, "relay", (method) => selected.push(method));
        expect(shown.verifying).toBe(false);
        expect(shown.completed).toBe(false);
        expect(desktopMobilePairingOptionsCopy(shown)).toBe(
            "Open Happy on your phone and scan the code.",
        );
        const view = render(<>{shown.view}</>);
        expect(slots(view.container)).toEqual(["relay"]);
        expect(segment(view.container, "relay").getAttribute("aria-pressed")).toBe("true");
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("false");
        expect(segment(view.container, "direct").textContent).toBe("DirectExperimental");
        expect(view.getByLabelText("QR code to pair through Happy relay")).toBeTruthy();
        expect(view.queryByLabelText("QR code to connect a phone directly")).toBeNull();
        // The chosen method again is no choice; Direct is.
        fireEvent.click(segment(view.container, "relay"));
        fireEvent.click(segment(view.container, "direct"));
        expect(selected).toEqual(["direct"]);
        view.unmount();
    },
);

it.each(["setup", "settings"] as const)(
    "shows the direct code in the relay code's place once Direct is chosen (%s)",
    (layout) => {
        const selected: MobilePairingMethod[] = [];
        const select = (method: MobilePairingMethod) => selected.push(method);
        const view = render(<>{options(layout, "relay", select).view}</>);
        const control = view.getByTestId("mobile-pairing-method");
        const slotsBox = view.container.querySelector(".happy-mobile-pairing-options__slots");
        const direct = options(layout, "direct", select);
        expect(desktopMobilePairingOptionsCopy(direct)).toBe(
            "Open Happy on your phone and scan the code.",
        );
        view.rerender(<>{direct.view}</>);
        expect(slots(view.container)).toEqual(["direct"]);
        expect(segment(view.container, "direct").getAttribute("aria-pressed")).toBe("true");
        expect(view.getByLabelText("QR code to connect a phone directly")).toBeTruthy();
        // Switching swaps the slot in place: the control and the slots stay.
        expect(view.getByTestId("mobile-pairing-method")).toBe(control);
        expect(view.container.querySelector(".happy-mobile-pairing-options__slots")).toBe(slotsBox);
        expect(view.queryByLabelText("QR code to pair through Happy relay")).toBeNull();
        fireEvent.click(segment(view.container, "relay"));
        expect(selected).toEqual(["relay"]);
        view.unmount();
    },
);

it("leaves the direct section out of Mobile Access while the experiment is off", () => {
    const base = {
        configured: false,
        onDisconnect: () => undefined,
        onPairingOptionsOpen: () => undefined,
        status: "disconnected",
    } as const;
    const off = render(<HappyAgentMobileSettings {...base} />);
    expect(off.getByText("Shows the relay code, or the direct one as an experiment")).toBeTruthy();
    expect(off.container.textContent).not.toContain("Paired phones");
    off.unmount();
    const on = render(<HappyAgentMobileSettings {...base} direct={<p>Paired phones</p>} />);
    expect(on.getByText("Paired phones")).toBeTruthy();
    on.unmount();
});

it("makes no direct code for a pairing opened while nothing shows the connector", async () => {
    const connector = { ...waiting.connector, version: "1" };
    const startMobilePairing = vi.fn(async () => ({
        mobileConnector: {
            status: "open" as const,
            pairing: (waiting.connector as { connector: { pairing: unknown } }).connector.pairing,
            devices: [],
            error: null,
            version: "2",
        },
    }));
    const deps = {
        sync: {
            async *follow({ signal }: { signal: AbortSignal }) {
                yield { kind: "reconcile" };
                await new Promise((resolve) => signal.addEventListener("abort", resolve));
            },
            health: () => undefined,
        },
        client: {
            getMobileConnector: vi.fn(async () => ({
                mobileConnector: {
                    status: "open" as const,
                    pairing: null,
                    devices: [],
                    error: null,
                    version: connector.version,
                },
            })),
            startMobilePairing,
            confirmMobilePairing: vi.fn(),
            cancelMobilePairing: vi.fn(async () => ({ mobileConnector: {} })),
            removeMobileDevice: vi.fn(),
        },
    } as unknown as HappyAgentMobileConnectorStoreDeps;
    const store = happyAgentMobileConnectorStoreCreate(deps);
    try {
        // Read once, as a surface that was open earlier would have.
        const leave = store.subscribe(() => undefined);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(store.get().connector.kind).toBe("ready");
        leave();
        // A pairing opened with no surface on screen, as Mobile Access opens
        // one with the experiment off, asks the daemon for nothing.
        store.pairingOpen();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(startMobilePairing).not.toHaveBeenCalled();
        // A surface that shows it makes the code.
        const shown = store.subscribe(() => undefined);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
        expect(startMobilePairing).toHaveBeenCalledTimes(1);
        shown();
    } finally {
        store[Symbol.dispose]();
    }
});
