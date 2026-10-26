import { execFile } from "node:child_process";
import { join } from "node:path";
import { systemPreferences, type BrowserWindow } from "electron";

/**
 * The person asks from Happy's focused window. After the system prompt only
 * the window's presence is required: the Touch ID or Windows Hello panel holds
 * focus while it closes, so Happy is not focused again yet.
 */
function promptWindowRequire(window: BrowserWindow, focused = true): void {
    if (
        process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined ||
        process.env.HAPPY_DESKTOP_GYM_PROFILE !== undefined ||
        window.isDestroyed() ||
        !window.isVisible() ||
        (focused && !window.isFocused())
    )
        throw new Error("Open and focus Happy to authorize showing a saved password.");
}

/** Main-only proof of current user presence. This function never handles a password. */
export async function browserPasswordRevealAuthorize(window: BrowserWindow): Promise<void> {
    promptWindowRequire(window);
    if (process.platform === "darwin") {
        if (!systemPreferences.canPromptTouchID())
            throw new Error(
                "Touch ID is unavailable. Set up Touch ID to show saved passwords on this Mac.",
            );
        try {
            await systemPreferences.promptTouchID("show a saved browser password");
        } catch {
            throw new Error("Touch ID did not authorize showing the password.");
        }
        promptWindowRequire(window, false);
        return;
    }
    if (process.platform !== "win32")
        throw new Error("Showing saved passwords requires macOS or Windows.");

    const handle = window.getNativeWindowHandle();
    const hwnd = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
    const result = await windowsPresenceRequest(window, hwnd);
    if (result === "unavailable")
        throw new Error(
            "Windows Hello is unavailable. Set up a Windows Hello PIN, face, or fingerprint to show saved passwords.",
        );
    if (result !== "verified")
        throw new Error("Windows Hello did not authorize showing the password.");
    promptWindowRequire(window, false);
}

function windowsPresenceRequest(window: BrowserWindow, hwnd: bigint): Promise<string> {
    // The HWND and fixed verification message are the only request data. In particular,
    // no login, account name, password, token, or vault key enters this child process.
    // Desktop apps use IUserConsentVerifierInterop, not the UWP-only window lookup.
    // Interface definition: Windows SDK UserConsentVerifierInterop.h (IInspectable).
    const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("39E050C3-4E74-441A-8DC0-B81104DF949C"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
public interface HappyUserConsentVerifierInterop {
    [return: MarshalAs(UnmanagedType.IInspectable)]
    object RequestVerificationForWindowAsync(IntPtr window,
        [MarshalAs(UnmanagedType.HString)] string message, ref Guid operationId);
}
public static class HappyUserConsentVerifier {
    public static object Request(object factory, long window, Guid operationId) {
        return ((HappyUserConsentVerifierInterop)factory).RequestVerificationForWindowAsync(
            new IntPtr(window), "Show a saved browser password in Happy", ref operationId);
    }
}
'@
    $verifier = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType=WindowsRuntime]
    $availabilityType = [Windows.Security.Credentials.UI.UserConsentVerifierAvailability, Windows.Security.Credentials.UI, ContentType=WindowsRuntime]
    $resultType = [Windows.Security.Credentials.UI.UserConsentVerificationResult, Windows.Security.Credentials.UI, ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
        $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\u00601'
    } | Select-Object -First 1
    if ($null -eq $asTask) { throw 'Unavailable' }
    $availabilityTask = $asTask.MakeGenericMethod($availabilityType).Invoke($null, @($verifier::CheckAvailabilityAsync()))
    $availability = $availabilityTask.GetAwaiter().GetResult()
    if ($availability.ToString() -ne 'Available') {
        [Console]::Out.Write('unavailable')
    } else {
        $awaitResult = $asTask.MakeGenericMethod($resultType)
        $operationId = $awaitResult.GetParameters()[0].ParameterType.GUID
        $factory = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeMarshal]::GetActivationFactory($verifier)
        $operation = [HappyUserConsentVerifier]::Request($factory, [long]${hwnd.toString()}, $operationId)
        $task = $awaitResult.Invoke($null, @($operation))
        $result = $task.GetAwaiter().GetResult()
        if ($result.ToString() -eq 'Verified') { [Console]::Out.Write('verified') }
        else { [Console]::Out.Write('cancelled') }
    }
} catch { [Console]::Out.Write('unavailable') }
`;
    return new Promise((resolve, reject) => {
        const child = execFile(
            join(
                process.env.SystemRoot || "C:\\Windows",
                "System32",
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe",
            ),
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Sta",
                "-EncodedCommand",
                Buffer.from(script, "utf16le").toString("base64"),
            ],
            { windowsHide: true, timeout: 120_000, maxBuffer: 4096, encoding: "utf8" },
            (error, stdout) => {
                window.off("closed", cancel);
                window.off("hide", cancel);
                // Child-process exceptions can contain captured streams. Only our fixed
                // status crosses this boundary; OS diagnostics are deliberately discarded.
                if (error)
                    reject(new Error("Windows Hello could not complete this authorization."));
                else resolve(stdout.trim());
            },
        );
        function cancel(): void {
            child.kill();
        }
        window.once("closed", cancel);
        window.once("hide", cancel);
    });
}
