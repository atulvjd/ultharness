import AppKit
import WebKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var engine: Process?
    private var services: [Process] = []
    private var output = ""
    private var log: FileHandle?
    private var baseURL: URL?
    private var dataFolder: URL!
    private var ownsEngine = false
    private var quitting = false
    private var smokeFinished = false
    private let smoke = CommandLine.arguments.contains("--smoke-test")

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let override = ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_DATA_DIR"]
            dataFolder = override.map { URL(fileURLWithPath: $0, isDirectory: true) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Ultharness", isDirectory: true)
            try FileManager.default.createDirectory(at: dataFolder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let logURL = dataFolder.appendingPathComponent("desktop.log")
            if let size = try? logURL.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 2_000_000 {
                let previous = dataFolder.appendingPathComponent("desktop.previous.log")
                try? FileManager.default.removeItem(at: previous)
                try FileManager.default.moveItem(at: logURL, to: previous)
            }
            if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
            log = try FileHandle(forWritingTo: logURL)
            try log?.seekToEnd()
            configureMenus()
            let configuration = WKWebViewConfiguration()
            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.navigationDelegate = self
            webView.uiDelegate = self
            webView.underPageBackgroundColor = NSColor(calibratedRed: 0.067, green: 0.075, blue: 0.055, alpha: 1)
            window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "Ultharness"
            window.minSize = NSSize(width: 760, height: 540)
            window.backgroundColor = NSColor(calibratedRed: 0.067, green: 0.075, blue: 0.055, alpha: 1)
            window.contentView = webView
            window.center()
            window.makeKeyAndOrderFront(nil)
            window.setFrameAutosaveName("UltharnessMainWindow")
            NSApp.activate(ignoringOtherApps: true)
            webView.loadHTMLString("<body style='background:#11130e;color:#d5eaa1;font:18px -apple-system;padding:60px'>Opening Ultharness…</body>", baseURL: nil)
            if ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_IGNORE_EXISTING"] == "1" { startEngine() }
            else { findExistingEngine() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
                guard let self, self.baseURL == nil else { return }
                self.fail("The local engine did not start. Check desktop.log in the app data folder.")
            }
        } catch { fail(error.localizedDescription) }
    }

    private func item(_ title: String, _ action: Selector, _ key: String = "") -> NSMenuItem {
        let result = NSMenuItem(title: title, action: action, keyEquivalent: key)
        result.target = self
        return result
    }

    private func configureMenus() {
        let bar = NSMenu()
        let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(item("About Ultharness", #selector(about)))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Quit Ultharness", #selector(quit), "q"))
        appItem.submenu = appMenu; bar.addItem(appItem)
        let fileItem = NSMenuItem(); let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(item("Connect Project Folder…", #selector(connectFolder), "o"))
        fileMenu.addItem(item("Open Dashboard in Browser", #selector(openBrowser)))
        fileMenu.addItem(item("Open App Data Folder", #selector(openData)))
        fileMenu.addItem(item("Open Desktop Log", #selector(openLog)))
        fileItem.submenu = fileMenu; bar.addItem(fileItem)
        let editItem = NSMenuItem(); let editMenu = NSMenu(title: "Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(NSMenuItem(title: title, action: Selector(action), keyEquivalent: key))
        }
        editItem.submenu = editMenu; bar.addItem(editItem)
        let viewItem = NSMenuItem(); let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(item("Reload Dashboard", #selector(reload), "r"))
        viewItem.submenu = viewMenu; bar.addItem(viewItem)
        let servicesItem = NSMenuItem(); let servicesMenu = NSMenu(title: "Model Services")
        servicesMenu.addItem(item("Open OmniRoute", #selector(openGateway)))
        servicesMenu.addItem(item("Start Installed OmniRoute", #selector(startGateway)))
        servicesMenu.addItem(item("Start Installed Ollama", #selector(startOllama)))
        servicesItem.submenu = servicesMenu; bar.addItem(servicesItem)
        NSApp.mainMenu = bar
    }

    private func environment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let home = FileManager.default.homeDirectoryForCurrentUser
        let resources = Bundle.main.resourceURL!
        var paths = [resources.appendingPathComponent("runtime").path, "/opt/homebrew/bin", "/usr/local/bin", home.appendingPathComponent(".local/bin").path]
        let versions = home.appendingPathComponent(".nvm/versions/node")
        if let entries = try? FileManager.default.contentsOfDirectory(at: versions, includingPropertiesForKeys: nil) {
            paths += entries.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedDescending }.map { $0.appendingPathComponent("bin").path }
        }
        paths += (env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin").components(separatedBy: ":")
        env["PATH"] = Array(NSOrderedSet(array: paths)) .compactMap { $0 as? String }.joined(separator: ":")
        return env
    }

    private func findExistingEngine() {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:4310/api/state")!)
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let agents = json?["agents"] as? [[String: Any]]
            let matches = (response as? HTTPURLResponse)?.statusCode == 200 && json?["server"] is [String: Any] && agents?.contains(where: { $0["id"] as? String == "agent_scout" }) == true
            DispatchQueue.main.async {
                guard let self else { return }
                if matches { self.showDashboard(URL(string: "http://127.0.0.1:4310")!) }
                else { self.startEngine() }
            }
        }.resume()
    }

    private func startEngine() {
        let resources = Bundle.main.resourceURL!
        let node = resources.appendingPathComponent("runtime/node")
        let entry = resources.appendingPathComponent("app/desktop/server-entry.mjs")
        guard FileManager.default.isExecutableFile(atPath: node.path), FileManager.default.fileExists(atPath: entry.path) else { fail("The bundled Node runtime or application files are missing. Reinstall Ultharness."); return }
        var env = environment()
        env["ULTHARNESS_DATA"] = dataFolder.appendingPathComponent("workspace").path
        env["ULTHARNESS_ROOT"] = ProcessInfo.processInfo.environment["ULTHARNESS_DESKTOP_ROOT"] ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents").path
        let process = Process()
        process.executableURL = node
        process.arguments = ["--env-file-if-exists=\(dataFolder.appendingPathComponent("settings.env").path)", entry.path]
        process.environment = env
        process.currentDirectoryURL = dataFolder
        let pipe = Pipe(); process.standardOutput = pipe
        process.standardError = log ?? FileHandle.standardError
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async {
                guard let self else { return }
                try? self.log?.write(contentsOf: data)
                self.output += String(decoding: data, as: UTF8.self)
                while let newline = self.output.firstIndex(of: "\n") {
                    let line = String(self.output[..<newline]); self.output.removeSubrange(...newline)
                    if let bytes = line.data(using: .utf8), let ready = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], ready["event"] as? String == "ultharness-ready", let port = ready["port"] as? Int, port > 0, port < 65536 {
                        self.showDashboard(URL(string: "http://127.0.0.1:\(port)")!)
                    }
                }
            }
        }
        process.terminationHandler = { [weak self] child in
            DispatchQueue.main.async { guard let self, !self.quitting else { return }; self.fail("The local engine stopped (exit \(child.terminationStatus)). Check the desktop log for details.") }
        }
        do { engine = process; ownsEngine = true; try process.run() }
        catch { fail(error.localizedDescription) }
    }

    private func showDashboard(_ url: URL) {
        guard baseURL == nil else { return }
        baseURL = url
        window.subtitle = ownsEngine ? "Local workspace" : "Connected to your running workspace"
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" { decisionHandler(.allow); return }
        if let base = baseURL, url.scheme == base.scheme, url.host == base.host, url.port == base.port { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
        decisionHandler(attachment ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = suggestedFilename
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let url = panel.url else { completionHandler(nil); return }
            do { if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }; completionHandler(url) }
            catch { completionHandler(nil); self.fail(error.localizedDescription) }
        }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { fail("Report download failed: \(error.localizedDescription)") }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smoke, baseURL != nil, !smokeFinished else { return }
        smokeFinished = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            webView.evaluateJavaScript("JSON.stringify({title:document.title, heading:document.querySelector('main h1')?.innerText || '', agentCards:document.querySelectorAll('.agent-card').length})") { value, error in
                guard error == nil, let text = value as? String, let bytes = text.data(using: .utf8), let result = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], result["agentCards"] as? Int == 4 else { self.fail("Native web view smoke test did not render the dashboard."); return }
                try? bytes.write(to: self.dataFolder.appendingPathComponent("smoke-result.json"))
                webView.takeSnapshot(with: nil) { image, _ in
                    if let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: self.dataFolder.appendingPathComponent("smoke.png")) }
                    print("ULTHARNESS_DESKTOP_SMOKE_OK \(text)")
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func fail(_ message: String) {
        if smoke { fputs("Ultharness desktop: \(message)\n", stderr); engine?.terminate(); exit(1) }
        let alert = NSAlert(); alert.messageText = "Ultharness needs attention"; alert.informativeText = message; alert.runModal()
    }
    @objc private func about() { NSApp.orderFrontStandardAboutPanel(nil) }
    @objc private func quit() { NSApp.terminate(nil) }
    @objc private func reload() { webView.reload() }
    @objc private func openBrowser() { if let url = baseURL { NSWorkspace.shared.open(url) } }
    @objc private func openData() { NSWorkspace.shared.open(dataFolder) }
    @objc private func openLog() { NSWorkspace.shared.open(dataFolder.appendingPathComponent("desktop.log")) }
    @objc private func openGateway() { NSWorkspace.shared.open(URL(string: "http://127.0.0.1:20128")!) }
    @objc private func connectFolder() {
        guard let base = baseURL else { return }
        let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false; panel.prompt = "Connect Project"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let folder = panel.url else { return }
            var request = URLRequest(url: base.appendingPathComponent("api/projects")); request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["name": folder.lastPathComponent, "path": folder.path])
            URLSession.shared.dataTask(with: request) { _, response, error in
                DispatchQueue.main.async {
                    if let error { self.fail(error.localizedDescription) }
                    else if (response as? HTTPURLResponse)?.statusCode != 201 { self.fail("Could not connect this folder. Confirm that it is still available.") }
                    else { self.webView.load(URLRequest(url: URL(string: "\(base.absoluteString)/#projects")!)) }
                }
            }.resume()
        }
    }
    private func startService(_ name: String, arguments: [String], port: Int) {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)")!); request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { _, response, _ in
            DispatchQueue.main.async {
                if response != nil { if name == "omniroute" { self.openGateway() }; return }
                let env = self.environment(); let paths = (env["PATH"] ?? "").components(separatedBy: ":")
                guard let binary = paths.map({ URL(fileURLWithPath: $0).appendingPathComponent(name) }).first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) else { self.fail("Install \(name) separately to use this service. The dashboard and local checks work without it."); return }
                let process = Process(); process.executableURL = binary; process.arguments = arguments; process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
                var serviceEnv = env; serviceEnv.removeValue(forKey: "OMNIROUTE_API_KEY"); serviceEnv.removeValue(forKey: "OMNIROUTE_BASE_URL"); serviceEnv["OMNIROUTE_SERVER_HOST"] = "127.0.0.1"; serviceEnv["OLLAMA_HOST"] = "127.0.0.1:11434"
                process.environment = serviceEnv; process.standardOutput = self.log; process.standardError = self.log
                do { try process.run(); self.services.append(process); if name == "omniroute" { DispatchQueue.main.asyncAfter(deadline: .now() + 4) { self.openGateway() } } }
                catch { self.fail(error.localizedDescription) }
            }
        }.resume()
    }
    @objc private func startGateway() { startService("omniroute", arguments: ["serve", "--no-open", "--no-tray"], port: 20128) }
    @objc private func startOllama() { startService("ollama", arguments: ["serve"], port: 11434) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window?.makeKeyAndOrderFront(nil); return true }
    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        for service in services where service.isRunning { service.terminate() }
        if ownsEngine, let engine, engine.isRunning {
            engine.terminate()
            let deadline = Date().addingTimeInterval(3)
            while engine.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
            if engine.isRunning { kill(engine.processIdentifier, SIGKILL) }
        }
        try? log?.close()
    }
}

@main
struct UltharnessApplication {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
