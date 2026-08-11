# VoltForge Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Project Status: Early Development](https://img.shields.io/badge/status-early%20development-orange.svg)](#project-status)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Last Commit](https://img.shields.io/github/last-commit/drnecrotix/volt-forge-stodio)](https://github.com/drnecrotix/volt-forge-stodio/commits/main)

**Design. Simulate. Analyze.**

VoltForge Studio is an open-source circuit design environment for visually building, simulating, and analyzing electronic circuits with SPICE. The project aims to provide an approachable workspace for both web and desktop users, combining schematic editing, project persistence, netlist generation, simulation, and waveform analysis.

## Overview

The goal of VoltForge Studio is to make circuit exploration feel direct and visual without hiding the underlying engineering workflow. It is designed for students, hobbyists, educators, and engineers who want to move smoothly from a schematic to simulation results.

## Features and Focus

Planned and active areas of development include:

- Visual schematic editing and component placement
- Wire connections and editable component values
- JSON-based project save, load, import, and export
- Ngspice-compatible netlist generation
- SPICE simulation workflows
- Transient waveform visualization and CSV export
- Consistent project compatibility across web and desktop experiences
- Accessible, maintainable, and modular user interfaces

## Technology and Project Tracks

VoltForge Studio is being shaped around two complementary tracks:

### Desktop application

- Python 3.10+
- PySide6 for the desktop interface
- Ngspice as the simulation backend
- Optional PyQtGraph-based waveform visualization

### Web application

- HTML, CSS, and JavaScript
- Browser-based schematic workspace
- Client-side project persistence and netlist generation
- Modular simulation and waveform-viewer components

The implementation is still evolving. Technical choices and repository structure may change before the first stable release.

## Project Status

VoltForge Studio is in early development. This repository currently provides the public project and collaboration foundation. Source code, examples, tests, and detailed documentation will be published as the implementation is prepared for release.

## Getting Started

The verified installation and run commands will be added with the first source release. The expected workflow will be:

```bash
git clone https://github.com/drnecrotix/volt-forge-stodio.git
cd volt-forge-stodio

# Installation and launch commands will be documented here.
```

Watch the [releases page](https://github.com/drnecrotix/volt-forge-stodio/releases) and [changelog](CHANGELOG.md) for availability updates.

## Contributing

Ideas, bug reports, feature requests, documentation improvements, and code contributions are welcome. Before contributing:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md).
2. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Use the provided issue or pull request template.

Please report security vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

VoltForge Studio is open-source software released under the [MIT License](LICENSE).

## Contact

- Project: <https://github.com/drnecrotix/volt-forge-stodio>
- Maintainer: [@drnecrotix](https://github.com/drnecrotix)
