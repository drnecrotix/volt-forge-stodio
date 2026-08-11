"""Ngspice-compatible netlist generator for the schematic model."""

from __future__ import annotations

from dataclasses import dataclass

from opencircuitlab.core.models import PinRef, Schematic, SchematicComponent, Wire


class UnionFind:
    def __init__(self, items: list[str]) -> None:
        self.parent = {item: item for item in items}

    def find(self, item: str) -> str:
        parent = self.parent[item]
        if parent == item:
            return item
        root = self.find(parent)
        self.parent[item] = root
        return root

    def union(self, left: str, right: str) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


@dataclass
class SpiceNetlistGenerator:
    title: str = "VoltForge Studio / OpenCircuitLab"

    def generate(self, schematic: Schematic) -> str:
        node_map = self._build_node_map(schematic)
        lines = [f"* {self.title}"]

        for component in schematic.components:
            if component.type == "ground":
                continue
            lines.append(self._component_line(component, node_map))

        lines.append(f".tran {schematic.analysis.step} {schematic.analysis.stop}")
        lines.append(".end")
        return "\n".join(lines)

    def _build_node_map(self, schematic: Schematic) -> dict[str, str]:
        all_pins = [self._pin_key(component.id, pin) for component in schematic.components for pin in component.pins]
        union_find = UnionFind(all_pins)
        for wire in schematic.wires:
            union_find.union(wire.start.key(), wire.end.key())

        ground_root = None
        if schematic.ground_pin:
            ground_root = union_find.find(schematic.ground_pin.key())
        else:
            for component in schematic.components:
                if component.type == "ground":
                    ground_root = union_find.find(self._pin_key(component.id, component.pins[0]))
                    break

        node_labels: dict[str, str] = {}
        next_index = 1
        for component in schematic.components:
            for pin in component.pins:
                pin_key = self._pin_key(component.id, pin)
                root = union_find.find(pin_key)
                if root in node_labels:
                    continue
                if ground_root and root == ground_root:
                    node_labels[root] = "0"
                else:
                    node_labels[root] = f"N{next_index}"
                    next_index += 1

        return {pin_key: node_labels[union_find.find(pin_key)] for pin_key in all_pins}

    def _component_line(self, component: SchematicComponent, node_map: dict[str, str]) -> str:
        node_names = [node_map[self._pin_key(component.id, pin)] for pin in component.pins]
        if component.type == "resistor":
            return f"{component.name} {node_names[0]} {node_names[1]} {component.value}"
        if component.type == "capacitor":
            return f"{component.name} {node_names[0]} {node_names[1]} {component.value}"
        if component.type == "voltage_source":
            return f"{component.name} {node_names[0]} {node_names[1]} DC {component.value}"
        raise ValueError(f"Unsupported component type for netlist generation: {component.type}")

    @staticmethod
    def _pin_key(component_id: str, pin_name: str) -> str:
        return f"{component_id}:{pin_name}"


def generate_netlist(schematic: Schematic) -> str:
    return SpiceNetlistGenerator().generate(schematic)
