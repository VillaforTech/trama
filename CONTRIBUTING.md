# Contributing to Trama

Contributions should make a real code investigation easier to complete and verify. A useful bug report includes the smallest source example that reproduces the problem, the expected behavior, and the observed result. Use a public or synthetic example when reporting an issue involving private code.

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

## Licensing

Contributions are provided under this project's MIT license. Only contribute material you have permission to redistribute. Include the original license and attribution for third-party assets. Keep sample repositories synthetic and free of credentials or personal data.

For vulnerabilities, follow [SECURITY.md](SECURITY.md).
