# Security and private code

Trama is an early Mac desktop application intended for one person's machine. Electron starts the local indexing service in a utility process on a random `127.0.0.1` port with a per-launch API credential. Its source snapshots and learning records contain repository content. Treat the local data directory and exported investigations with the same care as the original checkout.

## Data flow

- A local import reads selected text files in the chosen directory. The importer excludes common credential files, generated directories, binaries, and symbolic links. Filename filtering cannot identify every secret embedded in source code.
- A GitHub import requests the repository through GitHub's API. Access is limited by the supplied credential or the user's existing GitHub CLI session. GitHub organization policies can prevent access.
- Model-assisted questions send selected source context to the endpoint configured by the user. Local model endpoints and external providers have different data-handling properties. The interface requires consent for a request to an external model endpoint.
- With ChatGPT connected, sign-in takes place on OpenAI's website and selected questions and source excerpts go directly to OpenAI. This authorization does not grant access to the user's ChatGPT conversation history. [Official integration overview](https://developers.openai.com/siwc/token-sharing-open-source)
- Source snapshots and learning records are stored in the local SQLite database under `~/Library/Application Support/Trama/data` in the Mac app. The optional browser mode defaults to `~/.trama`. Exported JSON files include source code. The database and exports are not encrypted by Trama.
- GitHub and model credentials must remain outside repository snapshots and exported investigations. Configuration reads return credential presence rather than credential values.

The built-in analysis reads source and constructs references. It does not install dependencies or run the imported project's code. Instructions inside a source file are treated as source content. Model answers remain untrusted output and are checked for valid source references before being displayed.

## ChatGPT connection

Trama implements the documented public-client OAuth flow with PKCE, a temporary loopback callback, state and nonce checks, and ID-token validation. Its local service owns the session and renewal. The interface receives connection status and model choices, not access or refresh tokens. Trama does not read Codex credentials or extract an existing browser session. [OpenAI sign-in protocol](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

ChatGPT account metadata and tokens persist separately from learning records in `chatgpt-auth.json`, encrypted through Electron's `safeStorage`. On macOS its encryption key is protected by Keychain. The file also uses owner-only permissions (`0600`). The private utility-process channel provides encryption and decryption; these operations are not exposed to the renderer. If secure storage is unavailable, the connector refuses to initialize. There is no plaintext fallback. [Electron storage guarantees](https://www.electronjs.org/docs/latest/api/safe-storage)

This protection applies to ChatGPT credentials, not to source captures, notebooks or exports. Credential filenames and their temporary files are excluded from repository imports and investigation exports. Keep application data and backups private. The local browser mode has no native secure-storage bridge and does not support ChatGPT sign-in.

Requests use the authorized ChatGPT connection and stop when permissions or quota do not allow them. API-key billing requires choosing and configuring that separate connection. Manage account access, allowance and available credits in [ChatGPT usage settings](https://chatgpt.com/settings/usage). Disconnecting locally does not erase questions or source content already sent to OpenAI.

The connector has not yet been validated with a real account. Protocol fixtures and code review cannot establish a user's eligibility, live allowance consumption, or provider-side behavior.

## Desktop and distribution boundary

The Mac renderer uses context isolation and a narrow preload bridge, with Node integration disabled. Native file selection is handled in the main process. The service reads the selected sources without launching the imported application's code. These boundaries protect against a hostile repository taking over the renderer's capabilities, and require regression checks as the application evolves.

Prebuilt downloads are pending publication. Local packaging uses an ad-hoc signature without an Apple Developer ID identity or notarization. An ad-hoc signature does not verify the publisher's identity. Follow macOS's approval flow when choosing to open a downloaded build. [Apple's guidance](https://support.apple.com/en-us/102445)

The local browser mode uses its loopback binding. Shared hosting requires an authentication and authorization design beyond this release. The public browser preview contains synthetic example repositories and does not expose the local API.

Deleting a project from Trama removes its saved records. It does not remove files from the original checkout. Copies already exported remain under the recipient's control. Revoking GitHub access prevents future authorized reads and does not remove previously downloaded source snapshots.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** flow when available. If private reporting is unavailable, open an issue requesting a private contact channel without including the exploit, credentials, or source code. Include the affected version, a minimal synthetic reproduction, and the expected security boundary in the private report.

The current `0.1.x` release is the supported line. Security fixes will be published through GitHub releases. Response times are best effort while the project has a single maintainer.
