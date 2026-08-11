"""Component catalog for the first OpenCircuitLab MVP."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ComponentSpec:
    component_type: str
    display_name: str
    default_name_prefix: str
    default_value: str
    pins: tuple[str, ...]
    accent: str = "#38bdf8"


COMPONENT_LIBRARY: dict[str, ComponentSpec] = {
    "resistor": ComponentSpec(
        component_type="resistor",
        display_name="Resistor",
        default_name_prefix="R",
        default_value="1k",
        pins=("a", "b"),
        accent="#60a5fa",
    ),
    "capacitor": ComponentSpec(
        component_type="capacitor",
        display_name="Capacitor",
        default_name_prefix="C",
        default_value="10u",
        pins=("a", "b"),
        accent="#22d3ee",
    ),
    "voltage_source": ComponentSpec(
        component_type="voltage_source",
        display_name="Voltage Source",
        default_name_prefix="V",
        default_value="5",
        pins=("positive", "negative"),
        accent="#a78bfa",
    ),
    "ground": ComponentSpec(
        component_type="ground",
        display_name="Ground",
        default_name_prefix="GND",
        default_value="0",
        pins=("gnd",),
        accent="#34d399",
    ),
}
