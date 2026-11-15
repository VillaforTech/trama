# Contributing to Trama

Contributions should make a real code investigation easier to complete and verify. A useful bug report includes the smallest source example that reproduces the problem, the expected behavior, and the observed result. Use a public or synthetic example when reporting an issue involving private code.

## Choose a contribution

Read the [walkthrough](docs/getting-started.md) and [roadmap](docs/roadmap.md) first. Ask workflow questions in [Discussions](https://github.com/VillaforTech/trama/discussions). Use the issue forms for a reproducible bug, a misleading map, or a proposed learning task. English and Spanish contributions are welcome. Follow the [community conduct](CODE_OF_CONDUCT.md).

A useful first contribution is a small public source fixture that exposes an incorrect inference, a keyboard or readability improvement with a concrete task, or an exercise whose changed case has a source-backed answer. A new database or visualization library needs a measured problem that the current architecture cannot solve.

## Development

Use Node.js 24 or newer. The desktop application is developed and packaged on macOS.

```sh
git clone https://github.com/VillaforTech/trama.git
cd trama
npm ci
npm run desktop
```

This builds the application and starts its Mac window with an embedded local service. `npm run dist:mac` creates the configured Apple Silicon release artifacts in `release/`.

For browser-based interface development, `npm run dev` serves the interface at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:4891`. `npm run build` produces the local browser application served by `npm start`.

```sh
npm run check
npm test
npm run build
npm run test:e2e
npm run test:desktop
```

Browser tests use Playwright. Install its browser when needed with `npx playwright install chromium`. Changes to the desktop shell also require a Mac run: verify startup, native folder selection, menu shortcuts, closing and reopening the window, and clean shutdown. Check the packaged application when changing bundled resources or process startup.

The CI workflow runs the desktop test on macOS. Maintainers can run **Build Mac artifacts** manually to build and test the Apple Silicon package. Its ZIP, DMG, and checksums are temporary workflow artifacts; publishing a release is a separate action.

## Pull requests

Describe the concrete problem, the resulting behavior, and how you verified it. Keep changes focused. Preserve existing saved investigations and source references, or include a migration and a recovery path. Add a regression test when a bug could silently change citations, expose data, lose learning records, or misstate an observed result.

For a UI change, include a screenshot at desktop and narrow widths and check keyboard navigation. For analysis changes, include a small source fixture with the expected references and describe remaining ambiguity. A structural relationship must retain its evidence and its uncertainty.

Research notes and examples are welcome. An exercise should have a source-backed answer or a rubric that states what requires execution or additional information. A self-assessment must be presented as the learner's assessment.

## Graph and analysis changes

The source graph and the visible projection have different responsibilities. Preserve the complete captured relationships and their evidence when limiting what the canvas renders. Grouping, filtering, and neighborhood limits must disclose omitted results. A directory grouping is an organizational view, not a verified architecture boundary. A path through import edges is not proof that calls execute in that order.

Include tests for cycles, disconnected files, deterministic ordering, relation direction, scope boundaries, and projection limits when those behaviors change. For performance work, record the fixture's files and relationships, the operation measured, the environment, and the elapsed time. A fast synthetic projection does not establish import or rendering speed for an arbitrary repository.

Major dependency updates require deliberate compatibility review. Dependabot proposals are not automatically merged. A failing update should remain unmerged until its breaking changes and required migrations are understood.

## Licensing

Contributions are provided under this project's MIT license. Only contribute material you have permission to redistribute. Include the original license and attribution for third-party assets. Keep sample repositories synthetic and free of credentials or personal data.

For vulnerabilities, follow [SECURITY.md](SECURITY.md).
