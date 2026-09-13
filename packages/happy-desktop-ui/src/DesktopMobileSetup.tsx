import { Button } from "./Button";
import { QRCode } from "./QRCode";
import { SegmentedControl } from "./SegmentedControl";
import { SetupPage, SetupProgress } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export type DesktopMobileSetupStep =
    | { readonly kind: "intro"; readonly alreadyLinked?: boolean }
    | {
          readonly kind: "get-app";
          readonly platform: "ios" | "android";
          readonly preparation: "preparing" | "ready" | "failed";
          readonly message?: string;
      }
    | {
          readonly kind: "link";
          readonly phase:
              | { readonly kind: "checking" | "preparing" | "finishing" }
              | { readonly kind: "pairing"; readonly data: string; readonly expiresAt: number }
              | { readonly kind: "failed"; readonly message: string };
      }
    | { readonly kind: "connected"; readonly online: boolean; readonly message?: string };

export interface DesktopMobileSetupProps {
    readonly appearance: ThemeMode;
    readonly step: DesktopMobileSetupStep;
    readonly onContinue: () => void;
    readonly onSkip: () => void;
    readonly onPlatformSelect?: (platform: "ios" | "android") => void;
}

const STORE_URLS = {
    ios: "https://apps.apple.com/us/app/happy-claude-code-client/id6748571505",
    android: "https://play.google.com/store/apps/details?id=com.ex3ndr.happy",
} as const;
const ENCRYPTION_COPY =
    "Your messages and session content are end-to-end encrypted between your computer and phone.";

/** Optional desktop-to-phone setup. All operations and progress arrive through props. */
export function DesktopMobileSetup(props: DesktopMobileSetupProps) {
    const { step } = props;
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-desktop-mobile-setup",
        "data-testid": "local-onboarding-screen",
        // Approval replaces only the QR body, not the retained linking page or its sticker.
        transitionKey: `desktop-mobile-${step.kind}`,
    } as const;
    const skip = (
        <Button onClick={props.onSkip} size="medium" variant="ghost">
            Not now
        </Button>
    );

    if (step.kind === "intro")
        return (
            <SetupPage
                {...frame}
                scene="closed-lock"
                title={
                    step.alreadyLinked
                        ? "Your phone is already linked"
                        : "Control Happy Desktop from your phone"
                }
                copy={
                    step.alreadyLinked
                        ? "Your phone is already linked to Happy Desktop. Finish setup to enable remote control of terminal Claude Code and Codex sessions too."
                        : "Control Happy Desktop from your phone, and remotely control terminal Claude Code and Codex sessions started with happy claude or happy codex."
                }
            >
                <div className="happy-desktop-mobile-setup__body">
                    <p className="happy-desktop-mobile-setup__note">{ENCRYPTION_COPY}</p>
                    <p className="happy-desktop-mobile-setup__note">
                        You can also set this up later in Settings → Mobile Access.
                    </p>
                    <div className="happy-desktop-mobile-setup__actions">
                        <Button onClick={props.onContinue} size="large">
                            {step.alreadyLinked ? "Finish mobile setup" : "Set up mobile access"}
                        </Button>
                        {skip}
                    </div>
                </div>
            </SetupPage>
        );

    if (step.kind === "get-app")
        return (
            <SetupPage
                {...frame}
                scene="open-hands"
                title="Get the app"
                copy={`Search ${step.platform === "ios" ? "the App Store" : "Google Play"} for Happy Coder, or scan this code with your phone’s camera. Open the app and finish account setup.`}
            >
                <div className="happy-desktop-mobile-setup__body">
                    <div className="happy-desktop-mobile-setup__platform">
                        <SegmentedControl
                            aria-label="Phone platform"
                            value={step.platform}
                            onChange={(value) => {
                                if (value === "ios" || value === "android")
                                    props.onPlatformSelect?.(value);
                            }}
                            segments={[
                                { value: "ios", label: "iPhone" },
                                { value: "android", label: "Android" },
                            ]}
                        />
                    </div>
                    <QRCode
                        data={STORE_URLS[step.platform]}
                        size={160}
                        label="QR code to download Happy Coder"
                        data-testid="happy-mobile-store-qr"
                    />
                    <a
                        className="happy-desktop-mobile-setup__link"
                        href={STORE_URLS[step.platform]}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {step.platform === "ios"
                            ? "View on the App Store"
                            : "Get it on Google Play"}
                    </a>
                    <div className="happy-desktop-mobile-setup__actions">
                        <Button
                            disabled={step.preparation !== "ready"}
                            onClick={props.onContinue}
                            size="large"
                        >
                            I have the app open
                        </Button>
                        {skip}
                    </div>
                    <div className="happy-desktop-mobile-setup__preparation" aria-live="polite">
                        {step.preparation === "preparing" ? (
                            <SetupProgress
                                label="Downloading / updating the Happy CLI…"
                                progress={{ kind: "waiting" }}
                                tone="inverse"
                            />
                        ) : null}
                        {step.preparation === "ready" ? (
                            <p className="happy-desktop-mobile-setup__note">Happy CLI is ready.</p>
                        ) : null}
                        {step.preparation === "failed" ? (
                            <>
                                <p className="happy-desktop-mobile-setup__note" role="alert">
                                    {step.message ??
                                        "Happy CLI setup needs attention. Your existing sign-in and sessions were kept."}
                                </p>
                                <Button onClick={props.onContinue} size="medium">
                                    Retry CLI setup
                                </Button>
                            </>
                        ) : null}
                    </div>
                </div>
            </SetupPage>
        );

    if (step.kind === "link") {
        const pairing = step.phase.kind === "pairing" ? step.phase : undefined;
        return (
            <SetupPage
                {...frame}
                scene="closed-lock"
                title="Connect your phone"
                copy={
                    pairing
                        ? "In Happy Coder, tap Open Camera and scan this code. Approve the connection on your phone."
                        : step.phase.kind === "checking"
                          ? "Checking whether this computer is already linked."
                          : "Your existing sign-in stays in place while Happy finishes mobile setup."
                }
            >
                <div className="happy-desktop-mobile-setup__body">
                    <p className="happy-desktop-mobile-setup__note">{ENCRYPTION_COPY}</p>
                    {pairing ? (
                        <>
                            <QRCode
                                data={pairing.data}
                                size={192}
                                label="QR code to link your devices"
                                data-testid="happy-mobile-pairing-qr"
                            />
                            <p className="happy-desktop-mobile-setup__note" role="status">
                                Waiting for your phone · expires{" "}
                                {new Intl.DateTimeFormat(undefined, {
                                    hour: "numeric",
                                    minute: "2-digit",
                                }).format(pairing.expiresAt)}
                            </p>
                        </>
                    ) : step.phase.kind === "failed" ? (
                        <>
                            <p className="happy-desktop-mobile-setup__note" role="alert">
                                {step.phase.message}
                            </p>
                            <Button onClick={props.onContinue} size="large">
                                Try again
                            </Button>
                        </>
                    ) : (
                        <SetupProgress
                            label={
                                step.phase.kind === "preparing"
                                    ? "Setting up the Happy CLI…"
                                    : step.phase.kind === "checking"
                                      ? "Checking your connection…"
                                      : "Finishing mobile setup…"
                            }
                            progress={{ kind: "waiting" }}
                            tone="inverse"
                        />
                    )}
                    {skip}
                </div>
            </SetupPage>
        );
    }

    return (
        <SetupPage
            {...frame}
            scene="confetti-ball"
            title={step.online ? "Your phone is connected" : "Your phone is linked"}
            copy="Control Happy Desktop from Happy Coder. To control a vanilla Claude Code or Codex session remotely, start it with one of these commands—or start a new session directly from your phone."
        >
            <div className="happy-desktop-mobile-setup__body">
                <code className="happy-setup-page__command">happy claude</code>
                <code className="happy-setup-page__command">happy codex</code>
                <p className="happy-desktop-mobile-setup__note">{ENCRYPTION_COPY}</p>
                {!step.online ? (
                    <p className="happy-desktop-mobile-setup__note" role="status">
                        Already linked · Waiting for connection.{" "}
                        {step.message ?? "Remote control resumes when your computer is online."}
                    </p>
                ) : null}
                <Button onClick={props.onContinue} size="large">
                    Continue
                </Button>
            </div>
        </SetupPage>
    );
}
