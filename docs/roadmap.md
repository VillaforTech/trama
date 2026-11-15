# Roadmap

This release establishes the Mac desktop investigation workflow. These priorities are proposals, subject to findings from people using their own repositories. The current map supports organizational grouping and bounded exploration; a complete semantic or runtime graph is not yet established.

| Next capability                       | Problem it should resolve                                                                              | Evidence to collect before expanding it                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Larger-repository validation          | Navigation still fails on high-degree files or repositories whose structure differs from the examples. | Correct dependency/dependent tasks, visible omissions, projection and rendering measurements on representative authorized sources. |
| More precise language adapters        | A proposed relationship points to the wrong implementation or misses a common framework pattern.       | Small reproducible source fixtures and frequency in real investigations.                                                           |
| Incremental indexing                  | Reopening a large repository repeats work and obscures which evidence changed.                         | Measured import time, changed-file distribution, and memory use.                                                                   |
| Execution evidence                    | Static code cannot decide which configuration, dispatch target, or retry path actually ran.            | A narrow trace format and tasks where it changes the explanation.                                                                  |
| Stronger independent practice         | Self-assessment misses an incorrect explanation or measures recognition.                               | Blinded rubric review and transfer tasks completed without help.                                                                   |
| Better prerequisite support           | A learner reaches a concept they cannot yet reason about.                                              | Observed points of confusion and whether a focused example repairs them.                                                           |
| Developer ID signing and notarization | Download approval creates friction and the publisher identity needs verification.                      | Successful notarization and a fresh-machine install of the released artifact.                                                      |
| Wider desktop distribution            | Intel Mac users and other operating systems need verified packages.                                    | Packaged startup, native interaction, and data migration checks on each supported target.                                          |
| GitHub App and team spaces            | A team needs selected-repository access and shared investigations.                                     | Organization approval, retention requirements, and a paying team commitment.                                                       |
| English interface                     | Useful participation is limited by interface language.                                                 | Contributor coverage and a review process for keeping translations synchronized.                                                   |

A repository map, chat message count, or number of completed steps cannot establish learning. The proposed outcome measures are correct behavior reconstruction, valid source references, performance on a changed scenario, recognition of uncertainty, and successful resumption after a delay. [Evaluation rationale](research.md)

The [GitHub maintenance runbook](github-maintenance.md) records the current contribution, CI, security, and release process. It is separate from a promise to implement every roadmap item.

Contributions can improve the current workflow without waiting for the broader roadmap. Include the task, evidence, and expected effect so another person can judge the change.
