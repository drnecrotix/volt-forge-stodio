"""JSON persistence for OpenCircuitLab schematics."""

from __future__ import annotations

import json
from pathlib import Path

from .models import PinRef, Schematic, SchematicComponent, TransientAnalysis, Wire


def schematic_to_dict(schematic: Schematic) -> dict:
    return {
        "title": schematic.title,
        "analysis": {
            "step": schematic.analysis.step,
            "stop": schematic.analysis.stop,
        },
        "ground_pin": (
            {
                "component_id": schematic.ground_pin.component_id,
                "pin": schematic.ground_pin.pin,
            }
            if schematic.ground_pin
            else None
        ),
        "components": [
            {
                "id": component.id,
                "type": component.type,
                "name": component.name,
                "value": component.value,
                "pins": component.pins,
                "x": component.x,
                "y": component.y,
            }
            for component in schematic.components
        ],
        "wires": [
            {
                "id": wire.id,
                "start": {
                    "component_id": wire.start.component_id,
                    "pin": wire.start.pin,
                },
                "end": {
                    "component_id": wire.end.component_id,
                    "pin": wire.end.pin,
                },
            }
            for wire in schematic.wires
        ],
    }


def schematic_from_dict(data: dict) -> Schematic:
    analysis_data = data.get("analysis", {})
    schematic = Schematic(
        title=data.get("title", "Untitled Schematic"),
        analysis=TransientAnalysis(
            step=analysis_data.get("step", "1ms"),
            stop=analysis_data.get("stop", "100ms"),
        ),
    )
    schematic.components = [
        SchematicComponent(
            id=item["id"],
            type=item["type"],
            name=item["name"],
            value=item["value"],
            pins=list(item["pins"]),
            x=float(item.get("x", 0.0)),
            y=float(item.get("y", 0.0)),
        )
        for item in data.get("components", [])
    ]
    schematic.wires = [
        Wire(
            id=item["id"],
            start=PinRef(**item["start"]),
            end=PinRef(**item["end"]),
        )
        for item in data.get("wires", [])
    ]
    ground_data = data.get("ground_pin")
    if ground_data:
        schematic.ground_pin = PinRef(**ground_data)
    schematic.reset_counters()
    return schematic


def save_schematic(schematic: Schematic, path: str | Path) -> None:
    target = Path(path)
    target.write_text(json.dumps(schematic_to_dict(schematic), indent=2), encoding="utf-8")


def load_schematic(path: str | Path) -> Schematic:
    source = Path(path)
    return schematic_from_dict(json.loads(source.read_text(encoding="utf-8")))
