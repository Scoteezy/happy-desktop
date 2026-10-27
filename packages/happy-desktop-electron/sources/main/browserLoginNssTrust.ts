import { dirname, join } from "node:path";
import {
    browserLoginLibraryInstallProtected,
    browserLoginLibraryVerify,
    type BrowserLoginLibraryPublisher,
    type BrowserLoginVerifiedLibrary,
} from "./browserLoginLibraryTrust";

/** Mozilla Corporation, which signs every Firefox build: Team ID 43AQ936H96. */
const mozilla: BrowserLoginLibraryPublisher = {
    refusal:
        "Happy could not verify that Firefox is Mozilla's own install. Reinstall Firefox from mozilla.org and try again.",
    appleTeamId: "43AQ936H96",
    macBundle: (library) => {
        const bundle = dirname(dirname(dirname(library)));
        return dirname(bundle) === "/Applications" &&
            /^Firefox[^/]*\.app$/.test(bundle.slice("/Applications/".length)) &&
            library === join(bundle, "Contents/MacOS/libnss3.dylib")
            ? bundle
            : null;
    },
};

/** Whether Firefox is installed so that this user cannot change it, which Happy requires to load NSS. */
export function browserLoginNssInstallProtected(nssLibraryPath: string): Promise<boolean> {
    return browserLoginLibraryInstallProtected(nssLibraryPath, mozilla);
}

/** NSS loads only from a root-owned Firefox install whose code is Mozilla's. */
export function browserLoginNssVerify(
    nssLibraryPath: string,
): Promise<BrowserLoginVerifiedLibrary> {
    return browserLoginLibraryVerify(nssLibraryPath, mozilla);
}
