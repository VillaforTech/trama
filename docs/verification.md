# Release verification

Verified locally on 14 November 2026 using a Mac with Apple Silicon. This record describes engineering checks of version 0.1.0, not proof of learning effectiveness or a certification of security.

| Boundary                                 | Check                                                                                                                                                                                         | Result                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Indexing, storage, API and model adapter | 13 automated tests covering exclusions, pinned references, restore validation, write conflicts, HTTP guards, endpoint consent, provider errors and citation validation                        | Passed                                 |
| Learning experience                      | 7 browser tests covering the learning route, exact source opening, map, search, practice, export, mobile layout, late responses, draft recovery, keyboard navigation and assistance recording | Passed                                 |
| Pedidos example                          | 5 runnable tests for creation, validation, transaction rollback, event processing and repeated delivery                                                                                       | Passed                                 |
| Data pipeline example                    | 5 runnable tests for discounts, thresholds, aggregation, validation and provenance                                                                                                            | Passed                                 |
| Mac distribution                         | Packaged startup, embedded SQLite, bundled example import, native menu bridge, local folder import and rejection of unauthenticated API access                                                | Passed                                 |
| Accessibility sampling                   | Axe WCAG A/AA checks on library and practice; keyboard and 390 px browser flows                                                                                                               | No violations detected in these checks |

The native file picker response is simulated in the automated desktop test; the menu and preload bridge are real, and the selected synthetic directory is read by the packaged engine. Full manual accessibility testing and fresh-machine installation remain necessary before a stable release.

The GitHub adapter is tested against synthetic authenticated API responses and a public repository. Access to a real organization's private repository, including SSO or token policies, has not been validated. The model adapter is tested through an actual local HTTP exchange with controlled responses, including changed-provider rejection. A live third-party or installed language model has not been used to establish response quality.

The app is built with an ad-hoc signature. It does not have an Apple Developer ID identity or notarization. Startup on the development Mac does not establish Gatekeeper acceptance of a downloaded copy on another Mac.

Source declarations, inferred relationships and self-assessment retain their documented limits. The tests establish that evidence is located and recorded as designed; they do not establish that every proposed explanation is correct or that a learner can transfer the knowledge independently.

## Reproduce

Use Node.js 24 or later. See [contributing](../CONTRIBUTING.md) for the browser checks and [Mac build workflow](../.github/workflows/macos.yml) for the packaged test and checksums. The [CI workflow](../.github/workflows/ci.yml) checks the application on macOS and Linux. Public deployment follows a successful main-branch CI run.
