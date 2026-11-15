# Product research and design decisions

Checked on 14 November 2026. This document separates observed product capabilities, published learning research, and hypotheses that Trama still needs to test with users.

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
