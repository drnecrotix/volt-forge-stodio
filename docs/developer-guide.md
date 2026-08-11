# VoltForge Studio Developer Guide

## Architecture Overview

The MVP is split into three main layers:

### `opencircuitlab.core`

Contains:

- schematic models
- component catalog
- JSON save/load utilities

Main files:

- `models.py`
- `catalog.py`
- `project_io.py`

### `opencircuitlab.simulation`

Contains:

- SPICE netlist generation
- Ngspice batch execution
- waveform parsing
- simulation result structures

Main files:

- `netlist.py`
- `backend.py`
- `result.py`

### `opencircuitlab.gui`

Contains:

- schematic editor scene
- main application window
- waveform viewer

Main files:

- `editor_scene.py`
- `main_window.py`
- `waveform_viewer.py`

## Browser Package Mirror

The web app now mirrors the same idea in `webapp/`:

- `webapp/core/project-io.js`
- `webapp/simulation/netlist.js`
- `webapp/simulation/transient.js`
- `webapp/gui/spice-workbench.js`
- `webapp/gui/waveform-viewer.js`

This keeps the browser build aligned with the desktop architecture while still using the existing SVG editor in `app.js`.

## Running the App

```bash
python -m opencircuitlab.main
```

## Running Tests

Install the project in editable mode from the repository root, then run:

```bash
python -m unittest discover -s tests
```

## JSON Project Format

Each project stores:

- title
- transient analysis settings
- ground pin reference
- component list
- wire list

See the `examples/` folder for sample files.

## Netlist Generation Flow

1. Collect all pins from the schematic
2. Join connected pins with union-find
3. Map the ground network to node `0`
4. Assign stable node names like `N1`, `N2`, `N3`
5. Emit component lines
6. Emit `.tran`
7. Emit `.end`

## Ngspice Backend Flow

1. Receive a generated netlist string
2. Write the netlist into a temporary `.cir` file
3. Inject a `.control` block for batch execution
4. Run Ngspice
5. Capture stdout and stderr
6. Parse the generated ASCII raw file
7. Return a `SimulationResult`

## Adding New Components

When adding a new component:

1. Extend `COMPONENT_LIBRARY` in `core/catalog.py`
2. Update the GUI placement rules in `gui/editor_scene.py` if the symbol shape or pin layout differs
3. Add SPICE output support in `simulation/netlist.py`
4. Add example usage in `examples/`
5. Add tests in `tests/`

## Localization Notes

The MVP uses a simple language menu in the Qt main window.

For new UI text:

- place the label in the `TRANSLATIONS` dictionary
- keep English and Bulgarian in sync
- prefer short labels for buttons and toolbars

## Future Improvements

Recommended next steps:

- richer schematic symbols
- better wire editing and routing
- DC operating point support
- AC sweep and frequency response
- probes and measurement tools
- packaging with installer scripts
- more robust Ngspice parsing and raw-file compatibility tests
