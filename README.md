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

> **Source availability:** The application source has not been published in this repository yet. The commands below describe the intended desktop workflow and will become usable when the first source release adds the Python package files.

### Prerequisites

- Git
- Python 3.10 or newer
- Ngspice installed and available from your system `PATH`

Confirm the required tools before continuing:

```bash
git --version
python --version
ngspice --version
```

On systems where Python 3 is exposed as `python3`, use `python3` in place of `python` throughout these instructions.

### Clone the Repository

```bash
git clone https://github.com/drnecrotix/volt-forge-stodio.git
cd volt-forge-stodio
```

### Create a Virtual Environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS and Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Install the Desktop Application

Upgrade the packaging tools, then install VoltForge Studio in editable mode:

```bash
python -m pip install --upgrade pip
python -m pip install -e .
```

Install the optional plotting dependency if it is not included by the package configuration:

```bash
python -m pip install pyqtgraph
```

### Run the Desktop Application

```bash
python -m opencircuitlab.main
```

If Python cannot find `opencircuitlab`, confirm that the virtual environment is active and repeat `python -m pip install -e .` from the repository root.

### Run the Tests

```bash
python -m unittest discover -s tests
```

### Web Application

The web application launch command will be documented when its source and development tooling are published. No web installation command is currently claimed because the public repository does not yet contain the web application files.

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
