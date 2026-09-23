/** Private main <-> utility-process protocol. Neither side sends this to Chromium. */
export type RendererUtilityInput =
    | {
          readonly type: "backing";
          readonly id: number;
          readonly bridgeUrl: string;
          readonly terminalCapability: string;
          readonly transport: { readonly socketPath: string; readonly token: string };
          readonly allowedOrigin?: string;
      }
    | { readonly type: "detach"; readonly id: number };

export type RendererUtilityOutput =
    | {
          readonly type: "ready";
          readonly port: number;
          readonly username: string;
          readonly password: string;
      }
    | { readonly type: "attached"; readonly id: number }
    | { readonly type: "unavailable"; readonly id: number }
    | { readonly type: "debug"; readonly text: string };
