import koffi, { type LibraryHandle } from "koffi";

import { browserLoginNativeBytesCopy } from "./browserLoginNativeBytes";

type NativeFunction = ReturnType<LibraryHandle["func"]>;

/** Status codes from Security.framework's SecBase.h. */
const errSecSuccess = 0;
export const errSecItemNotFound = -25300;
const kCFStringEncodingUTF8 = 0x08000100;
const maximumSecretBytes = 16 * 1024;

/** A Keychain refusal: not found, denied, or canceled. Carries only the OS status. */
export class BrowserLoginKeychainError extends Error {
    constructor(readonly status: number) {
        super("The Keychain did not return this browser's key.");
    }
}

interface KeychainApi {
    readonly stringCreate: NativeFunction;
    readonly dictionaryCreate: NativeFunction;
    readonly dictionarySet: NativeFunction;
    readonly dataLength: NativeFunction;
    readonly dataBytes: NativeFunction;
    readonly release: NativeFunction;
    readonly copyMatching: NativeFunction;
    readonly keyCallBacks: unknown;
    readonly valueCallBacks: unknown;
    readonly booleanTrue: unknown;
    readonly secClass: unknown;
    readonly secClassGenericPassword: unknown;
    readonly secAttrService: unknown;
    readonly secReturnData: unknown;
    readonly secReturnAttributes: unknown;
    readonly secMatchLimit: unknown;
    readonly secMatchLimitOne: unknown;
}

let keychainApi: KeychainApi | undefined;

/** System frameworks only; loaded on the first unlock, never during discovery. */
function apiLoad(): KeychainApi {
    if (keychainApi) return keychainApi;
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const security = koffi.load("/System/Library/Frameworks/Security.framework/Security");
    // Framework constants are exported variables holding a CFTypeRef.
    const constant = (library: LibraryHandle, name: string): unknown =>
        koffi.decode(library.symbol(name), "void *");
    keychainApi = {
        stringCreate: cf.func(
            "void *CFStringCreateWithCString(void *allocator, const char *text, uint32_t encoding)",
        ),
        dictionaryCreate: cf.func(
            "void *CFDictionaryCreateMutable(void *allocator, intptr_t capacity, void *keyCallBacks, void *valueCallBacks)",
        ),
        dictionarySet: cf.func(
            "void CFDictionarySetValue(void *dictionary, void *key, void *value)",
        ),
        dataLength: cf.func("intptr_t CFDataGetLength(void *data)"),
        dataBytes: cf.func("void *CFDataGetBytePtr(void *data)"),
        release: cf.func("void CFRelease(void *object)"),
        copyMatching: security.func("int SecItemCopyMatching(void *query, _Out_ void **result)"),
        // The callback tables are structs; the dictionary takes their addresses.
        keyCallBacks: cf.symbol("kCFTypeDictionaryKeyCallBacks"),
        valueCallBacks: cf.symbol("kCFTypeDictionaryValueCallBacks"),
        booleanTrue: constant(cf, "kCFBooleanTrue"),
        secClass: constant(security, "kSecClass"),
        secClassGenericPassword: constant(security, "kSecClassGenericPassword"),
        secAttrService: constant(security, "kSecAttrService"),
        secReturnData: constant(security, "kSecReturnData"),
        secReturnAttributes: constant(security, "kSecReturnAttributes"),
        secMatchLimit: constant(security, "kSecMatchLimit"),
        secMatchLimitOne: constant(security, "kSecMatchLimitOne"),
    };
    return keychainApi;
}

/**
 * Reads one generic password from the person's Keychain inside Happy's own
 * process, so the system prompt names Happy and "Always Allow" trusts only
 * Happy's signature, never a shared command-line tool. The lookup blocks on
 * that prompt, so it runs on a worker thread and leaves every window live.
 * The caller owns the returned buffer and must wipe it.
 */
export function browserLoginKeychainPasswordRead(
    service: string,
    signal: AbortSignal,
): Promise<Buffer> {
    if (process.platform !== "darwin")
        return Promise.reject(new Error("The Keychain is available on macOS only."));
    return query(service, "data", signal) as Promise<Buffer>;
}

/**
 * Whether the Keychain holds a browser's key at all. Only the item's
 * attributes are asked for, which never prompts; a browser that left its
 * profile folder behind but no key has nothing Happy could unlock.
 */
export async function browserLoginKeychainItemExists(service: string): Promise<boolean> {
    if (process.platform !== "darwin") return true;
    try {
        await query(service, "attributes", new AbortController().signal);
        return true;
    } catch (error) {
        return !(error instanceof BrowserLoginKeychainError && error.status === errSecItemNotFound);
    }
}

function query(
    service: string,
    returning: "data" | "attributes",
    signal: AbortSignal,
): Promise<Buffer | null> {
    const api = apiLoad();
    const owned: unknown[] = [];
    const text = (value: string) => {
        const created = api.stringCreate(null, value, kCFStringEncodingUTF8);
        if (!created) throw new BrowserLoginKeychainError(errSecItemNotFound);
        owned.push(created);
        return created;
    };
    const releaseOwned = () => {
        for (const object of owned.splice(0)) api.release(object);
    };
    let dictionary: unknown;
    try {
        dictionary = api.dictionaryCreate(null, 0, api.keyCallBacks, api.valueCallBacks);
        if (!dictionary) throw new BrowserLoginKeychainError(errSecItemNotFound);
        owned.push(dictionary);
        api.dictionarySet(dictionary, api.secClass, api.secClassGenericPassword);
        api.dictionarySet(dictionary, api.secAttrService, text(service));
        api.dictionarySet(
            dictionary,
            returning === "data" ? api.secReturnData : api.secReturnAttributes,
            api.booleanTrue,
        );
        api.dictionarySet(dictionary, api.secMatchLimit, api.secMatchLimitOne);
    } catch (error) {
        releaseOwned();
        return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
        const result: unknown[] = [null];
        api.copyMatching.async(dictionary, result, (error: unknown, status: number) => {
            releaseOwned();
            const data = result[0];
            let secret: Buffer | undefined;
            try {
                if (error || status !== errSecSuccess || !data)
                    throw new BrowserLoginKeychainError(error ? errSecItemNotFound : status);
                if (returning === "attributes") {
                    resolve(null);
                    return;
                }
                const length = Number(api.dataLength(data));
                if (!Number.isSafeInteger(length) || length <= 0 || length > maximumSecretBytes)
                    throw new BrowserLoginKeychainError(errSecItemNotFound);
                // Copy out of the CFData before releasing it: no JS view outlives it.
                secret = browserLoginNativeBytesCopy(api.dataBytes(data), length);
                if (signal.aborted) throw signal.reason ?? new Error("Canceled.");
                resolve(secret);
            } catch (failure) {
                secret?.fill(0);
                reject(failure);
            } finally {
                if (data) api.release(data);
            }
        });
    });
}
