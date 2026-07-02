import AppIntents
import Foundation

@available(iOS 16.0, *)
struct RecordIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Mom Brain to Record"
    static let description = IntentDescription("Opens Mom Brain and starts recording your brain dump immediately.")

    static let suggestedInvocationPhrase: String = "Open Mom Brain to record"

    // openAppWhenRun = true opens the app; the deep link is handled via
    // the app's onOpenURL / Linking listener which checks for autoRecord=true
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        return .result()
    }
}

@available(iOS 16.0, *)
struct MomBrainShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordIntent(),
            phrases: [
                "Open \(.applicationName) to record",
                "Start recording in \(.applicationName)",
                "\(.applicationName) brain dump",
            ],
            shortTitle: "Record Brain Dump",
            systemImageName: "mic.fill"
        )
    }
}
