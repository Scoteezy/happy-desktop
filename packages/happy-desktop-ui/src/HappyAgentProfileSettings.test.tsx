import type { ReactNode } from "react";
import { expect, it } from "vitest";
import "./styles.css";
import {
    HappyAgentProfileSettings,
    type HappyAgentProfileSettingsProps,
} from "./pages/settings/HappyAgentProfileSettings";
import { createRenderer } from "./testing";

/*
 * The photo row of the Profile category. The avatar shows the stored photo,
 * its ThumbHash while the bytes are still being read, or the initials when
 * there is none; the row offers a picker and, when there is a photo, removal.
 * A change in flight, a refusal, and a profile that was never saved each
 * change what the row lets the reader do.
 */

const noop = () => undefined;
const THUMBHASH = "HfkJRw53iVdwioiHeYZot3iIiAK3CHIJ";

/** A drawn, deterministic picture standing in for the photo's bytes. */
function photoUrl(): string {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgb(40, 140, 150)";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "rgb(240, 180, 40)";
    context.fillRect(0, 40, 64, 24);
    return canvas.toDataURL("image/png");
}

function profile(testId: string, props: Partial<HappyAgentProfileSettingsProps> = {}): ReactNode {
    return (
        <div data-testid={testId} style={{ width: "640px" }}>
            <HappyAgentProfileSettings
                email="ada@example.com"
                name="Ada Lovelace"
                onEmailChange={noop}
                onNameChange={noop}
                onPhotoChoose={noop}
                onPhotoCropCancel={noop}
                onPhotoCropConfirm={noop}
                onPhotoRemove={noop}
                onRevert={noop}
                onSave={noop}
                {...props}
            />
        </div>
    );
}

function text(element: Element): string {
    return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function buttons(root: Element): HTMLButtonElement[] {
    return [
        ...root.querySelectorAll<HTMLButtonElement>(".happy-agent-profile__photo-actions button"),
    ];
}

it("offers an upload with no photo, and shows the initials", async () => {
    const view = createRenderer();
    view.render(() => profile("none"), { width: 680, height: 420, padding: 20 });
    await view.ready();

    const root = view.$('[data-testid="none"]').element;
    const avatar = view.$('[data-testid="happy-agent-profile-avatar"]');
    expect(avatar.element.querySelector("img")).toBeNull();
    expect(text(avatar.element)).toBe("AL");
    expect(buttons(root).map((button) => [text(button), button.disabled])).toEqual([
        ["Upload photo", false],
    ]);
    expect(text(root)).toContain("PNG, JPEG, or WebP, up to 8 MiB");
    const input = view.$('[data-testid="happy-agent-profile-photo-input"]').element;
    expect((input as HTMLInputElement).accept).toBe("image/png,image/jpeg,image/webp");
    expect((input as HTMLInputElement).type).toBe("file");
    expect(input.getBoundingClientRect().width).toBe(0);
});

it("shows the photo inside the avatar, with removal beside the picker", async () => {
    const view = createRenderer();
    const url = photoUrl();
    view.render(() => profile("photo", { photo: { thumbhash: THUMBHASH, imageUrl: url } }), {
        width: 680,
        height: 420,
        padding: 20,
    });
    await view.ready();

    const root = view.$('[data-testid="photo"]').element;
    const avatar = view.$('[data-testid="happy-agent-profile-avatar"]');
    const image = view.$('[data-testid="happy-agent-profile-avatar"] img');
    expect((image.element as HTMLImageElement).src).toBe(url);
    expect(avatar.bounds()).toMatchObject({ width: 44, height: 44 });
    expect(image.bounds()).toMatchObject({ width: 44, height: 44 });
    expect(image.computedStyle("border-radius")).toBe(avatar.computedStyle("border-radius"));
    const ink = await image.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);

    const [remove, replace] = buttons(root);
    expect([text(remove!), text(replace!)]).toEqual(["Remove", "Replace photo"]);
    expect(remove!.disabled || replace!.disabled).toBe(false);
    // The parent owns the gap, and the picker stays at the row's trailing edge.
    const removeBox = remove!.getBoundingClientRect();
    const replaceBox = replace!.getBoundingClientRect();
    // Firefox lays out in sixtieths of a pixel, so the edges are compared within 0.05px.
    expect(Math.abs(replaceBox.left - removeBox.right - 8)).toBeLessThan(0.05);
    const control = root
        .querySelector(".happy-agent-profile__photo-actions")!
        .closest('[data-happy-desktop-ui="form-row-control"]')!
        .getBoundingClientRect();
    expect(Math.abs(replaceBox.right - control.right)).toBeLessThan(0.05);
});

it("shows the ThumbHash while the photo's bytes are still being read", async () => {
    const view = createRenderer();
    view.render(() => profile("loading", { photo: { thumbhash: THUMBHASH } }), {
        width: 680,
        height: 420,
        padding: 20,
    });
    await view.ready();

    const image = view.$('[data-testid="happy-agent-profile-avatar"] img');
    expect((image.element as HTMLImageElement).src).toMatch(/^data:image\/png;base64,/u);
    expect((await image.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(text(view.$('[data-testid="loading"]').element)).toContain("Replace photo");
});

it("holds both controls while a change is in flight", async () => {
    const view = createRenderer();
    view.render(
        () => profile("uploading", { photo: { thumbhash: THUMBHASH }, photoUploading: true }),
        {
            width: 680,
            height: 420,
            padding: 20,
        },
    );
    view.render(
        () => profile("removing", { photo: { thumbhash: THUMBHASH }, photoRemoving: true }),
        {
            width: 680,
            height: 420,
            padding: 20,
        },
    );
    await view.ready();

    const uploading = buttons(view.$('[data-testid="uploading"]').element);
    expect(uploading.map((button) => button.disabled)).toEqual([true, true]);
    expect(uploading[1]!.hasAttribute("data-loading")).toBe(true);
    expect(uploading[0]!.hasAttribute("data-loading")).toBe(false);
    const removing = buttons(view.$('[data-testid="removing"]').element);
    expect(removing.map((button) => button.disabled)).toEqual([true, true]);
    expect(removing[0]!.hasAttribute("data-loading")).toBe(true);
});

it("explains a refused change, and why a photo cannot be added yet", async () => {
    const view = createRenderer();
    view.render(
        () =>
            profile("refused", {
                photo: { thumbhash: THUMBHASH },
                photoError: "The profile photo must be no larger than 8 MiB.",
            }),
        { width: 680, height: 480, padding: 20 },
    );
    view.render(
        () =>
            profile("unsaved", {
                email: "",
                name: "",
                photoUnavailable: "Save your name first, then add a photo",
            }),
        { width: 680, height: 420, padding: 20 },
    );
    await view.ready();

    const refused = view.$('[data-testid="refused"]').element;
    expect(text(refused)).toContain("Photo not changed");
    expect(text(refused)).toContain("The profile photo must be no larger than 8 MiB.");
    expect(buttons(refused).every((button) => !button.disabled)).toBe(true);

    const unsaved = view.$('[data-testid="unsaved"]').element;
    expect(text(unsaved)).toContain("Save your name first, then add a photo");
    expect(text(unsaved)).not.toContain("up to 8 MiB");
    expect(buttons(unsaved).map((button) => [text(button), button.disabled])).toEqual([
        ["Upload photo", true],
    ]);
});

it("hands the picked file and the removal to their handlers", async () => {
    const chosen: File[] = [];
    let removals = 0;
    const view = createRenderer();
    view.render(
        () =>
            profile("handlers", {
                photo: { thumbhash: THUMBHASH },
                onPhotoChoose: (file) => chosen.push(file),
                onPhotoRemove: () => {
                    removals += 1;
                },
            }),
        { width: 680, height: 420, padding: 20 },
    );
    await view.ready();

    const input = view.$('[data-testid="happy-agent-profile-photo-input"]')
        .element as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "me.png", {
        type: "image/png",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(chosen).toEqual([file]);
    // The same file can be picked again.
    expect(input.value).toBe("");

    view.$('[data-testid="happy-agent-profile-photo-remove"]').element.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
    );
    expect(removals).toBe(1);
});
