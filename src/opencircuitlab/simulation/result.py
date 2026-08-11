"""Simulation result objects used by the backend and waveform viewer."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SignalTrace:
    name: str
    values: list[float]


@dataclass
class SimulationResult:
    success: bool
    scale_name: str = "time"
    scale_values: list[float] = field(default_factory=list)
    traces: dict[str, SignalTrace] = field(default_factory=dict)
    plot_name: str = ""
    stdout: str = ""
    stderr: str = ""
    error_message: str | None = None
    netlist: str = ""

    @property
    def signals(self) -> list[str]:
        return list(self.traces.keys())

    def trace_values(self, signal_name: str) -> list[float]:
        return self.traces[signal_name].values
