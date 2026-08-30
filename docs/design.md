# VoltForge Studio - UI/UX Design System v2

## Product direction

VoltForge Studio is a professional circuit-design workspace. The schematic canvas is the primary task surface. Controls, component libraries, diagnostics, and inspector tools support the canvas instead of competing with it for attention.

The interface should feel like a focused engineering application rather than a marketing dashboard.

## Core principles

1. Canvas first - preserve the largest possible uninterrupted schematic workspace.
2. Compact, not cramped - reduce unnecessary vertical space while keeping controls easy to target.
3. Clear hierarchy - distinguish application chrome, tools, data, state, and primary actions.
4. Quiet surfaces - avoid excessive glassmorphism, gradients, glow, and oversized cards.
5. Progressive emphasis - only the active tool, critical status, and primary simulation action should receive strong accent treatment.
6. Predictable placement - tools stay left, work stays center, inspection and diagnostics stay right.
7. Engineering readability - numeric values, state labels, diagnostic messages, and component properties must be easy to scan.
8. Preserve function - redesign must not change circuit behavior, project persistence, simulation logic, or existing element IDs used by JavaScript.

## Layout model

Desktop uses a three-zone IDE layout:

- Left rail: 248-260 px
  - brand
  - core tools
  - component picker
  - examples
  - guide
- Center workspace: flexible, minimum 0
  - compact status/top bar
  - workspace command bar
  - schematic canvas
- Right inspector: 292-320 px
  - diagnostics
  - inspector
  - node voltages

The application should occupy the viewport height on desktop. Side panels scroll independently when their content exceeds the viewport.

## Density

Base spacing scale:

- 4 px - micro gaps
- 6 px - compact control gaps
- 8 px - default local gaps
- 12 px - section padding
- 16 px - larger grouping
- 24 px - exceptional separation only

Avoid 20+ px padding on routine controls and panels.

## Shape language

- App panels: 0-10 px radius
- Buttons and inputs: 7-9 px radius
- Small badges: 999 px only when semantically pill-shaped
- Dialogs: 12-14 px radius

Avoid large 18-26 px rounded rectangles across the entire application.

## Color system

The default experience is a neutral dark engineering workspace.

### Backgrounds

- App background: near-black blue/graphite
- Side panels: slightly lighter graphite
- Canvas chrome: darker than panels
- Raised surfaces: subtle tonal elevation rather than glow

### Accent

Use electric cyan as the primary interaction accent.
Use violet only as a secondary supporting accent.

Strong accent should be limited to:

- active tool
- focused control
- selected component
- simulation primary action
- active wire/current visualization

### Semantic colors

- Success: green
- Warning: amber
- Error: red/pink
- Information: cyan

Semantic colors should never be replaced by decorative gradients.

## Typography

UI font stack should prioritize system UI fonts for fast rendering and native desktop-app feel.

- Application title: 15-17 px / 650-700
- Section title: 11-12 px / 700 / uppercase or tracked
- Primary body: 13-14 px
- Secondary body: 11-12 px
- Numeric readouts: tabular numerals

Do not use oversized headings inside the working application.

## Application chrome

### Brand

The brand block should be compact and occupy approximately 48-56 px vertically.

- 32-36 px VoltForge mark
- single-line product name when possible
- small product descriptor
- language control treated as utility, not a hero element

### Top bar

Top bar should communicate current application state without becoming a dashboard.

Source voltage, current, and circuit health are compact readouts rather than standalone cards.

## Tool panel

Tool buttons should resemble application commands:

- 34-38 px high
- two-column layout where space allows
- icon-ready alignment
- strong state for active tool
- simulation action visually distinct

Hover feedback is subtle. Avoid floating movement and large shadows.

## Component picker

The component picker is a frequent action and should be visually stronger than examples or guide content.

- compact searchable-style trigger appearance
- clear current component preview
- dropdown categories should be scannable
- palette cards should be dense list rows, not large tiles

## Workspace

The workspace is the focal point.

### Command bar

Group actions by purpose:

1. History - undo / redo
2. View - zoom out / reset / zoom in
3. Project - import / export
4. Destructive - clear
5. Simulation - auto-run state

Visual grouping should rely on spacing and thin separators, not multiple nested cards.

### Canvas

- fills remaining center area
- subtle engineering grid
- minimal outer border
- no decorative background gradients that compete with the schematic
- selected and active circuit elements keep strong functional highlighting

## Right inspector

Diagnostics should appear before detailed properties because they answer whether the circuit is valid.

Inspector controls use compact stacked fields.

Node values use dense rows/cards with tabular values.

Empty states should be short, helpful, and visually quiet.

## Buttons

### Primary

Used for simulation or the most important action in context.

- solid/accent-tinted background
- clear text contrast
- no continuous animation

### Secondary

Routine commands use quiet filled or transparent surfaces.

### Destructive

Destructive actions should use semantic error color on hover/focus and must not look identical to primary actions.

## Forms

- 34-38 px standard control height
- labels remain visible
- focus ring is clearly visible
- dropdown backgrounds remain readable in dark mode
- use tabular numerals for electrical values

## Dialogs and analysis tools

Waveform, frequency, scan, guide, and netlist dialogs should use the same flat workspace language.

- reduced corner radius
- compact header
- subtle border
- minimal backdrop blur
- larger canvas/plot area than surrounding controls

## Motion

Motion should communicate state, not decorate.

Allowed:

- 120-180 ms hover/focus transitions
- dropdown reveal
- progress movement
- current-flow particles in the schematic

Avoid:

- perpetual button/card glow
- cards moving vertically on hover
- large animated gradients

Respect `prefers-reduced-motion`.

## Accessibility

- visible `:focus-visible` treatment
- minimum practical pointer target around 34 px for dense desktop controls and 42 px on touch layouts
- text contrast should meet WCAG AA where practical
- never encode success/warning/error by color alone
- preserve keyboard undo/redo and editor shortcuts
- use semantic button states and disabled styles

## Responsive behavior

### 1250 px and above

Three-column workstation layout.

### 900-1249 px

Narrower side rails while retaining the central canvas as primary.

### Below ~1050 px

Center workspace becomes first content block. Left tools and right inspection panels move below it in a structured two-column arrangement when space permits.

### Mobile

- single column
- workspace remains near the top
- controls wrap into compact groups
- side panels become normal document flow
- avoid forcing every button to full width unless the action benefits from it

## Anti-patterns

Do not introduce:

- generic SaaS hero sections
- oversized dashboard cards
- gratuitous purple gradients
- excessive glow
- glass panels on every surface
- giant empty spacing
- repeated nested borders
- icon-only critical actions without labels/tooltips
- visual changes that alter simulation behavior

## Implementation policy

During the v2 redesign:

- preserve all JavaScript-referenced IDs unless the related JavaScript is updated in the same change
- prefer CSS/layout changes before changing application logic
- keep `styles.css` as the current baseline during migration
- apply v2 visual overrides in `styles-v2.css` until the redesign stabilizes
- once stable, the stylesheets may be consolidated in a later refactor
