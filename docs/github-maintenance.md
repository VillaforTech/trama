# GitHub maintenance

This runbook describes the repository settings verified on 15 November 2026 and the process for maintaining them. Settings can change independently of the source checkout; check them on GitHub before relying on this record.

## Public entry points

- The repository description explains code comprehension and local private-repository use.
- The homepage points to the [public example demo](https://villafortech.github.io/trama/).
- English and Spanish README files link to the demo, installation, and a [first investigation](getting-started.md).
- Issues use forms for bugs, map problems, and feature requests. General questions go to Discussions; vulnerabilities use private reporting.
- The wiki is disabled so installation and architecture instructions have one versioned source. GitHub Projects has not been configured as a second roadmap; the maintained roadmap is [in source](roadmap.md).

## Changes to main

`main` requires a pull request and these successful, up-to-date checks:

- `Node 24 · ubuntu-latest`
- `Node 24 · macos-latest`
- `Browser workflow`

Conversation resolution and linear history are required. Force pushes and deletion are prohibited. Squash merge is the enabled merge method, and merged branches are deleted automatically. There is currently one maintainer, so the required review count is zero; automated checks still apply. Administrator bypass remains available for recovery. Add a second reviewer requirement when the project has another active maintainer who can review without blocking fixes.

The main CI workflow checks types, core behavior, example tests, browser flows, and the native desktop shell on Mac. The public demo is deployed only after the corresponding main-branch CI succeeds. Do not treat the green badge as proof of learning effectiveness, language-adapter completeness, or fresh-machine install acceptance.

## Dependencies and security

Dependabot alerts, security-update proposals, secret scanning, and secret-scanning push protection are enabled. The checked-in Dependabot configuration groups routine minor and patch updates by runtime and development scope. Major upgrades require an explicit migration review. A security advisory that requires a major upgrade still needs attention even when version-update automation ignores that migration.

Do not merge a dependency proposal solely because it is automated. Read release notes and inspect the lockfile diff; run the existing checks and any checks justified by a changed runtime or API. Keep action references pinned to reviewed commit SHAs. Repository credentials and model credentials must never be added as sample values or screenshots.

## Releases

The local Apple Silicon ZIP and DMG are built from the reviewed application with `npm run dist:mac`. Verify packaged startup, complete bundle signature, archive integrity, and hashes before publishing. The current package uses an ad-hoc signature; Developer ID and notarization remain pending.

Publishing binaries is a separate action from publishing source or deploying the example demo. Binary publication was blocked by the execution policy in the automation session even after the owner's approval. Until a real release with assets exists, keep source installation primary and do not point users to a nonexistent “latest download.” The ignored local release directory contains prepared assets and publication instructions; it is not part of the public repository.

After publishing an actual release, reopen its page, verify the asset names and checksums, and update the README installation status and release notes. Validate the downloaded app on a fresh Mac before claiming Gatekeeper acceptance. Do not disable macOS protections as part of release instructions.
