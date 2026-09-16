import { delimiter, dirname, join } from "node:path";

import type { GymRunPaths } from "./types.js";

/** Host tools are inherited by path; credentials and user state stay outside the run. */
export function gymHostEnvironment(paths: GymRunPaths): Record<string, string> {
    const shared = {
        HOME: paths.home,
        LANG: "C.UTF-8",
        LOGNAME: "happy-desktop-gym",
        TERM: "xterm-256color",
        USER: "happy-desktop-gym",
        TMPDIR: paths.tmp,
        XDG_CACHE_HOME: join(paths.home, ".cache"),
        XDG_CONFIG_HOME: join(paths.home, ".config"),
        XDG_DATA_HOME: join(paths.home, ".local", "share"),
        XDG_STATE_HOME: join(paths.home, ".local", "state"),
    };
    if (process.platform !== "win32") {
        return {
            ...shared,
            PATH: `${paths.bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
            SHELL: process.platform === "linux" ? "/bin/bash" : "/bin/zsh",
        };
    }
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    return {
        ...shared,
        SystemRoot: systemRoot,
        WINDIR: systemRoot,
        ComSpec: join(systemRoot, "System32", "cmd.exe"),
        PATHEXT: process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD",
        PATH: [paths.bin, dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
        SHELL: join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        USERPROFILE: paths.home,
        APPDATA: join(paths.home, "AppData", "Roaming"),
        LOCALAPPDATA: join(paths.home, "AppData", "Local"),
        TEMP: paths.tmp,
        TMP: paths.tmp,
    };
}
