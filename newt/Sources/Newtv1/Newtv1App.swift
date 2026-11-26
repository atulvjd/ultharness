import SwiftUI
import AppKit

struct Newtv1App: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        MenuBarExtra("Newtv1", systemImage: "waveform.circle.fill") {
            Button("Open Missions") { delegate.harness.present() }
            Newtv1Menu(model: delegate.model, speech: delegate.model.speech)
        }
        Settings { EmptyView() }
            .commands {
                CommandGroup(after: .newItem) {
                    Button("Connect Project Folder…") { delegate.harness.connectFolder() }.keyboardShortcut("o")
                    Button("Open Dashboard in Browser") { delegate.harness.openBrowser() }
                    Button("Reload Dashboard") { delegate.harness.reload() }
                    Button("Open Workspace Data") { delegate.harness.openData() }
                    Button("Open Desktop Log") { delegate.harness.openLog() }
                }
                CommandMenu("Model Services") {
                    Button("Open OmniRoute") { delegate.harness.openGateway() }
                    Button("Start Installed OmniRoute") { delegate.harness.startGateway() }
                    Button("Start Installed Ollama") { delegate.harness.startOllama() }
                }
                CommandGroup(after: .appInfo) {
                    Button("Open Missions") { delegate.harness.present() }
                    Button("Open Command Center") { delegate.model.openCommandCenter() }
                    Button("Stop All Actions") { delegate.model.stopAllActions() }.keyboardShortcut(".", modifiers: [.command])
                }
            }
    }
}

private struct Newtv1Menu: View {
    @ObservedObject var model: AppModel
    @ObservedObject var speech: SpeechController
    var body: some View {
        Button(speech.isTranscribing ? "Cancel Transcription" : speech.isListening ? "Stop Listening" : "Start Listening  ⌥Space") { model.toggleListening() }
        Button("Talk with Newt") { model.openCommandCenter(page: .companion) }
        Button("Tasks") { model.openCommandCenter(page: .jobs) }
        Button("Open Command Center") { model.openCommandCenter() }
        Button("Customize Notch") { model.openCommandCenter(page: .notch) }
        Button("Settings") { model.openCommandCenter(page: .settings) }
        Divider()
        Button("Stop All Actions") { model.stopAllActions() }
        Button("Quit Newtv1") { NSApp.terminate(nil) }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = AppModel()
    let harness = HarnessWorkspace()
    private var lastMission: (id: String, status: String)?
    private var desktop: NotchController?
    private var captions: CaptionController?
    func applicationDidFinishLaunching(_ notification: Notification) {
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(revealExistingInstance), name: SingleAppSession.revealNotification, object: nil)
        NSApp.setActivationPolicy(.regular)
        let desktop = NotchController(model: model)
        self.desktop = desktop
        model.onOpenCommandCenter = { [weak desktop] in desktop?.openCommandCenter() }
        captions = CaptionController(speaker: model.speaker)
        model.onMission = { [weak self] in self?.harness.present($0) }
        harness.onOpenNewt = { [weak self] in self?.model.openCommandCenter(page: .companion) }
        harness.onProgress = { [weak self] id, title, status in
            guard let self else { return }
            self.model.missionProgress = title + " · " + status.replacingOccurrences(of: "_", with: " ")
            if let previous = self.lastMission, previous.id == id, previous.status != status,
               ["blocked", "awaiting_acceptance", "accepted"].contains(status) {
                self.model.notices.add("Mission " + status.replacingOccurrences(of: "_", with: " "), detail: title)
            }
            self.lastMission = (id, status)
        }
        harness.onResult = { [weak self] command, text in
            guard let self else { return }
            self.model.notices.add("Missions", detail: text)
            if command == .status && self.model.speakAnswers { self.model.speakAnswer(text) }
        }
        desktop.start()
        harness.present()
    }
    @objc private func revealExistingInstance() {
        model.openCommandCenter()
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        harness.present(); return true
    }
    func applicationWillTerminate(_ notification: Notification) { harness.shutdown(); model.stop(pauseAutomaticRoutines: false); model.speech.stop() }
}
