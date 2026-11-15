# Changelog

## Unreleased

### Repository exploration

- Start with directory groups, expand a folder, and retain its outside dependencies.
- Keep graph nodes visible during selection so double-clicking opens folders and file connections reliably.
- Search every captured filename and extracted symbol; page through bounded map views without losing the selected file.
- Follow dependencies and dependents across one or two connections. Inspect each relation at its source line.
- Explore the sources of a learning process, or use a keyboard-accessible list.
- Show grouped internal relations, unavailable analysis context and the limits of each view.

### Getting started

- Recommend a first behavior on the overview and provide a direct action to start or resume reading.
- Search and progressively reveal suggested functionalities in the outline and overview.
- Document a first investigation in English and Spanish, with a clear distinction between reading, model help and practice.

### Mac startup

- Defer account storage until a connection is requested and use asynchronous Keychain operations, keeping repository exploration responsive during an OS permission prompt. Existing credentials remain encrypted; an unavailable keychain does not enable plaintext storage.

### Maintenance

- Add support and conduct guides, a graph issue form and a maintenance runbook.
- Require the Mac, Linux and browser checks before merging to main; use squash merges and prevent force pushes and branch deletion.
- Enable Dependabot security proposals and group routine updates. Major migrations require explicit review.

## 0.1.0 preview

Initial public source and browser demo: Mac desktop shell, local and authorized GitHub imports, source-linked reading, practice, notebooks, revision comparison, export and restore, and a preliminary ChatGPT connection. Prebuilt downloads and Apple notarization remain pending; consult the README for current installation instructions.
