# Trama

**A Mac workspace for understanding your code.**

Trama is a desktop application for Mac that turns a repository into a place to investigate architecture, follow a behavior across files, and practice explaining it yourself. Open a project with the native folder picker, explore its connections, and keep a source-backed record of what you understand.

[Download for Mac](https://github.com/VillaforTech/trama/releases/latest) · [Español](README.es.md) · [How it works](docs/architecture.md) · [Research](docs/research.md)

![Trama workspace showing a source-backed learning route](docs/images/overview.png)

## Start with a question

You inherit a service that creates orders and processes work later. A successful response tells you little about what happens if the worker retries. Open the **Pedidos** example, find the request handler, follow the transaction and pending event, then explain whether another delivery can create another movement. Write a prediction before revealing the relevant code. Return later to practice a changed scenario.

The included **Data pipeline** example follows a CSV through validation, discounts, filtering, and regional aggregation. It lets you trace a reported amount back to its input rows and predict how a rule change affects the report. Both examples contain runnable tests and fictional data.

## Install on Mac

The first packaged release targets **Apple Silicon Macs running macOS 13 or later**. Download the Mac ZIP from [Releases](https://github.com/VillaforTech/trama/releases/latest), expand it, and move **Trama.app** to Applications. The application bundles its runtime, so this installation works without a separate Node.js setup.

This preview has no Apple Developer ID signature or notarization. macOS may ask you to approve the download in **System Settings → Privacy & Security**. Review the source and the release before choosing to open it. [Apple's guidance](https://support.apple.com/en-us/102445)

Open Trama, choose **Abrir carpeta**, and select a local checkout. A GitHub repository and two included examples are also available. The interface currently uses Spanish. The core exploration and practice flow works without an AI account.

| Shortcut | Action                                         |
| -------- | ---------------------------------------------- |
| `⌘O`     | Open a repository folder using the Mac picker. |
| `⌘K`     | Open quick navigation.                         |
| `⌘,`     | Open settings.                                 |

For a private GitHub repository, use an authorized GitHub CLI session or supply a token with read access to that repository. A local checkout uses the access you already have to its files. If you use GitHub CLI, sign in with `gh auth login` before importing. Tokens remain outside saved investigations.

## Run the Mac app from source

Development requires **Node.js 24 or newer**, npm, and macOS.

```sh
git clone https://github.com/VillaforTech/trama.git
cd trama
npm ci
npm run desktop
```

The desktop command builds the application and starts its Mac window. To package a Mac release, run `npm run dist:mac` on a Mac.

The [browser preview](https://villafortech.github.io/trama/) contains fictional examples for a quick look at the workflow. A local browser interface is also available with `npm run build` followed by `npm start` at `http://127.0.0.1:4891`.

## What you can do

- **Explore the system.** Start with suggested architecture and functionality, then open a process with file and line references.
- **Follow relationships.** Navigate the module map and inspect the source behind a connection.
- **Search the capture.** Find symbols and text across the indexed files without losing your investigation.
- **Practice reasoning.** Record a prediction, reveal evidence, explain a mismatch, and try a transfer question. Review attempts later with an explicit self-assessment.
- **Ask a source-backed question.** Connect an optional local or OpenAI-compatible model. Replies include references that are checked against the captured source.
- **Keep your work.** Save notes and progress, revisit captured revisions, compare file changes, and export or restore an investigation.

## Optional model connection

Open **Ajustes** and enter an OpenAI-compatible API base URL and a model available on that server. For an existing Ollama installation, the default base URL is `http://127.0.0.1:11434/v1`. Trama does not install or download a model. Use the name reported by your model server.

Test the connection, then ask a question in an investigation. Each request sends a bounded set of relevant source excerpts. An external endpoint requires your consent for the request. Provider charges depend on your own account. Supported endpoints must implement `/chat/completions` and return the requested JSON structure.

Model API keys entered in the interface remain in server memory. Endpoint and model preferences persist locally. Environment variables are also supported.

| Variable               | Purpose                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `TRAMA_DATA_DIR`       | Change the data directory in local browser mode, whose default is `~/.trama`. The Mac app uses its Application Support directory. |
| `TRAMA_MODEL_ENDPOINT` | Set the OpenAI-compatible API base URL.                                                                                           |
| `TRAMA_MODEL`          | Set the model identifier.                                                                                                         |
| `TRAMA_MODEL_API_KEY`  | Supply the model credential through the environment.                                                                              |

## Evidence and scope

A reference proves where a statement points. Whether that source actually supports the explanation still requires judgment. Trama labels source declarations, inferred relationships, and unresolved claims. Its map shows structural connections rather than a recorded execution trace.

The initial learning route comes from source-analysis heuristics. It groups visible declarations, imports, entry points, and documentation into a proposed reading order. Optional model questions are a separate capability; importing a repository does not produce a complete, independently verified architecture.

Local indexing is bounded to 4,000 files and GitHub indexing to 500 files, with 32 MB of text and 512 KB per file. It reports incomplete coverage. Use `.tramaignore` to exclude additional files. TypeScript and JavaScript imports receive syntax-based analysis. Python import links are candidates. Dynamic dispatch, runtime configuration, external services, and generated code may need additional evidence. Inspect the shown sources before relying on a suggested path.

Practice reviews are self-assessments. This release has not been evaluated in a controlled study of software learning. The [research notes](docs/research.md) describe the rationale and a proposed comparison with an editor plus an assistant.

## Private repositories

The desktop application runs its indexing service on your Mac and stores its source captures and learning records in `~/Library/Application Support/Trama/data` using SQLite. Reading a checkout does not execute the imported project's code. An optional model request sends the selected context to the provider you configured. The local browser mode uses `~/.trama` by default.

Captured source and exported JSON files can contain private code. Trama's local database and exports are unencrypted. See the [data flow and security policy](SECURITY.md) before using an organizational repository. The public source repository and browser demo contain fictional examples.

## Development

```sh
npm ci
npm run desktop
npm run check
npm test
npm run build
```

For interface development, `npm run dev` serves the React interface on `http://127.0.0.1:5173` and proxies its API to port 4891. Browser checks use Playwright. The desktop shell, native picker, packaged startup, and Mac menus require checks in the Mac application as well.

```sh
npx playwright install chromium
npm run test:e2e
```

Contributions that improve a source trace, fix a misleading inference, or make a learning task easier to complete are welcome. See [contributing](CONTRIBUTING.md), [architecture](docs/architecture.md), and the [roadmap](docs/roadmap.md).

Engineering checks and their limits are recorded in [release verification](docs/verification.md).

## Acknowledgements and license

LearnHarness informed the distinction between measuring understanding, teaching with prediction, and practicing independently. Its source was reviewed as a design reference. Trama's implementation, prompts, examples, and visual identity were created independently. [LearnHarness](https://github.com/amosblomqvist/learnharness)

Trama's original code and examples are available under the [MIT license](LICENSE). Third-party assets and dependencies retain their own licenses. See [NOTICE](NOTICE).
