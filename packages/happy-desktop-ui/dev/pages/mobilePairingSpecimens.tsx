import type { DesktopMobilePairingOptions } from "../../src/DesktopMobileSetup";
import {
    MobileDirectConnectionSection,
    mobileDirectPairingEngaged,
    type MobileDirectConnectorState,
    type MobileDirectRemoval,
} from "../../src/MobileDirectConnection";
import {
    MobilePairingOptions,
    type MobilePairingOptionsLayout,
    type MobilePairingOptionsProps,
} from "../../src/MobilePairingOptions";
import { direct, now, relayWaiting } from "./mobilePairingFixtures";

const noop = () => undefined;

export type PairingVariant = Pick<MobilePairingOptionsProps, "direct" | "relay"> &
    Partial<MobilePairingOptionsProps>;

/** Both pairing methods at the fixed fixture time, every action a no-op. */
export function pairingOptionsSpecimen(
    layout: MobilePairingOptionsLayout,
    variant: PairingVariant,
) {
    return (
        <MobilePairingOptions
            layout={layout}
            now={now}
            onClose={noop}
            onDirectConfirm={noop}
            onDirectReject={noop}
            onDirectStart={noop}
            onRelayRetry={noop}
            {...variant}
        />
    );
}

/** What a setup page receives for `variant`: both codes by default. */
export function setupPairingOptions(
    variant: PairingVariant = { direct: direct.waiting, relay: relayWaiting },
): DesktopMobilePairingOptions {
    return {
        view: pairingOptionsSpecimen("setup", variant),
        verifying: mobileDirectPairingEngaged(variant.direct),
        completed:
            variant.direct.kind === "ready" &&
            variant.direct.connector.pairing?.status === "completed",
    };
}

/** The Settings direct section for `connector`. */
export function directSectionSpecimen(
    connector: MobileDirectConnectorState = direct.closed,
    extra: { readonly removal?: MobileDirectRemoval; readonly unavailable?: string } = {},
) {
    return (
        <MobileDirectConnectionSection
            connector={connector}
            now={now}
            onDeviceRemoveCancel={noop}
            onDeviceRemoveConfirm={noop}
            onDeviceRemoveRequest={noop}
            {...(extra.removal ? { removal: extra.removal } : {})}
            {...(extra.unavailable ? { unavailable: extra.unavailable } : {})}
        />
    );
}
