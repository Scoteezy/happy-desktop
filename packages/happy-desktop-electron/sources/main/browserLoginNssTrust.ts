import { dirname, join, relative, sep } from "node:path";
import {
    browserLoginLibraryTrustRequire,
    type BrowserLoginLibraryPublisher,
} from "./browserLoginLibraryTrust";

function inside(root: string, path: string): boolean {
    const fromRoot = relative(root, path);
    return fromRoot !== "" && !fromRoot.startsWith(`..${sep}`) && fromRoot !== "..";
}

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
    windowsOrganizations: ["Mozilla Corporation"],
    windowsLocation: (library, programFiles) => programFiles.some((root) => inside(root, library)),
};

/** NSS loads only from a system-wide Firefox install whose code is Mozilla's. */
export function browserLoginNssTrustRequire(nssLibraryPath: string): Promise<void> {
    return browserLoginLibraryTrustRequire(nssLibraryPath, mozilla);
}
