import "./styles.css";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { AppShell } from "./AppShell";
import { Composer } from "./Composer";
import { WindowShortcuts } from "./WindowShortcuts";
import { commandShortcut } from "./keyboardShortcut";
import { createRenderer } from "./testing";

it("keeps the covered draft mounted but gives takeover exclusive typing and paste ownership", async () => {
    const attached = vi.fn();
    function Harness() {
        const [open, setOpen] = useState(false);
        const [draft, setDraft] = useState("Keep this draft");
        return (
            <AppShell
                embedded
                workspaceReadableWidth={420}
                panelToggleAction={{ open, onClick: () => setOpen(!open) }}
                panel={open ? <button data-testid="pane-control">Files</button> : undefined}
            >
                <WindowShortcuts
                    actions={[{ shortcut: commandShortcut("j"), run: () => setOpen(!open) }]}
                />
                <Composer
                    value={draft}
                    onValueChange={setDraft}
                    onSend={() => undefined}
                    onAttachmentsSelect={attached}
                    focusOnType
                />
            </AppShell>
        );
    }
    const view = createRenderer().render(() => <Harness />, { width: 500, height: 500 });
    await view.ready();
    const textarea = view.$('[data-happy-desktop-ui="composer-textarea"]')
        .element as HTMLTextAreaElement;
    await userEvent.click(textarea);
    textarea.setSelectionRange(5, 9);
    await userEvent.keyboard("{Meta>}j{/Meta}");
    const workspace = textarea.closest('[data-app-shell-pane="workspace"]') as HTMLElement;
    await expect
        .poll(() => view.container.querySelector('[data-testid="pane-control"]') !== null)
        .toBe(true);
    const pane = view.$('[data-testid="pane-control"]').element as HTMLButtonElement;
    await userEvent.keyboard(" hidden");
    expect(textarea.value).toBe("Keep this draft");
    expect(workspace.inert).toBe(true);
    expect(document.activeElement).toBe(pane);
    await userEvent.keyboard("{Meta>}v{/Meta}");
    expect(document.activeElement).toBe(pane);
    const transfer = new DataTransfer();
    transfer.items.add(new File(["image"], "paste.png", { type: "image/png" }));
    textarea.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
    expect(attached).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Keep this draft");
    await userEvent.keyboard("{Meta>}j{/Meta}");
    await expect.poll(() => workspace.inert).toBe(false);
    expect(view.$('[data-happy-desktop-ui="composer-textarea"]').element).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([5, 9]);
    expect(textarea.value).toBe("Keep this draft");
    await userEvent.keyboard("new");
    expect(textarea.value).toBe("Keep new draft");
});
