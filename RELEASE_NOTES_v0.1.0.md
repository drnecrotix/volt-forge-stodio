# VoltForge Studio v0.1.0

VoltForge Studio v0.1.0 is the first public source release of the project.

## Highlights

- Python/PySide6 desktop MVP for schematic editing and project persistence
- Ngspice-compatible SPICE netlist generation and batch simulation integration
- Browser-based circuit workspace with modular project, simulation, topology, and visualization code
- Transient waveform viewing and CSV export workflows
- Example resistor-divider and RC projects
- English/Bulgarian user documentation and developer documentation
- Automated CI across Python 3.10, 3.11, and 3.12 plus JavaScript syntax validation
- Automated GitHub release packaging for tagged versions

## Installation

Python 3.10 or newer is required.

```bash
python -m pip install -e ".[plot]"
```

Ngspice must be installed separately and available in the system `PATH` for external SPICE simulations.

Run the desktop application with:

```bash
python -m opencircuitlab.main
```

The browser version can be served from the repository root with:

```bash
python -m http.server 8000
```

## Status

VoltForge Studio remains in early development. APIs, interfaces, project files, component support, and simulation behavior may change before a stable 1.0 release.

See `CHANGELOG.md` for the complete v0.1.0 change summary.
