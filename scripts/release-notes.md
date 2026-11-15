Trama 0.1.0 is the first public Mac desktop preview.

Install from source with Node.js 24 or later: clone the repository, run `npm ci`, then `npm run desktop`. Trama targets macOS 13 or later and is currently tested on Apple Silicon. Prebuilt downloads are pending publication.

Open a local repository with the native folder picker, or connect an authorized GitHub repository. Follow a suggested learning route from architecture to a process, inspect its source, explore the interactive module map, and practice explaining changed scenarios. The notebook retains your predictions, evidence, and unresolved questions.

Mac menus provide Command-O for opening a folder, Command-K for quick navigation, Command-comma for settings, and Command-L for the library. The application runs its indexing service in a separate local process and stores captured sources and learning records on your Mac.

The release includes the Pedidos and Data pipeline projects, revision comparison, export and restore, and English and Spanish documentation. The interface uses Spanish. The browser preview is available for trying the included examples.

**Continue with ChatGPT** offers a connection through OpenAI's documented sign-in flow. Eligible Plus and Pro accounts can authorize requests against their plan allowance or available credits. This does not provide access to ChatGPT conversation history. Manage allowance and access in [ChatGPT usage settings](https://chatgpt.com/settings/usage). API and Ollama remain separate advanced options; subscription failures do not switch silently to API-key billing. [Official integration](https://developers.openai.com/siwc/token-sharing-open-source)

The ChatGPT connector is preliminary. Real-account authorization, live model eligibility, and actual plan consumption remain unverified. The Mac application encrypts saved session credentials through native secure storage. Source captures and notebooks remain unencrypted. ChatGPT sign-in is available in the Mac application; local browser mode retains API and Ollama options.

The Mac preview has no Apple Developer ID signature or notarization. Follow [Apple's guidance](https://support.apple.com/en-us/102445) if macOS requests approval for the download.

To package the Mac app yourself, run `npm run dist:mac` on macOS.

The initial package targets Apple Silicon. Intel Mac packages and other desktop platforms remain unverified. Structural relationships, model interpretations, and self-assessments retain the limits documented in the README.
