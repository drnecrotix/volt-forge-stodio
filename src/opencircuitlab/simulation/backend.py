"""Python wrapper for running Ngspice in batch mode."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .result import SignalTrace, SimulationResult


class NgspiceRunner:
    def __init__(self, executable: str = "ngspice") -> None:
        self.executable = executable

    def run(self, netlist: str) -> SimulationResult:
        executable_path = shutil.which(self.executable)
        if executable_path is None:
            return SimulationResult(
                success=False,
                error_message=(
                    "Ngspice is not installed or is not available in PATH. "
                    "Install Ngspice and restart the application."
                ),
                netlist=netlist,
            )

        with tempfile.TemporaryDirectory(prefix="opencircuitlab-") as temp_dir:
            temp_root = Path(temp_dir)
            circuit_path = temp_root / "simulation.cir"
            raw_path = temp_root / "simulation.raw"
            batch_netlist = self._with_batch_commands(netlist, raw_path)
            circuit_path.write_text(batch_netlist, encoding="utf-8")

            completed = subprocess.run(
                [executable_path, "-b", str(circuit_path)],
                capture_output=True,
                text=True,
                cwd=temp_root,
                check=False,
            )

            stdout = completed.stdout
            stderr = completed.stderr

            if completed.returncode != 0:
                return SimulationResult(
                    success=False,
                    stdout=stdout,
                    stderr=stderr,
                    error_message=self._extract_error_message(stdout, stderr),
                    netlist=netlist,
                )

            if not raw_path.exists():
                return SimulationResult(
                    success=False,
                    stdout=stdout,
                    stderr=stderr,
                    error_message="Ngspice finished without producing waveform data.",
                    netlist=netlist,
                )

            try:
                scale_name, scale_values, traces, plot_name = self._parse_ascii_raw(raw_path)
            except ValueError as error:
                return SimulationResult(
                    success=False,
                    stdout=stdout,
                    stderr=stderr,
                    error_message=str(error),
                    netlist=netlist,
                )

        return SimulationResult(
            success=True,
            scale_name=scale_name,
            scale_values=scale_values,
            traces=traces,
            plot_name=plot_name,
            stdout=stdout,
            stderr=stderr,
            netlist=netlist,
        )

    def _with_batch_commands(self, netlist: str, raw_path: Path) -> str:
        stripped = netlist.strip()
        if not stripped.endswith(".end"):
            raise ValueError("Netlist must end with .end")

        body = stripped.rsplit(".end", maxsplit=1)[0].rstrip()
        raw_file = raw_path.as_posix()
        control_block = "\n".join(
            [
                ".control",
                "set filetype=ascii",
                "run",
                f"write {raw_file} all",
                "quit",
                ".endc",
                ".end",
            ]
        )
        return f"{body}\n{control_block}\n"

    def _extract_error_message(self, stdout: str, stderr: str) -> str:
        combined = "\n".join(part for part in (stdout, stderr) if part).strip()
        for line in combined.splitlines():
            lowered = line.lower()
            if "error" in lowered or "fatal" in lowered:
                return line.strip()
        return combined or "Ngspice reported an unknown simulation error."

    def _parse_ascii_raw(
        self,
        raw_path: Path,
    ) -> tuple[str, list[float], dict[str, SignalTrace], str]:
        lines = raw_path.read_text(encoding="utf-8", errors="replace").splitlines()
        plot_name = ""
        variable_names: list[str] = []
        values_start = None
        variable_start = None

        for index, line in enumerate(lines):
            if line.startswith("Plotname:"):
                plot_name = line.split(":", maxsplit=1)[1].strip()
            elif line.startswith("Variables:"):
                variable_start = index + 1
            elif line.startswith("Values:"):
                values_start = index + 1
                break

        if variable_start is None or values_start is None:
            raise ValueError("Could not parse Ngspice output file.")

        for line in lines[variable_start:values_start - 1]:
            stripped = line.strip()
            if not stripped:
                continue
            parts = stripped.split()
            if len(parts) < 3:
                continue
            variable_names.append(parts[1])

        if not variable_names:
            raise ValueError("Ngspice returned no variables to plot.")

        point_values: list[list[float]] = []
        line_index = values_start
        variable_count = len(variable_names)
        while line_index < len(lines):
            stripped = lines[line_index].strip()
            if not stripped:
                line_index += 1
                continue

            first_line_tokens = stripped.split()
            try:
                int(first_line_tokens[0])
            except ValueError:
                line_index += 1
                continue

            current_values = [float(first_line_tokens[1])]
            line_index += 1
            while len(current_values) < variable_count and line_index < len(lines):
                candidate = lines[line_index].strip()
                if not candidate:
                    line_index += 1
                    continue
                tokens = candidate.split()
                if len(tokens) == 1:
                    current_values.append(float(tokens[0]))
                    line_index += 1
                    continue
                try:
                    int(tokens[0])
                except ValueError:
                    current_values.extend(float(token) for token in tokens)
                    line_index += 1
                    continue
                break

            if len(current_values) != variable_count:
                raise ValueError("Ngspice returned incomplete waveform rows.")
            point_values.append(current_values)

        if not point_values:
            raise ValueError("Ngspice returned an empty waveform data set.")

        scale_name = variable_names[0]
        scale_values = [row[0] for row in point_values]
        traces = {
            variable_names[index]: SignalTrace(
                name=variable_names[index],
                values=[row[index] for row in point_values],
            )
            for index in range(1, variable_count)
        }
        return scale_name, scale_values, traces, plot_name
