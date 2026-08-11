# ⚡ VoltForge Studio

**Open-source circuit design studio for visually building, simulating,
and analyzing electronic circuits with SPICE.**

VoltForge Studio is an open-source electronic circuit design and
simulation environment for **web and desktop**. It combines visual
schematic editing, SPICE netlist generation, Ngspice simulation, project
persistence, and transient waveform analysis in one workspace.

> **Status:** Early development / MVP

## ✨ Features

### Desktop MVP

-   Place resistors, capacitors, voltage sources, and ground
-   Connect components with wires
-   Edit component values
-   Save and load projects as JSON
-   Generate Ngspice-compatible SPICE netlists
-   Run Ngspice simulations in batch mode
-   Plot transient analysis results in a waveform viewer

### Web Prototype

-   Visual browser-based circuit workspace
-   Modular web architecture
-   JSON project import and export
-   Compatibility with desktop example projects
-   SPICE netlist generation in the browser
-   Transient waveform preview
-   CSV export from the waveform viewer

## 🧩 Architecture

VoltForge Studio currently has two parallel development tracks:

**Web** - `index.html`, `styles.css`, `app.js` --- visual prototype -
`webapp/core` --- project persistence and import compatibility -
`webapp/simulation` --- SPICE netlist generation and transient preview -
`webapp/gui` --- SPICE workbench and waveform viewer

**Desktop** - `src/opencircuitlab/` --- Python desktop application -
**PySide6** --- desktop interface - **Ngspice** --- circuit simulation
backend

## 📁 Repository Structure

``` text
.
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── docs/
│   ├── developer-guide.md
│   └── user-guide.md
├── examples/
│   ├── rc_step.json
│   └── resistor_divider.json
├── src/
│   └── opencircuitlab/
│       ├── main.py
│       ├── core/
│       ├── gui/
│       └── simulation/
├── tests/
│   └── test_netlist_generator.py
├── webapp/
├── app.js
├── index.html
└── styles.css
```

## 🚀 Quick Start

### Requirements

-   Python **3.10+**
-   Ngspice available in your system `PATH`

### Install

Clone the repository and enter the project directory:

``` bash
git clone https://github.com/drnecrotix/VoltForge-Studio.git
cd VoltForge-Studio
```

Install the Python package in editable mode:

``` bash
pip install -e .
```

Install optional plotting support:

``` bash
pip install pyqtgraph
```

Make sure Ngspice is installed and available from your terminal:

``` bash
ngspice --version
```

### Run the Desktop App

``` bash
python -m opencircuitlab.main
```

## 🧪 Tests

Run the test suite with Python's built-in `unittest`:

``` bash
python -m unittest discover -s tests
```

If required, set the project `src` directory in `PYTHONPATH` before
running the tests.

## 📚 Documentation

More detailed documentation is available in:

-   [`docs/user-guide.md`](docs/user-guide.md) --- user guide
-   [`docs/developer-guide.md`](docs/developer-guide.md) --- developer
    documentation
-   [`CONTRIBUTING.md`](CONTRIBUTING.md) --- contribution guide

## 🗺️ Roadmap

Future development can expand VoltForge Studio with:

-   More electronic components
-   Richer schematic symbols
-   Improved wire editing
-   Broader SPICE analysis support
-   More capable waveform visualization
-   Continued web and desktop workflow improvements

## 🤝 Contributing

Contributions, bug reports, feature ideas, and pull requests are
welcome.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before contributing.

## 📄 License

VoltForge Studio is open-source software. See [`LICENSE`](LICENSE) for
the license terms.

------------------------------------------------------------------------

### ⚡ VoltForge Studio

**Design. Simulate. Analyze.**
