"""Domain models for schematic capture and transient analysis."""

from __future__ import annotations

from dataclasses import dataclass, field

from .catalog import COMPONENT_LIBRARY


@dataclass
class PinRef:
    component_id: str
    pin: str

    def key(self) -> str:
        return f"{self.component_id}:{self.pin}"


@dataclass
class Wire:
    id: str
    start: PinRef
    end: PinRef


@dataclass
class SchematicComponent:
    id: str
    type: str
    name: str
    value: str
    pins: list[str]
    x: float = 0.0
    y: float = 0.0


@dataclass
class TransientAnalysis:
    step: str = "1ms"
    stop: str = "100ms"


@dataclass
class Schematic:
    title: str = "Untitled Schematic"
    components: list[SchematicComponent] = field(default_factory=list)
    wires: list[Wire] = field(default_factory=list)
    ground_pin: PinRef | None = None
    analysis: TransientAnalysis = field(default_factory=TransientAnalysis)
    _component_counter: dict[str, int] = field(default_factory=dict, init=False, repr=False)
    _wire_counter: int = field(default=0, init=False, repr=False)

    def component_by_id(self, component_id: str) -> SchematicComponent:
        for component in self.components:
            if component.id == component_id:
                return component
        raise KeyError(f"Unknown component id: {component_id}")

    def wire_by_id(self, wire_id: str) -> Wire:
        for wire in self.wires:
            if wire.id == wire_id:
                return wire
        raise KeyError(f"Unknown wire id: {wire_id}")

    def next_component_name(self, component_type: str) -> str:
        spec = COMPONENT_LIBRARY[component_type]
        next_index = self._component_counter.get(component_type, 0) + 1
        self._component_counter[component_type] = next_index
        return f"{spec.default_name_prefix}{next_index}"

    def next_component_id(self, component_type: str) -> str:
        prefix = component_type.replace("_", "-")
        return f"{prefix}-{self._component_counter.get(component_type, 0) + 1}"

    def add_component(
        self,
        component_type: str,
        *,
        x: float = 0.0,
        y: float = 0.0,
        name: str | None = None,
        value: str | None = None,
    ) -> SchematicComponent:
        if component_type not in COMPONENT_LIBRARY:
            raise ValueError(f"Unsupported component type: {component_type}")
        spec = COMPONENT_LIBRARY[component_type]
        component_name = name or self.next_component_name(component_type)
        component_id = self.next_component_id(component_type)
        component = SchematicComponent(
            id=component_id,
            type=component_type,
            name=component_name,
            value=value or spec.default_value,
            pins=list(spec.pins),
            x=x,
            y=y,
        )
        self.components.append(component)
        if component_type == "ground":
            self.ground_pin = PinRef(component_id=component.id, pin=component.pins[0])
        return component

    def remove_component(self, component_id: str) -> None:
        self.components = [component for component in self.components if component.id != component_id]
        self.wires = [
            wire
            for wire in self.wires
            if wire.start.component_id != component_id and wire.end.component_id != component_id
        ]
        if self.ground_pin and self.ground_pin.component_id == component_id:
            self.ground_pin = None

    def add_wire(self, start: PinRef, end: PinRef) -> Wire:
        if start.key() == end.key():
            raise ValueError("A wire must connect two different pins.")
        for wire in self.wires:
            same_direction = wire.start.key() == start.key() and wire.end.key() == end.key()
            reverse_direction = wire.start.key() == end.key() and wire.end.key() == start.key()
            if same_direction or reverse_direction:
                raise ValueError("This wire already exists.")
        self._wire_counter += 1
        wire = Wire(id=f"wire-{self._wire_counter}", start=start, end=end)
        self.wires.append(wire)
        return wire

    def set_ground_pin(self, pin_ref: PinRef) -> None:
        self.ground_pin = pin_ref

    def reset_counters(self) -> None:
        self._component_counter = {}
        self._wire_counter = 0
        for component in self.components:
            self._component_counter[component.type] = self._component_counter.get(component.type, 0) + 1
        for wire in self.wires:
            try:
                wire_number = int(wire.id.split("-")[-1])
            except ValueError:
                continue
            self._wire_counter = max(self._wire_counter, wire_number)
