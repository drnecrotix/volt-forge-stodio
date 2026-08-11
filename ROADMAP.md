# VoltForge Studio Roadmap

VoltForge Studio is in early development. This roadmap organizes the public direction of the project into practical milestones without assigning release dates before the implementation is ready.

## Phase 1 — Public Foundation

- Maintain clear project documentation and contribution guidelines
- Publish screenshots and design previews
- Define the initial desktop and web architecture
- Prepare issue templates, security guidance, and contribution workflow

## Phase 2 — First Source Release

- Publish the initial Python desktop application source
- Add the PySide6 application shell and schematic workspace
- Add core circuit data models
- Add project save/load support using JSON
- Add Ngspice-compatible netlist generation
- Add example projects and automated tests

## Phase 3 — Simulation Workflow

- Integrate Ngspice execution
- Add transient analysis support
- Add waveform visualization
- Add trace selection and cursor inspection
- Add CSV export for simulation results
- Improve simulation error reporting

## Phase 4 — Schematic Editing

- Expand component placement and editing
- Improve wire creation and editing
- Add richer schematic symbols
- Improve node and ground handling
- Add validation for incomplete or invalid circuits

## Phase 5 — Web Track

- Publish the browser-based workspace
- Add browser project persistence and JSON import/export
- Add client-side netlist generation
- Add waveform preview tooling
- Keep project formats compatible between desktop and web where practical

## Phase 6 — Broader Analysis and Polish

- Add more electronic components
- Expand supported SPICE analyses
- Improve accessibility and keyboard workflows
- Improve performance for larger schematics
- Expand user and developer documentation
- Prepare the project for its first stable release

## Contributing to the Roadmap

Feature ideas and implementation proposals are welcome through GitHub Issues. Please keep proposals focused on one problem or capability so they can be discussed and tracked independently.

The roadmap may evolve as the implementation develops and technical constraints become clearer.
