# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-11

### Added

- Python desktop MVP with schematic models, editor UI, Ngspice execution, and waveform viewing
- Browser circuit editor with modular project, simulation, topology, and visualization tools
- JSON project save/load plus example resistor-divider and RC projects
- SPICE netlist generation and transient simulation workflows
- Unit tests for core netlist generation
- English/Bulgarian user documentation and developer guide
- Project screenshots demonstrating the circuit workspace, transient waveform viewer, and schematic visualization
- GitHub Actions CI for Python 3.10, 3.11, and 3.12 plus JavaScript syntax checks
- Automated release workflow that builds and validates source and wheel distributions for version tags
- Contribution, conduct, security, support, roadmap, issue, and pull-request documentation
- General-purpose ignore rules for Python, build, editor, environment, and temporary artifacts

### Changed

- Replaced the accidentally selected Apache 2.0 license with the MIT License
- Reworked the README to accurately describe the VoltForge Studio product, source availability, setup, and technology tracks
- Expanded desktop installation, launch, dependency verification, test, web-server, and release instructions

### Known limitations

- Ngspice is required for real external SPICE simulations and is not bundled with VoltForge Studio
- The project is still in early development; interfaces and file formats may change before a stable release

[Unreleased]: https://github.com/drnecrotix/volt-forge-stodio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/drnecrotix/volt-forge-stodio/releases/tag/v0.1.0
