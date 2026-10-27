import { ipcRenderer } from "electron";
import {
    browserPasswordGuestChannel,
    browserPasswordGuestDeliveryChannel,
    type BrowserPasswordGuestDelivery,
    type BrowserPasswordGuestFieldKind,
    type BrowserPasswordGuestMessage,
} from "../shared/browserPasswordGuestContract";

// No contextBridge, page-world script, window property, or DOM attribute carries this capability.
if (process.isMainFrame && location.protocol === "https:") {
    const nonce = crypto.randomUUID();
    const fieldIds = new WeakMap<HTMLInputElement, string>();
    const nativeValueSet = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    )!.set!;
    let token: string | null = null;
    let tokenExpiresAt = 0;
    let origin: string | null = null;
    let field: HTMLInputElement | null = null;
    let probe: { requestId: string; field: HTMLInputElement; expiresAt: number } | null = null;
    let leaving = false;

    function send(message: BrowserPasswordGuestMessage): void {
        ipcRenderer.send(browserPasswordGuestChannel, message);
    }

    function bound(): boolean {
        return (
            !leaving &&
            token !== null &&
            Date.now() < tokenExpiresAt &&
            origin === location.origin &&
            location.protocol === "https:" &&
            document.visibilityState === "visible"
        );
    }

    function usable(input: HTMLInputElement): boolean {
        if (
            !input.isConnected ||
            input.ownerDocument !== document ||
            input.disabled ||
            input.matches(":disabled") ||
            input.readOnly ||
            input.closest("[inert]") ||
            !input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        )
            return false;
        const rect = input.getBoundingClientRect();
        if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.bottom <= 0 ||
            rect.right <= 0 ||
            rect.top >= innerHeight ||
            rect.left >= innerWidth
        )
            return false;
        // Reject transparent overlays and occluded fields, as well as offscreen fields.
        const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
        const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
        return document.elementFromPoint(x, y) === input;
    }

    function fieldKind(input: HTMLInputElement): BrowserPasswordGuestFieldKind | null {
        if (input.type === "password") return "password";
        if (!["text", "email", "tel"].includes(input.type)) return null;
        // An account field stands alone on the first step of a two-step sign-in.
        const tokens = (input.getAttribute("autocomplete") ?? "").toLowerCase().split(/\s+/);
        if (input.type === "email" || tokens.includes("username") || tokens.includes("email"))
            return "username";
        const password = input.form
            ? Array.from(input.form.elements).find(
                  (entry): entry is HTMLInputElement =>
                      entry instanceof HTMLInputElement &&
                      entry.type === "password" &&
                      usable(entry),
              )
            : undefined;
        return password && usernameFor(password) === input ? "username" : null;
    }

    function fieldActive(input: HTMLInputElement | null): input is HTMLInputElement {
        return (
            bound() &&
            input !== null &&
            document.activeElement === input &&
            fieldKind(input) !== null &&
            usable(input)
        );
    }

    function passwordActive(input: HTMLInputElement | null): input is HTMLInputElement {
        return fieldActive(input) && input.type === "password";
    }

    function fieldId(input: HTMLInputElement): string {
        let id = fieldIds.get(input);
        if (!id) {
            id = crypto.randomUUID();
            fieldIds.set(input, id);
        }
        return id;
    }

    // This heuristic exists only at the external website boundary. Never read a child frame.
    function usernameFor(password: HTMLInputElement): HTMLInputElement | null {
        if (!password.form) return null;
        const inputs = Array.from(password.form.elements).filter(
            (entry): entry is HTMLInputElement =>
                entry instanceof HTMLInputElement &&
                entry.form === password.form &&
                ["text", "email", "tel"].includes(entry.type) &&
                usable(entry),
        );
        return (
            inputs.find((input) => input.autocomplete.split(/\s+/).includes("username")) ??
            inputs
                .filter((input) =>
                    Boolean(
                        input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
                    ),
                )
                .at(-1) ??
            null
        );
    }

    function focusPublish(open = false): void {
        if (!token) return;
        const active = document.activeElement;
        field = active instanceof HTMLInputElement && fieldActive(active) ? active : null;
        const kind = field ? fieldKind(field) : null;
        probe = null;
        send({
            type: "focus",
            token,
            field: field && kind ? { id: fieldId(field), kind } : null,
            open: open && field !== null && field.value === "",
        });
    }

    function reset(): void {
        token = null;
        tokenExpiresAt = 0;
        origin = null;
        field = null;
        probe = null;
    }

    // Focus alone is not a user gesture: scripts can call focus(). Native pointer/key input
    // and trusted password editing are the only ways to nominate a field for the picker.
    document.addEventListener(
        "pointerdown",
        (event) => {
            if (!event.isTrusted || !bound()) return;
            const target = event.target;
            if (target instanceof HTMLInputElement && fieldKind(target)) {
                setTimeout(() => {
                    if (document.activeElement === target) focusPublish();
                }, 0);
            }
        },
        true,
    );
    // The picker opens after the button is released, so the release cannot pick a login.
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (
                event.isTrusted &&
                bound() &&
                target instanceof HTMLInputElement &&
                document.activeElement === target &&
                fieldKind(target)
            )
                focusPublish(true);
        },
        true,
    );
    document.addEventListener(
        "keydown",
        (event) => {
            if (!event.isTrusted || !bound()) return;
            if (event.key === "Tab" || event.target instanceof HTMLInputElement) {
                setTimeout(focusPublish, 0);
            }
        },
        true,
    );
    document.addEventListener(
        "focusout",
        () => {
            // A toolbar/native menu can blur the guest while its activeElement remains the
            // chosen password. A different DOM focus still invalidates its field identity.
            setTimeout(() => {
                if (field && document.activeElement !== field) focusPublish();
            }, 0);
        },
        true,
    );
    document.addEventListener(
        "input",
        (event) => {
            const input = event.target;
            if (
                event.isTrusted &&
                event instanceof InputEvent &&
                input instanceof HTMLInputElement &&
                passwordActive(input)
            )
                focusPublish();
        },
        true,
    );

    ipcRenderer.on(
        browserPasswordGuestDeliveryChannel,
        (_event, message: BrowserPasswordGuestDelivery) => {
            if (message.type === "readyRequest") {
                if (!leaving && location.protocol === "https:") send({ type: "ready", nonce });
                return;
            }
            if (message.type === "bind") {
                if (
                    leaving ||
                    message.nonce !== nonce ||
                    message.origin !== location.origin ||
                    location.protocol !== "https:"
                )
                    return;
                reset();
                token = message.token;
                tokenExpiresAt = message.expiresAt;
                origin = message.origin;
                return;
            }
            if (message.type === "invalidate") {
                if (message.token === token) reset();
                return;
            }
            if (!bound() || message.token !== token) return;
            if (message.origin !== origin) return;
            if (message.type === "probe") {
                const eligible = fieldActive(field) && fieldId(field) === message.fieldId;
                probe =
                    eligible && field
                        ? { requestId: message.requestId, field, expiresAt: Date.now() + 5000 }
                        : null;
                send({
                    type: "probeResult",
                    token: token!,
                    requestId: message.requestId,
                    eligible,
                });
                return;
            }
            const permit = probe;
            probe = null; // One native choice permits at most one delivery, even if it fails.
            if (
                !permit ||
                permit.requestId !== message.requestId ||
                Date.now() > permit.expiresAt ||
                Date.now() > message.expiresAt ||
                !fieldActive(permit.field) ||
                fieldId(permit.field) !== message.fieldId
            )
                return;
            if (message.password === null) {
                // Never place an account name into a field that has become a password field.
                const account = permit.field;
                if (fieldKind(account) !== "username") return;
                nativeValueSet.call(account, message.username);
                account.dispatchEvent(new Event("input", { bubbles: true }));
                account.dispatchEvent(new Event("change", { bubbles: true }));
                return;
            }
            if (permit.field.type !== "password") return;
            const password = permit.field;
            const username = usernameFor(password);
            if (username) {
                nativeValueSet.call(username, message.username);
                username.dispatchEvent(new Event("input", { bubbles: true }));
                username.dispatchEvent(new Event("change", { bubbles: true }));
            }
            // A site's username handler can navigate, replace the field, hide it, or change
            // its type. Recheck after those handlers, immediately before writing the secret.
            if (
                !bound() ||
                message.token !== token ||
                !passwordActive(password) ||
                (username !== null && username.form !== password.form)
            )
                return;
            nativeValueSet.call(password, message.password);
            password.dispatchEvent(new Event("input", { bubbles: true }));
            password.dispatchEvent(new Event("change", { bubbles: true }));
        },
    );

    window.addEventListener("pagehide", () => {
        leaving = true;
        reset();
    });
    window.addEventListener("pageshow", () => {
        leaving = false;
        if (location.protocol === "https:") send({ type: "ready", nonce });
    });
    document.addEventListener(
        "DOMContentLoaded",
        () => {
            if (location.protocol === "https:") send({ type: "ready", nonce });
        },
        { once: true },
    );
}
