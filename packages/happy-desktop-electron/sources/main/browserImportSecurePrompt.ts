import { execFile } from "node:child_process";
import { join } from "node:path";
import { isMainThread } from "node:worker_threads";
import type { BrowserWindow } from "electron";
import { browserImportNativeBytesCopy } from "./browserImportNativeBytes";

const maximumPasswordBytes = 65_536;
let promptPending = false;

function promptWindowRequire(window: BrowserWindow): void {
    if (
        process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined ||
        process.env.HAPPY_DESKTOP_GYM_PROFILE !== undefined ||
        !isMainThread ||
        window.isDestroyed() ||
        !window.isVisible() ||
        !window.isFocused()
    )
        throw new Error("Open and focus Happy to enter the browser's primary password.");
}

/**
 * Main-only native input, invoked only after a person commits an import selection.
 * The NSS caller owns the returned UTF-8 buffer and must wipe it in finally.
 * Neither this module nor its errors expose the value to Electron's renderer.
 */
export async function browserImportSecurePrompt(
    window: BrowserWindow,
    label: string,
): Promise<Buffer | null> {
    promptWindowRequire(window);
    if (process.platform !== "darwin" && process.platform !== "win32")
        throw new Error("Browser primary-password input is supported on macOS and Windows.");
    if (promptPending) throw new Error("A browser primary-password prompt is already open.");
    const safeLabel = label.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").slice(0, 256);
    promptPending = true;
    try {
        if (process.platform === "darwin") return await macPrompt(window, safeLabel);
        if (process.platform === "win32") return await windowsPrompt(window, safeLabel);
        return null;
    } catch {
        throw new Error("The browser primary-password prompt could not complete.");
    } finally {
        promptPending = false;
    }
}

async function macPrompt(window: BrowserWindow, label: string): Promise<Buffer | null> {
    // Loading AppKit is intentionally lazy. Merely discovering profiles never opens
    // UI, prompts the Keychain, or initializes this native integration.
    const koffi = (await import("koffi")).default;
    const objc = koffi.load("/usr/lib/libobjc.A.dylib");
    const appKit = koffi.load("/System/Library/Frameworks/AppKit.framework/AppKit");
    const getClass = objc.func("void *objc_getClass(const char *name)");
    const selector = objc.func("void *sel_registerName(const char *name)");
    const object = objc.func("objc_msgSend", "void *", ["void *", "void *"]);
    const objectWithText = objc.func("objc_msgSend", "void *", [
        "void *",
        "void *",
        "const char *",
    ]);
    const objectWithObject = objc.func("objc_msgSend", "void *", ["void *", "void *", "void *"]);
    const voidWithObject = objc.func("objc_msgSend", "void", ["void *", "void *", "void *"]);
    const sendVoid = objc.func("objc_msgSend", "void", ["void *", "void *"]);
    const integer = objc.func("objc_msgSend", "int64_t", ["void *", "void *"]);
    const byteLength = objc.func("objc_msgSend", "uint64_t", ["void *", "void *", "uint64_t"]);
    // CGFloat is a double on both supported macOS architectures. Describing NSRect
    // as its four doubles lets Koffi handle x64/arm64 struct-by-value ABI correctly.
    const rect = koffi.struct({ x: "double", y: "double", width: "double", height: "double" });
    const initWithFrame = objc.func("objc_msgSend", "void *", ["void *", "void *", rect]);
    const nsText = (text: string): bigint | null =>
        objectWithText(getClass("NSString"), selector("stringWithUTF8String:"), text);
    const pool = object(object(getClass("NSAutoreleasePool"), selector("alloc")), selector("init"));
    let alert: bigint | null = null;
    let input: bigint | null = null;
    try {
        alert = object(object(getClass("NSAlert"), selector("alloc")), selector("init"));
        input = initWithFrame(
            object(getClass("NSSecureTextField"), selector("alloc")),
            selector("initWithFrame:"),
            { x: 0, y: 0, width: 320, height: 24 },
        );
        if (!alert || !input || !pool) throw new Error();
        voidWithObject(alert, selector("setMessageText:"), nsText("Browser primary password"));
        voidWithObject(
            alert,
            selector("setInformativeText:"),
            nsText(
                `Enter the primary password for ${label || "this Firefox profile"}. It is used only to unlock the sites you selected.`,
            ),
        );
        objectWithObject(alert, selector("addButtonWithTitle:"), nsText("Continue"));
        objectWithObject(alert, selector("addButtonWithTitle:"), nsText("Cancel"));
        voidWithObject(input, selector("setPlaceholderString:"), nsText("Primary password"));
        voidWithObject(alert, selector("setAccessoryView:"), input);
        voidWithObject(
            object(alert, selector("window")),
            selector("setInitialFirstResponder:"),
            input,
        );
        promptWindowRequire(window);
        // AppKit's own modal loop runs on Electron's main thread. A synchronous
        // native modal avoids Objective-C block callbacks outliving their JS owners.
        if (Number(integer(alert, selector("runModal"))) !== 1000) return null;
        if (window.isDestroyed() || !window.isVisible()) return null;
        const value = object(input, selector("stringValue"));
        const length = Number(byteLength(value, selector("lengthOfBytesUsingEncoding:"), 4)); // NSUTF8StringEncoding
        if (!Number.isSafeInteger(length) || length < 0 || length > maximumPasswordBytes)
            throw new Error();
        if (length === 0) return Buffer.alloc(0);
        const pointer = object(value, selector("UTF8String"));
        if (!pointer) throw new Error();
        // Copy directly from native bytes: do not materialize a JS password string.
        return browserImportNativeBytesCopy(pointer, length);
    } catch {
        throw new Error("The browser primary-password prompt could not complete.");
    } finally {
        if (input) {
            voidWithObject(input, selector("setStringValue:"), nsText(""));
            sendVoid(input, selector("release"));
        }
        if (alert) sendVoid(alert, selector("release"));
        if (pool) sendVoid(pool, selector("drain"));
        // These framework handles stay loaded through every native message and the
        // autorelease drain. No Objective-C object or native view escapes this call.
        void appKit;
    }
}

function windowsPrompt(window: BrowserWindow, label: string): Promise<Buffer | null> {
    // Only a sanitized, nonsecret label is in the script/command arguments. The
    // entered value travels through a private binary stdout pipe into main only.
    const encodedLabel = Buffer.from(label || "this Firefox profile", "utf8").toString("base64");
    const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$output = [Console]::OpenStandardOutput()
$credential = $null
$characters = $null
$bytes = $null
$native = [IntPtr]::Zero
try {
    $label = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedLabel}'))
    # A machine configured for console prompting cannot safely show this native
    # dialog. Do not change the person's registry or wait on an invisible console.
    $consolePrompting = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\PowerShell\\1\\ShellIds' -Name ConsolePrompting -ErrorAction SilentlyContinue
    if ($consolePrompting.ConsolePrompting) { throw 'NativePromptUnavailable' }
    $credential = Get-Credential -UserName 'Browser primary password' -Message ("Enter the primary password for " + $label + ". This unlocks only the selected sites in Happy.")
    if ($null -eq $credential) { $output.WriteByte(0) }
    elseif ($credential.Password.Length -gt ${maximumPasswordBytes}) { $output.WriteByte(2) }
    else {
        $native = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($credential.Password)
        $characters = New-Object char[] $credential.Password.Length
        for ($index = 0; $index -lt $characters.Length; $index++) {
            $characters[$index] = [char]([Runtime.InteropServices.Marshal]::ReadInt16($native, $index * 2) -band 0xffff)
        }
        $bytes = [Text.Encoding]::UTF8.GetBytes($characters)
        if ($bytes.Length -gt ${maximumPasswordBytes}) { $output.WriteByte(2) }
        else { $output.WriteByte(1); $output.Write($bytes, 0, $bytes.Length) }
    }
} catch { $output.WriteByte(2) }
finally {
    if ($native -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($native) }
    if ($null -ne $characters) { [Array]::Clear($characters, 0, $characters.Length) }
    if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    if ($null -ne $credential) { $credential.Password.Dispose() }
    $output.Flush()
}
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
                "-Sta",
                "-WindowStyle",
                "Hidden",
                "-EncodedCommand",
                Buffer.from(script, "utf16le").toString("base64"),
            ],
            {
                windowsHide: true,
                timeout: 120_000,
                maxBuffer: maximumPasswordBytes + 1,
                encoding: "buffer",
            },
            (error, stdout, stderr) => {
                window.off("closed", cancel);
                window.off("hide", cancel);
                try {
                    if (error || window.isDestroyed() || !window.isVisible()) throw new Error();
                    if (stdout.length === 1 && stdout[0] === 0) {
                        resolve(null);
                        return;
                    }
                    if (stdout[0] !== 1 || stdout.length > maximumPasswordBytes + 1)
                        throw new Error();
                    resolve(Buffer.from(stdout.subarray(1)));
                } catch {
                    // Never propagate execFile's captured stdout/stderr in its exception.
                    reject(new Error("The browser primary-password prompt could not complete."));
                } finally {
                    stdout.fill(0);
                    stderr.fill(0);
                }
            },
        );
        function cancel(): void {
            child.kill();
        }
        window.once("closed", cancel);
        window.once("hide", cancel);
    });
}
