"""Simple schematic editor scene for the OpenCircuitLab MVP."""

from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QBrush, QPainterPath, QPen
from PySide6.QtWidgets import (
    QGraphicsEllipseItem,
    QGraphicsItem,
    QGraphicsPathItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsSimpleTextItem,
)

from opencircuitlab.core import COMPONENT_LIBRARY, PinRef, Schematic, SchematicComponent


@dataclass(frozen=True)
class TerminalLayout:
    pin: str
    x: float
    y: float


class TerminalItem(QGraphicsEllipseItem):
    def __init__(self, component_item: "ComponentItem", pin_name: str, x: float, y: float) -> None:
        super().__init__(-6, -6, 12, 12, component_item)
        self.component_item = component_item
        self.pin_name = pin_name
        self.setPos(QPointF(x, y))
        self.setBrush(QBrush(QColor("#bfdbfe")))
        self.setPen(QPen(QColor("#38bdf8"), 1.5))
        self.setZValue(3)

    @property
    def pin_ref(self) -> PinRef:
        return PinRef(component_id=self.component_item.component.id, pin=self.pin_name)

    def mousePressEvent(self, event) -> None:  # noqa: N802
        scene = self.scene()
        if isinstance(scene, SchematicScene):
            scene.handle_terminal_click(self.pin_ref)
        event.accept()


class WireItem(QGraphicsPathItem):
    def __init__(self, wire_id: str, start_item: TerminalItem, end_item: TerminalItem) -> None:
        super().__init__()
        self.wire_id = wire_id
        self.start_item = start_item
        self.end_item = end_item
        self.setZValue(1)
        self.setFlags(QGraphicsItem.ItemIsSelectable)
        self.setPen(QPen(QColor("#60a5fa"), 3))
        self.refresh_path()

    def refresh_path(self) -> None:
        start_point = self.start_item.scenePos()
        end_point = self.end_item.scenePos()
        mid_x = start_point.x() + (end_point.x() - start_point.x()) / 2
        path = QPainterPath(start_point)
        path.lineTo(mid_x, start_point.y())
        path.lineTo(mid_x, end_point.y())
        path.lineTo(end_point)
        self.setPath(path)


class ComponentItem(QGraphicsRectItem):
    def __init__(self, component: SchematicComponent) -> None:
        self.component = component
        self.terminals: dict[str, TerminalItem] = {}
        width = 126 if component.type != "ground" else 94
        height = 66 if component.type != "ground" else 52
        super().__init__(QRectF(0, 0, width, height))
        self.setPos(component.x, component.y)
        self.setFlags(
            QGraphicsItem.ItemIsMovable
            | QGraphicsItem.ItemIsSelectable
            | QGraphicsItem.ItemSendsGeometryChanges
        )
        self.setPen(QPen(QColor("#1f2f54"), 2))
        self.setBrush(QBrush(QColor("#0d1529")))
        self.setZValue(2)

        accent = QColor(COMPONENT_LIBRARY[component.type].accent)
        self.name_text = QGraphicsSimpleTextItem(component.name, self)
        self.name_text.setBrush(QBrush(QColor("#eef2ff")))
        self.name_text.setPos(14, 10)

        self.value_text = QGraphicsSimpleTextItem(component.value, self)
        self.value_text.setBrush(QBrush(QColor("#9fb2d9")))
        self.value_text.setPos(14, 34)

        for layout in self._terminal_layouts():
            terminal = TerminalItem(self, layout.pin, layout.x, layout.y)
            terminal.setBrush(QBrush(accent.lighter(160)))
            self.terminals[layout.pin] = terminal

    def _terminal_layouts(self) -> list[TerminalLayout]:
        if self.component.type == "ground":
            return [TerminalLayout(self.component.pins[0], self.rect().width() / 2, 0)]
        return [
            TerminalLayout(self.component.pins[0], 0, self.rect().height() / 2),
            TerminalLayout(self.component.pins[1], self.rect().width(), self.rect().height() / 2),
        ]

    def itemChange(self, change, value):  # noqa: N802
        if change == QGraphicsItem.ItemPositionHasChanged:
            self.component.x = float(value.x())
            self.component.y = float(value.y())
            scene = self.scene()
            if isinstance(scene, SchematicScene):
                scene.refresh_wires()
                scene.schematic_changed.emit()
        if change == QGraphicsItem.ItemSelectedHasChanged:
            scene = self.scene()
            if isinstance(scene, SchematicScene):
                scene.handle_selection_change()
        return super().itemChange(change, value)

    def refresh_labels(self) -> None:
        self.name_text.setText(self.component.name)
        self.value_text.setText(self.component.value)


class SchematicScene(QGraphicsScene):
    schematic_changed = Signal()
    selection_changed = Signal(object)
    status_message = Signal(str)

    def __init__(self, schematic: Schematic, parent=None) -> None:
        super().__init__(parent)
        self.schematic = schematic
        self.tool = "select"
        self.pending_pin: PinRef | None = None
        self.component_items: dict[str, ComponentItem] = {}
        self.wire_items: dict[str, WireItem] = {}
        self.setSceneRect(0, 0, 2000, 1200)
        self.sync_from_schematic()

    def set_schematic(self, schematic: Schematic) -> None:
        self.schematic = schematic
        self.pending_pin = None
        self.sync_from_schematic()
        self.schematic_changed.emit()

    def sync_from_schematic(self) -> None:
        self.clear()
        self.component_items = {}
        self.wire_items = {}

        for component in self.schematic.components:
            item = ComponentItem(component)
            self.addItem(item)
            self.component_items[component.id] = item

        for wire in self.schematic.wires:
            start_item = self.component_items[wire.start.component_id].terminals[wire.start.pin]
            end_item = self.component_items[wire.end.component_id].terminals[wire.end.pin]
            wire_item = WireItem(wire.id, start_item, end_item)
            self.addItem(wire_item)
            self.wire_items[wire.id] = wire_item

    def refresh_wires(self) -> None:
        for wire_item in self.wire_items.values():
            wire_item.refresh_path()

    def set_tool(self, tool: str) -> None:
        self.tool = tool
        if tool != "wire":
            self.pending_pin = None
            self.status_message.emit("Selection mode active.")

    def handle_terminal_click(self, pin_ref: PinRef) -> None:
        if self.tool != "wire":
            component = self.schematic.component_by_id(pin_ref.component_id)
            self.selection_changed.emit(component)
            return

        if self.pending_pin is None:
            self.pending_pin = pin_ref
            self.status_message.emit(f"Wire start selected: {pin_ref.component_id}:{pin_ref.pin}")
            return

        try:
            self.schematic.add_wire(self.pending_pin, pin_ref)
        except ValueError as error:
            self.status_message.emit(str(error))
            self.pending_pin = None
            return

        self.pending_pin = None
        self.sync_from_schematic()
        self.schematic_changed.emit()
        self.status_message.emit("Wire created.")

    def add_component(self, component_type: str) -> SchematicComponent:
        index = len(self.schematic.components)
        component = self.schematic.add_component(
            component_type,
            x=100 + (index % 4) * 180,
            y=120 + (index // 4) * 120,
        )
        self.sync_from_schematic()
        self.schematic_changed.emit()
        self.selection_changed.emit(component)
        return component

    def selected_component(self) -> SchematicComponent | None:
        for item in self.selectedItems():
            if isinstance(item, ComponentItem):
                return item.component
        return None

    def selected_wire_id(self) -> str | None:
        for item in self.selectedItems():
            if isinstance(item, WireItem):
                return item.wire_id
        return None

    def remove_selected(self) -> None:
        component = self.selected_component()
        if component:
            self.schematic.remove_component(component.id)
            self.sync_from_schematic()
            self.schematic_changed.emit()
            self.selection_changed.emit(None)
            return

        wire_id = self.selected_wire_id()
        if wire_id is None:
            return
        self.schematic.wires = [wire for wire in self.schematic.wires if wire.id != wire_id]
        self.sync_from_schematic()
        self.schematic_changed.emit()
        self.selection_changed.emit(None)

    def handle_selection_change(self) -> None:
        self.selection_changed.emit(self.selected_component())
