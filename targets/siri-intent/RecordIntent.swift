import AppIntents
import Foundation

@available(iOS 16.0, *)
struct RecordIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Mom Brain to Record"
    static let description = IntentDescription("Opens Mom Brain and starts recording your brain dump immediately.")

    // This makes the intent appear as a suggested Siri phrase
    static let suggestedInvocationPhrase: String = "Open Mom Brain to record"

    // Opens the app — required for intents that open the UI
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // Deep link into the Dump screen with autoRecord flag
        if let url = URL(string: "mombrain://dump?autoRecord=true") {
            await UIApplication.shared.open(url)
        }
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
