# Trama interface

Trama is a Mac workspace for understanding a repository. Navigation follows the project, its functionalities and its processes. The working surface supports reading source, making a prediction and retaining an explanation. The interface uses Spanish and names the learner's task directly.

## Visual identity

The graphite and pale lime identity remains. The content surface uses graphite (#1b1e24), the window bar uses a lighter neutral (#292c30), and the project outline uses #24272c. Pale lime (#c4dd77) identifies the active view and selected evidence. Geist is bundled for interface and reading text; system monospace distinguishes source and revision identifiers. The original layered application icon remains part of Trama's identity.

Compact headings, aligned text and thin separators establish hierarchy. Depth belongs to menus and dialogs. Icons identify concrete actions where they improve recognition; persistent destinations use text labels. Architecture sections do not need decorative numbers or repeated badges. Step numbers belong where order matters to the explanation.

## Window and navigation

- **Library:** a separate entry surface with recent projects, opening a folder or GitHub repository, and two runnable examples. It has no persistent navigation rail. The public browser preview makes its local-installation boundary explicit.
- **Window bar:** Trama and the return to Biblioteca sit beside the native window controls. An open project's name identifies the current workspace. Buscar is a compact control with its shortcut; Ajustes is a quiet text action.
- **Project toolbar:** text tabs select Recorrido, Conexiones de código, Código y fuentes, Practicar and Mi cuaderno. Their position remains stable across project views. The active view has a restrained underline and surface change.
- **Repository outline:** the left panel lists the selected repository's functionalities and their processes, with indentation, disclosure controls and a current-item state. It includes Visión general and a small revision and saving status. It represents the repository's proposed structure; it is not a conversation history or a second list of application pages.
- **Project actions:** revisions, notebook export and opening another project are grouped in the project menu. They remain available without occupying permanent rows in the outline.
- **Focused reading:** Ocultar índice removes the outline and gives its space to the working surface. Mostrar índice restores it. Hiding navigation must preserve the current process, source selection and learning draft.

The distinction between tabs and outline is intentional: tabs select a way of working with the project; the outline selects a part of that project. Opening a process takes the reader into its learning route. Labels and selection states must make that transition apparent.

## Working surfaces

- **Overview:** architecture groups and suggested behaviors provide progressively narrower entry points into the source. Coverage and unresolved evidence remain visible without a large promotional panel.
- **Reader:** a prediction precedes the explanation. Source declarations, interpretations and missing evidence have distinct labels. References open the exact lines of the captured revision. At widths of 1200 px and above, a nonmodal inspector keeps source alongside the explanation; narrower windows use a focused dialog. Steps run above the document rather than forming another vertical rail. Closing the source restores keyboard focus. The current process remains identifiable when the outline is hidden.
- **Connections and sources:** the structural map, file browser and source references support the same captured repository. A dependency edge is not presented as an observed execution trace.
- **Practice:** a committed response precedes the reference answer. Source consultation and self-assessment are recorded separately. The interface does not turn an assisted answer into proof of independent understanding.
- **Notebook:** explanations, doubts and attempts persist with their source revision. Changed files can be compared before resuming an investigation.

## Preferences and assistance

Ajustes de Trama opens from the window bar or ⌘,. Its ChatGPT and API o modelo local tabs organize the connections already supported. Account status, model choice and connection actions use a compact preferences layout. The account connection is a supporting utility, not a hero section or a destination in the repository outline.

The sign-in action keeps the required **Continue with ChatGPT** label. Eligibility, source transmission, usage management and errors remain understandable after reducing visual prominence. Provider configuration, project import and the learning task retain separate contexts. A source-backed question is opened from its relevant process.

## References and rationale

These are interaction references, not assets to reproduce:

- **Nova** documents a separate Launcher and Workspace, a project toolbar, contextual controls and project-specific settings. This supports separating Trama's library, project actions and working surface. [Launcher](https://help.nova.app/projects/launcher/) · [Workspace](https://help.nova.app/projects/workspace/) · [Project settings](https://help.nova.app/projects/project-settings/)
- **Things** documents project headings, secondary details revealed within an item and a Slim Mode that preserves navigation while hiding the sidebar. This informed Trama's compact hierarchy and focused reading control. [Organization](https://culturedcode.com/things/features/) · [Slim Mode](https://culturedcode.com/things/support/articles/3238254/)
- **Bear** distinguishes organization, item selection and editing, with modes that hide the sidebar and note list. This informed keeping reading central while allowing surrounding navigation to recede. [Sidebar](https://bear.app/faq/about-the-sidebar-in-bear/) · [Reading layouts](https://bear.app/faq/hide-the-sidebar-and-note-list-on-mac-and-ipad/)

The documented behaviors are verified reference capabilities. Their application to Trama is a design judgment: the hypothesis is that project-based navigation reduces ambiguity and leaves more attention for reasoning. It requires usability checks with real repositories. These references are not evidence that Trama improves learning. LearnHarness informed the learning sequence; Trama retains its own implementation, copy, examples and visual identity. See the separate [research notes](docs/research.md).

## Platform and validation

The Mac window uses native traffic lights, a draggable title bar, application menus and file dialogs through a restricted bridge. ⌘O opens a repository folder; ⌘K opens quick navigation. The command palette supports arrows, Enter and Escape. The packaged application includes its runtime. Application data lives outside the bundle; credential persistence across signed updates remains unverified.

At narrow browser widths the outline becomes an optional overlay and the text tabs remain horizontally accessible. Source and map regions scroll within their working area. Focus indicators, labelled controls and reduced-motion behavior apply to the shell as well as learning views.

Check the complete path from library to process, source, practice and return; long project and feature names; hidden-outline reading; keyboard navigation; menus and dialogs; and narrow layouts. Confirm that saving and uncertainty remain visible without relying on color. The [verification record](docs/verification.md) reports checks actually completed; the design contract does not substitute for those checks or a full accessibility evaluation.
