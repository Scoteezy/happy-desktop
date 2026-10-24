// Watches the macOS window server for one process: every window it owns, which
// of them are on screen, and whether it ever has a Dock tile or becomes the
// active application. Samples every 25ms until SIGTERM/SIGINT, then prints one
// JSON report. Reads only public window-list and workspace state; it never
// captures pixels.
import AppKit
import CoreGraphics
import Foundation

let arguments = CommandLine.arguments
guard let pidIndex = arguments.firstIndex(of: "--pid"), pidIndex + 1 < arguments.count,
    let target = Int32(arguments[pidIndex + 1])
else {
    FileHandle.standardError.write("usage: window-server-watch --pid PID\n".data(using: .utf8)!)
    exit(2)
}

let started = Date()
var samples = 0
var systemWindowsMax = 0
var windowsSeen = Set<Int>()
var onscreenSamples = 0
var onscreenFirst: [[String: Any]] = []
var regularPolicySamples = 0
var activeSamples = 0
var frontmostSeen = Set<String>()

func sample() {
    samples += 1
    if let front = NSWorkspace.shared.frontmostApplication {
        frontmostSeen.insert("\(front.localizedName ?? "?") (\(front.processIdentifier))")
    }
    if let app = NSRunningApplication(processIdentifier: target) {
        if app.activationPolicy == .regular { regularPolicySamples += 1 }
        if app.isActive { activeSamples += 1 }
    }
    guard let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]
    else { return }
    systemWindowsMax = max(systemWindowsMax, list.count)
    for window in list where (window[kCGWindowOwnerPID as String] as? Int32) == target {
        windowsSeen.insert(window[kCGWindowNumber as String] as? Int ?? -1)
        guard (window[kCGWindowIsOnscreen as String] as? Bool) == true else { continue }
        onscreenSamples += 1
        if onscreenFirst.count < 5 {
            onscreenFirst.append([
                "atMs": Int(Date().timeIntervalSince(started) * 1000),
                "window": window[kCGWindowNumber as String] ?? -1,
                "bounds": window[kCGWindowBounds as String] ?? [:],
                "layer": window[kCGWindowLayer as String] ?? 0,
            ])
        }
    }
}

func finish() -> Never {
    let report: [String: Any] = [
        "pid": target,
        "samples": samples,
        "durationMs": Int(Date().timeIntervalSince(started) * 1000),
        "systemWindowsMax": systemWindowsMax,
        "windowsOwned": windowsSeen.count,
        "onscreenSamples": onscreenSamples,
        "onscreenFirst": onscreenFirst,
        "regularPolicySamples": regularPolicySamples,
        "activeSamples": activeSamples,
        "frontmostApplications": Array(frontmostSeen).sorted(),
    ]
    let data = try! JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    exit(0)
}

signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminate.setEventHandler { finish() }
terminate.resume()
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
interrupt.setEventHandler { finish() }
interrupt.resume()
let timer = DispatchSource.makeTimerSource(queue: .main)
timer.schedule(deadline: .now(), repeating: .milliseconds(25))
timer.setEventHandler { sample() }
timer.resume()
// Signal readiness only after the first sample has run.
DispatchQueue.main.async {
    FileHandle.standardError.write("ready\n".data(using: .utf8)!)
}
dispatchMain()
