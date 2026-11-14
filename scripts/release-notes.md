Trama 0.1.0 is the first public Mac desktop preview.

Download the Apple Silicon Mac archive, expand it, and move Trama.app to Applications. The packaged app includes its runtime. It targets macOS 13 or later.

Open a local repository with the native folder picker, or connect an authorized GitHub repository. Follow a suggested learning route from architecture to a process, inspect its source, explore the interactive module map, and practice explaining changed scenarios. The notebook retains your predictions, evidence, and unresolved questions.

Mac menus provide Command-O for opening a folder, Command-K for quick navigation, Command-comma for settings, and Command-L for the library. The application runs its indexing service in a separate local process and stores captured sources and learning records on your Mac.

The release includes the Pedidos and Data pipeline projects, optional Ollama or OpenAI-compatible model connections, revision comparison, export and restore, and English and Spanish documentation. The interface uses Spanish. The browser preview is available for trying the included examples.

The Mac preview has no Apple Developer ID signature or notarization. Follow [Apple's guidance](https://support.apple.com/en-us/102445) if macOS requests approval for the download.

For development, use Node.js 24 or later, run npm ci, and then npm run desktop. To package the Mac app, run npm run dist:mac on macOS.

The initial package targets Apple Silicon. Intel Mac packages and other desktop platforms remain unverified. Structural relationships, model interpretations, and self-assessments retain the limits documented in the README.
