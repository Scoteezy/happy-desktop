import { Button } from "./Button";
import { OnboardingSteps, type MobileOnboardingStage } from "./OnboardingSteps";
import { QRCode } from "./QRCode";
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
          /** Supplied by setup state, including checks before the app-download step. */
          readonly appReady: boolean;
          readonly phase:
              | { readonly kind: "checking" | "preparing" | "finishing" }
              | { readonly kind: "pairing"; readonly data: string; readonly expiresAt: number }
              | { readonly kind: "failed"; readonly message: string };
      }
    | { readonly kind: "connected"; readonly online: boolean; readonly message?: string };

export interface DesktopMobileSetupProps {
    /** Full first-run context; Settings shows only the opted-in mobile branch. */
    readonly onboarding?: boolean;
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
const ENCRYPTION_COPY = "Messages and session content are end-to-end encrypted.";

/** Optional desktop-to-phone setup. All operations and progress arrive through props. */
export function DesktopMobileSetup(props: DesktopMobileSetupProps) {
    const { step } = props;
    const mobile: MobileOnboardingStage | undefined =
        step.kind === "intro"
            ? undefined
            : step.kind === "get-app" || (step.kind === "link" && !step.appReady)
              ? "get-app"
              : step.kind === "link"
                ? "connect"
                : "complete";
    const failed =
        (step.kind === "get-app" && step.preparation === "failed") ||
        (step.kind === "link" && step.phase.kind === "failed");
    const steps = props.onboarding ? (
        <OnboardingSteps scope="desktop" stage="mobile" mobile={mobile} failed={failed} />
    ) : mobile ? (
        <OnboardingSteps scope="mobile" stage={mobile} failed={failed} />
    ) : undefined;
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-desktop-mobile-setup",
        sceneSize: steps || step.kind === "get-app" || step.kind === "link" ? 48 : 80,
        steps,
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
                title={step.alreadyLinked ? "Your phone is already linked" : "Take Happy with you"}
                copy={
                    step.alreadyLinked
                        ? "Finish setup to steer your agents and start new ones from your phone."
                        : "Steer your agents and start new ones from your phone."
                }
            >
                <div className="happy-desktop-mobile-setup__body">
                    <p className="happy-desktop-mobile-setup__note">{ENCRYPTION_COPY}</p>
                    <div className="happy-desktop-mobile-setup__actions">
                        <Button onClick={props.onContinue} size="large">
                            {step.alreadyLinked ? "Finish mobile setup" : "Connect phone"}
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
                title="Get Happy Coder"
                copy="Scan with your phone’s camera to install the app."
            >
                <div className="happy-desktop-mobile-setup__body">
                    <div className="happy-desktop-mobile-setup__download">
                        <div
                            className="happy-desktop-mobile-setup__platform"
                            role="group"
                            aria-label="Phone platform"
                        >
                            <Button
                                aria-pressed={step.platform === "ios"}
                                variant={step.platform === "ios" ? "primary" : "ghost"}
                                onClick={() => props.onPlatformSelect?.("ios")}
                                fullWidth
                            >
                                iPhone
                            </Button>
                            <Button
                                aria-pressed={step.platform === "android"}
                                variant={step.platform === "android" ? "primary" : "ghost"}
                                onClick={() => props.onPlatformSelect?.("android")}
                                fullWidth
                            >
                                Android
                            </Button>
                        </div>
                        <QRCode
                            data={STORE_URLS[step.platform]}
                            size={160}
                            label="QR code to download Happy Coder"
                            data-testid="happy-mobile-store-qr"
                        />
                    </div>
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
                                label="Preparing mobile access…"
                                progress={{ kind: "waiting" }}
                                tone="inverse"
                            />
                        ) : null}
                        {step.preparation === "ready" ? (
                            <p className="happy-desktop-mobile-setup__note">Ready to connect.</p>
                        ) : null}
                        {step.preparation === "failed" ? (
                            <>
                                <p className="happy-desktop-mobile-setup__note" role="alert">
                                    {step.message ??
                                        "Mobile setup couldn’t finish. Your sign-in and sessions are unchanged."}
                                </p>
                                <Button onClick={props.onContinue} size="medium">
                                    Try again
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
                        ? "Follow the onboarding instructions in Happy Coder. Scan this code when prompted."
                        : step.phase.kind === "checking"
                          ? "Checking whether this computer is already linked."
                          : "Finishing your connection…"
                }
            >
                <div className="happy-desktop-mobile-setup__body">
                    {pairing ? (
                        <>
                            <QRCode
                                data={pairing.data}
                                size={160}
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
                                    ? "Preparing mobile access…"
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
            copy="Steer your agents and start new ones from your phone."
        >
            <div className="happy-desktop-mobile-setup__body">
                {!step.online ? (
                    <p className="happy-desktop-mobile-setup__note" role="status">
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
