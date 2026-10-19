import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { flushSync } from "react-dom";
import { TabbedPane } from "./TabbedPane";
import { createRenderer } from "./testing";

const noop = () => {};
const pane = (id: string, busy = false, closable = true) => (
    <TabbedPane
        data-testid={id}
        activeId="first"
        tabs={[
            { id: "first", label: "First document", busy, closable },
            { id: "second", label: "Another document" },
        ]}
        onSelect={noop}
        onClose={noop}
        tabSizing="content"
        closePresentation="overlay"
    >
        <div />
    </TabbedPane>
);

it("reserves exactly one trailing slot through loading, hover and close availability", async () => {
    let update: (state: { busy: boolean; closable: boolean }) => void = () => {};
    const Fixture = () => {
        const [state, setState] = useState({ busy: false, closable: true });
        update = setState;
        return pane("tabs", state.busy, state.closable);
    };
    const view = createRenderer().render(() => <Fixture />, {
        width: 900,
        height: 200,
    });
    await view.ready();
    const tab = () => view.$('[data-tab-id="first"]');
    const lane = () => view.$('[data-tab-id="first"] [data-happy-desktop-ui="tab-trailing"]');
    const before = tab().bounds();
    const slot = lane().bounds();
    for (const running of [true, false, true]) {
        flushSync(() => update({ busy: running, closable: true }));
        await view.ready();
        expect(tab().bounds()).toEqual(before);
        expect(lane().bounds()).toEqual(slot);
        await userEvent.hover(tab().element);
        expect(tab().bounds()).toEqual(before);
        expect(lane().bounds()).toEqual(slot);
        await userEvent.unhover(tab().element);
    }
    const activity = view
        .$('[data-tab-id="first"] [data-happy-desktop-ui="tab-activity"]')
        .bounds();
    const close = view.$('[data-tab-id="first"] [data-happy-desktop-ui="tab-close"]').bounds();
    expect(activity).toEqual(close);
    flushSync(() => update({ busy: false, closable: false }));
    await view.ready();
    expect(tab().bounds()).toEqual(before);
    expect(lane().bounds()).toEqual(slot);
});
