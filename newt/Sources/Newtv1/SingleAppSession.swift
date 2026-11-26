import AppKit
import SwiftUI
import Newtv1Core

/// Claim the session before AppModel registers shortcuts or starts services.
@main
enum SingleAppSession {
    static let revealNotification = Notification.Name("dev.newtv1.mac.revealExistingInstance")

    @MainActor static func main() {
        if CommandLine.arguments.contains("--smoke-test") {
            guard ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_DATA_DIR"] != nil,
                  ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_ROOT"] != nil,
                  ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_IGNORE_EXISTING"] == "1" else {
                fputs("Smoke testing requires an isolated workspace and data directory.\n", stderr); exit(2)
            }
            let application = NSApplication.shared
            let delegate = MissionSmokeDelegate()
            application.delegate = delegate
            withExtendedLifetime(delegate) { application.run() }
            return
        }
        let identifier = Bundle.main.bundleIdentifier ?? "dev.newtv1.mac"
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
            .filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier && !$0.isTerminated }
            .filter { ($0.launchDate ?? .distantPast) < (NSRunningApplication.current.launchDate ?? .distantFuture) }
        // Older releases do not hold the lock, so also check running bundles.
        if let existing = others.first {
            reveal(existing)
            return
        }
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory,
                in: .userDomainMask, appropriateFor: nil, create: true)
                .appendingPathComponent("Newtv1", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let session = try ProcessSessionLock(url: directory.appendingPathComponent("app-session.lock"))
            guard session.acquired else {
                reveal(NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
                    .first { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier })
                return
            }
            withExtendedLifetime(session) { Newtv1App.main() }
        } catch {
            let alert = NSAlert()
            alert.messageText = "Newtv1 could not start safely"
            alert.informativeText = "The app could not reserve its microphone and shortcut session. \(error.localizedDescription)"
            alert.runModal()
        }
    }

    @MainActor private static func reveal(_ app: NSRunningApplication?) {
        app?.activate(options: [.activateIgnoringOtherApps])
        DistributedNotificationCenter.default().postNotificationName(revealNotification, object: nil, userInfo: nil, deliverImmediately: true)
    }
}

@MainActor
private final class MissionSmokeDelegate: NSObject, NSApplicationDelegate {
    let workspace = HarnessWorkspace()
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let command = MissionCommand("Start mission Make a local fixture") { workspace.present(command) }
    }
    func applicationWillTerminate(_ notification: Notification) { workspace.shutdown() }
}
