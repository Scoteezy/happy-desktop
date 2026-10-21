import { expect, it } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    experimentsStoreCreate,
    type ExperimentsDocument,
} from "./experimentsStore.js";

it.each([false, true])(
    "migrates the old switch (%s) and persists independent choices",
    (enabled) => {
        let saved: unknown = { experimentalFeaturesEnabled: enabled };
        const persistence = {
            read: () => saved,
            write: (document: ExperimentsDocument) => {
                saved = document;
            },
        };
        const store = experimentsStoreCreate(persistence);
        for (const feature of EXPERIMENTAL_FEATURES) expect(store.get()[feature.id]).toBe(enabled);
        store.featureUpdate("stemCells", !enabled);
        expect(store.get().stemCells).toBe(!enabled);
        expect(store.get().spacesSidebar).toBe(enabled);
        expect(store.get().batchNotes).toBe(enabled);
        expect(experimentsStoreCreate(persistence).get()).toEqual(store.get());
    },
);
