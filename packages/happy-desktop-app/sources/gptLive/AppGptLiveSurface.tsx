import { useSyncExternalStore, type ReactNode } from "react";
import type { GptLiveStore } from "happy-desktop-state";
import { GptLiveSurface } from "happy-desktop-ui";

export function AppGptLiveSurface(props: {
    readonly store: GptLiveStore;
    readonly children: ReactNode;
}) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return (
        <GptLiveSurface
            state={state}
            onOpen={props.store.panelOpen}
            onClose={props.store.panelClose}
            onStart={props.store.callStart}
            onEnd={props.store.callEnd}
            onAccountSelect={props.store.accountSelect}
            onMutedChange={props.store.microphoneMutedUpdate}
            onMessageConfirm={props.store.messageConfirm}
            onMessageCancel={props.store.messageCancel}
        >
            {props.children}
        </GptLiveSurface>
    );
}
