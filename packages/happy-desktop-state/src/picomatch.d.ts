/**
 * The slice of picomatch's POSIX entry the change tiers use. The package ships
 * no declarations of its own, and the POSIX entry is the one that never reaches
 * for Node's `path`, so it runs the same in the renderer as under test.
 */
declare module "picomatch/posix" {
    interface PicomatchOptions {
        /** Lets `*` and `**` match names that start with a dot. */
        readonly dot?: boolean;
        /** Matches a pattern without slashes against the last segment of the path. */
        readonly basename?: boolean;
    }
    function picomatch(
        glob: string | readonly string[],
        options?: PicomatchOptions,
    ): (path: string) => boolean;
    export default picomatch;
}
