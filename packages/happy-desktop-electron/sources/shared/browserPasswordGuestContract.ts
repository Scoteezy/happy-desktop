/** Private IPC between main and the isolated network-browser preload. Never exposed to a page. */
export const browserPasswordGuestChannel = "happy:browser-password-guest";
export const browserPasswordGuestDeliveryChannel = "happy:browser-password-delivery";

/** A username field receives only the username; only a password field receives a password. */
export type BrowserPasswordGuestFieldKind = "username" | "password";

export interface BrowserPasswordGuestField {
    readonly id: string;
    readonly kind: BrowserPasswordGuestFieldKind;
}

export type BrowserPasswordGuestMessage =
    | { readonly type: "ready"; readonly nonce: string }
    | {
          readonly type: "focus";
          readonly token: string;
          readonly field: BrowserPasswordGuestField | null;
          /** A trusted click on an empty field asks main to offer its saved logins. */
          readonly open: boolean;
      }
    | {
          readonly type: "probeResult";
          readonly token: string;
          readonly requestId: string;
          readonly eligible: boolean;
      };

export type BrowserPasswordGuestDelivery =
    | { readonly type: "readyRequest" }
    | {
          readonly type: "bind";
          readonly nonce: string;
          readonly token: string;
          readonly origin: string;
          readonly expiresAt: number;
      }
    | { readonly type: "invalidate"; readonly token: string }
    | {
          readonly type: "probe";
          readonly token: string;
          readonly requestId: string;
          readonly fieldId: string;
          readonly origin: string;
      }
    | {
          readonly type: "fill";
          readonly token: string;
          readonly requestId: string;
          readonly fieldId: string;
          readonly origin: string;
          readonly username: string;
          /** Null for a username field: its secret never leaves main. */
          readonly password: string | null;
          readonly expiresAt: number;
      };
