import Foundation

public enum MissionCommand: Equatable {
    case workspace, status, stop, stopAll, start(String)

    public init?(_ input: String) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = text.lowercased()
        let command = lower.trimmingCharacters(in: CharacterSet(charactersIn: ".!?"))
        switch command {
        case "open missions", "open ultharness": self = .workspace
        case "mission status": self = .status
        case "stop mission": self = .stop
        case "start mission": self = .start("")
        default:
            guard let prefix = ["start mission ", "start mission: "].first(where: lower.hasPrefix) else { return nil }
            self = .start(String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }
}
