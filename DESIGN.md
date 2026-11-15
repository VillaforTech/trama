# Trama interface

Trama is a Mac application for learning a codebase. Its library, compact project rail, source views and command palette are designed as a working environment. The interface currently uses Spanish; labels name tasks rather than agent internals.

## Visual direction

A graphite shell (#1b1e24), quieter sidebar (#191c21), and pale lime accent (#c4dd77) distinguish navigation from the active learning task. Geist is bundled locally for UI and reading; system monospace handles source and revision identifiers. Headings remain compact. Borders organize content; depth is reserved for dialogs. The original layered icon represents relating parts across levels of a system.

Zed's persistent workspace, Linear's restrained hierarchy, and Raycast's keyboard navigation were studied as interaction references. No artwork, layouts, product copy or identity were copied. LearnHarness informed the learning sequence rather than the visual identity. See the linked sources in [research](docs/research.md).

## Surfaces

- **Library:** recent investigations, one primary folder action, GitHub import, and two runnable learning examples. The public browser preview makes its installation boundary explicit.
- **Learning route:** architecture suggestions and behaviors become progressively narrower source investigations.
- **Reader:** a prediction precedes explanation. Source declarations, interpretations and missing evidence have distinct labels. References open exact captured lines.
- **Connections:** movable file nodes, dependency edges, filtering and neighborhood focus. This is a structural map, not a runtime trace.
- **Practice:** a committed response precedes the reference answer. Consulted sources and self-assessment are recorded independently.
- **Notebook:** personal explanations, doubts and attempts persist with a source revision. File changes can be compared before resuming work.
- **Command palette:** Cmd-K searches actions and source filenames; arrows and Enter navigate, Escape closes. Cmd-O uses the native Mac folder picker; Cmd-comma opens model settings.

## Platform behavior

The Mac window uses native traffic lights, a draggable title bar, native application menus, native file/save dialogs, and a minimal isolated bridge. Application state lives outside the app bundle. Electron embeds the runtime, so the packaged application requires no developer tools. Credential access across signed app updates remains to be verified.

The browser preview adapts below 620px with a collapsible project rail. Source and map regions scroll internally. Focus indicators, labelled dialogs, keyboard commands and reduced-motion behavior are included. Accessibility checks cover library and practice; keyboard and mobile flows have automated tests. These checks do not substitute for a full accessibility evaluation with assistive technology.
