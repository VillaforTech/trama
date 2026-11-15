# Product research and design decisions

Checked on 15 November 2026. This document separates observed product capabilities, published learning research, and hypotheses that Trama still needs to test with users.

## The problem and the first audience

The initial user struggled to explain behavior crossing several files after reading an apparently clear AI explanation. They asked for a repository-driven learning route, fewer controls, and private repositories as the main use case. That is direct feedback from one person. The proposed first audience is a developer onboarding to an unfamiliar codebase or maintaining a feature built with AI assistance. The frequency of this need, improvement in work outcomes, and willingness to pay remain open questions.

The product unit is a source-backed investigation of a behavior. An investigation should leave a person able to locate an implementation, explain the input and output, predict a variant, and name the remaining uncertainty. Reading time and completed screens are insufficient evidence of that outcome.

## Reference products

| Reference    | Verified capability                                                                                                                                                                                                                                                                  | Implication for Trama                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LearnHarness | Its README describes measuring current understanding, building a dependency plan, teaching with prediction, and separate practice sessions. It stores learning across sessions. The inspected source revision is `cb25c8e49b85eed9e78315584731cad73a0118a6`, dated 12 November 2026. | Preserve the distinction between receiving help and producing an answer. Let a learner return to a saved investigation.                                       |
| DeepWiki     | Official documentation describes generated repository wikis, architecture diagrams, summaries, source links, and questions grounded in a codebase. Public DeepWiki accepts public GitHub repositories.                                                                               | A repository overview and cited Q&A are already available alternatives. Trama must demonstrate value through the learner's subsequent reasoning and workflow. |
| Cursor       | Its learning guide describes searching exact symbols, agentic exploration, broad questions about behavior, and architecture diagrams.                                                                                                                                                | Compare against an editor with search and an assistant, including the user's normal setup. Navigation alone is a weak reason to add a tool.                   |

These are documented capabilities, not independent measurements of learning effectiveness. Sources were inspected directly. [LearnHarness README](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/README.md) · [DeepWiki documentation](https://docs.devin.ai/work-with-devin/deepwiki) · [Cursor codebase guide](https://cursor.com/learn/understanding-your-codebase)

LearnHarness is licensed under AGPL-3.0. Trama uses its learning workflow as a conceptual reference. Trama's implementation and example projects were written independently. No LearnHarness source, prompts, artwork, or branding are bundled. [Original license](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/LICENSE)

## Graphs for large codebases

The latest feedback exposed two distinct problems: a large diagram becomes unreadable, and a new user cannot tell which action to take next. This is direct feedback from the project's initial user, not a prevalence estimate. A graph model helps represent relationships; useful exploration also requires scope, direction, hierarchy, evidence, and a next task.

### What LearnHarness actually stores

At the inspected `cb25c8e49b85eed9e78315584731cad73a0118a6` revision, LearnHarness models propositions and reasoning chains extracted from teaching sessions or imported notes. A chain connects one or more premises to a conclusion and retains provenance. Its storage adapter uses append-only JSONL ledgers; visual edges are derived from the stored chains. This is a persistent learning graph, not an automatic source-code call graph or a Neo4j deployment. These findings come from the graph contracts and storage implementation, rather than from the product's marketing language. [Graph contracts](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/src/core/contracts/graph.ts) · [Storage adapter](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/src/store/graph.ts)

The transferable idea is to keep durable entities, relationships, and provenance separate from a particular picture. Trama's source graph and learning attempts describe different things. Connecting those records should not turn a predicted source relationship into an observed execution or a self-assessment into established mastery. LearnHarness's code remains an AGPL-3.0 reference; its implementation has not been copied into Trama.

### Comparable source-navigation tools

| Source      | Verified capability or guidance                                                                                                                         | Decision for Trama                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sourcegraph | Distinguishes search-based navigation using text and syntax heuristics from precise navigation using compile-time information.                          | Describe the current adapter's evidence honestly. A folder graph cannot supply compiler-level precision that the index does not contain. |
| Sourcetrail | Provides an interactive source explorer and language-indexer extensions. Its original repository is archived and states that maintenance ended in 2021. | Use focused source exploration as an interaction reference; do not adopt an abandoned runtime as a maintained dependency.                |
| React Flow  | Recommends memoization, limited initial node trees with expansion, and simpler node/edge styles for large diagrams.                                     | Render a bounded projection, expand relevant scope, and keep the complete snapshot separate from what is visible.                        |

These are documented product and implementation properties, not demonstrated learning results. [Sourcegraph navigation types](https://sourcegraph.com/docs/code-navigation) · [Sourcetrail original repository](https://github.com/CoatiSoftware/Sourcetrail) · [React Flow performance](https://reactflow.dev/learn/advanced-use/performance)

### Current product and architecture decision

Trama retains its local SQLite snapshot and derives organizational groups and bounded source-relationship views. Start at folders, open a relevant group, search for a file or symbol, then inspect a selected file's incoming and outgoing relationships. Aggregated links retain source evidence. A list provides an alternative to the canvas. A notice distinguishes a projected-view limit from incomplete source indexing.

This is an engineering choice for the current single-user app, not a claim that SQLite always outperforms a graph database. The present problem is primarily how much is shown and how the user moves through it. A separate graph database becomes a justified candidate when measured storage or traversal requirements exceed the local design: for example, cross-repository shared graphs, concurrent graph editing, or complex persisted semantic relationships. That decision requires workload measurements, an import/migration plan, and preservation of revision and evidence identity.

The hypothesis is that grouped views and local neighborhoods reduce navigation effort without hiding relevant evidence. Validate it with repositories of different sizes and shapes, including cycles, large folders, disconnected files, and high-degree hubs. Ask a first-time user to locate an entry point, inspect a dependency, find a dependent, and explain the evidence and an omitted uncertainty. Measure correct completion and time; use projection-size and rendering measurements as engineering checks rather than learning outcomes.

## Bringing a ChatGPT plan

The user asked to use the allowance of an existing ChatGPT account. Source inspection established that LearnHarness implements a public-client OAuth connection directly, with PKCE and the `chatgpt.tokens.use.direct` scope. It then uses a local PiAI adapter to call OpenAI's Responses endpoint with the resulting OAuth token. That ChatGPT route does not invoke Codex CLI or a LearnHarness inference gateway. Its separate Claude Code option launches an externally installed CLI whose own authentication and routing determine billing. [LearnHarness sign-in](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/electron/chatgpt.cjs#L251-L347) · [Responses transport](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/src/agent/chatgpt-stream.ts#L63-L90) · [Claude Code route](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/docs/claude-code.md)

OpenAI documents this direct sign-in and plan-usage flow for eligible users. Its current scope includes local open-source and personal applications; paid or remotely hosted products require a separate access request. Trama's local open-source distribution is the intended integration context. Changes to that distribution need a fresh review of the provider's current requirements. [Availability and terms](https://developers.openai.com/siwc/token-sharing-open-source)

The product decision is to offer **Continue with ChatGPT** first, with API and Ollama configuration as separate options. The hypothesis is that this reduces setup friction for people who already have an eligible account. It does not establish broader adoption, willingness to pay, or improved learning.

Trama implements the documented protocol independently using `jose` for token verification. It does not vendor the LearnHarness implementation or the Sign in with ChatGPT DevKit. Real-account authorization, live model availability, and consumption of a plan allowance still need an explicit end-to-end check. Until that check occurs, protocol fixtures are evidence of local behavior only.

## Learning evidence

Karpicke and Blunt compared retrieval practice with study strategies using science texts. In their experiments, retrieval practice improved delayed performance, including questions requiring conceptual understanding. That supports asking a learner to reconstruct an explanation before seeing an answer. It does not establish that this particular application improves software comprehension. [Original paper](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Blunt_Science.pdf)

Butler studied repeated testing and repeated studying with prose materials. The experiments measured retention and transfer to new inferential questions after one week. Their findings motivate testing a changed scenario after a source walkthrough. The exact benefit for experienced developers, dynamic systems, and AI-generated questions needs a separate study. [Original study](https://doi.org/10.1037/a0019902)

A correct self-assessment records the learner's judgment. It is not an independently graded result. Model feedback also requires scrutiny. The application keeps the submitted explanation, whether help was used, the review, and its sources so those distinctions remain inspectable.

## Interaction decisions

| Difficulty                                            | Product response                                                                                                            | Validation task                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Too many possible entry points                        | Start by opening a repository or a runnable example. Reveal architecture, functionality, and process details progressively. | Observe time to a correctly identified entry point and unnecessary navigation.                           |
| Losing the system while reading a function            | Maintain project context, module relationships, and a source pane connected to the selected process.                        | Ask the person to name the caller, input, result, and adjacent responsibility.                           |
| Explanation feels clear until help disappears         | Record a prediction, reveal source evidence, then ask for a variant.                                                        | Give a fresh variant with the prior explanation hidden.                                                  |
| Confusing a plausible call with an observed execution | Label source declarations, inferred relationships, and unresolved claims. Preserve the captured revision.                   | Introduce a dynamic dispatch or deployment-dependent branch and check whether uncertainty is recognized. |
| Reconstructing previous conversations                 | Save the revision, notes, answers, and current place. Export the investigation.                                             | Resume after a week and locate the next unresolved question.                                             |

## Why the first public release runs locally

Private code is the primary source. A local process can read an already authorized checkout and keep snapshots and learning records on the user's machine. A configured model may still receive source excerpts when the user asks it a question. Model processing and local storage are distinct decisions, made visible in the interface.

The browser demo uses the included fictional projects. The installed application opens the user's own sources. This makes the publicly shareable first interaction easy to try while keeping private-code access explicit.

## Mac interaction and visual direction

The user explicitly requested a real Mac application after trying the browser version. The native window, folder picker, application menu, and keyboard navigation now form the desktop shell. The learning workspace remains a React interface so the source inspection and saved investigation can share one implementation with the public example preview.

Zed, Linear, and Raycast provide useful reference points for a developer's workspace, focused navigation, and quick access through a command palette. Their official product pages were reviewed as references; they are not evidence that a particular visual style improves learning. Trama's graphite surfaces, restrained lime accents, navigation, and illustrations are an independent design. No screenshots or product artwork from these references are bundled. [Zed](https://zed.dev/) · [Linear](https://linear.app/) · [Raycast](https://www.raycast.com/)

The design hypothesis is that one primary next action, optional detail, and persistent repository context reduce navigation effort. Validate it by observing first-time users open a repository, identify an entry point, and complete a fresh reasoning task. A visual resemblance to an established tool does not establish that outcome.

## What would justify more investment

Run a counterbalanced comparison with an editor plus the participant's existing assistant. Use two unfamiliar repositories and matched tasks. Ask each participant to locate a behavior, explain it with citations, and predict a changed input. A reviewer unaware of the tool used should score the explanation against a prepared rubric. Repeat a transfer task a week later. Record incorrect citations and false confidence as well as completion time.

Continue when a repeatable gain in transfer, retention, or time to a correct explanation exceeds the cost of opening another tool. If navigation improves while transfer stays flat, refine questions and review scheduling. If the existing editor matches both outcomes with less friction, evaluate an editor integration. For teams, test access approval, an actual onboarding task, and a purchasing commitment before treating interest or stars as demand.
