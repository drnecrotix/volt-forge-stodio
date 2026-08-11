"""SPICE netlist generation and simulation backend."""

from .backend import NgspiceRunner
from .netlist import SpiceNetlistGenerator, generate_netlist
from .result import SignalTrace, SimulationResult

__all__ = [
    "NgspiceRunner",
    "SignalTrace",
    "SimulationResult",
    "SpiceNetlistGenerator",
    "generate_netlist",
]
