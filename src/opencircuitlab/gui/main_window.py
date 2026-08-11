"""Main Qt window for the OpenCircuitLab MVP."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QFont, QPainter
from PySide6.QtWidgets import (
    QFileDialog,
    QFormLayout,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QSplitter,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from opencircuitlab.core import COMPONENT_LIBRARY, Schematic, load_schematic, save_schematic
from opencircuitlab.core.project_io import schematic_to_dict
from opencircuitlab.gui.editor_scene import SchematicScene
from opencircuitlab.gui.waveform_viewer import WaveformViewer
from opencircuitlab.simulation import NgspiceRunner, generate_netlist


TRANSLATIONS = {
    "en": {
        "window_title": "VoltForge Studio",
        "subtitle": "Created by Nikola Stoyanov (Necrotix)",
        "components": "Components",
        "tools": "Tools",
        "select_tool": "Select",
        "wire_tool": "Wire",
        "delete": "Delete Selected",
        "save": "Save JSON",
        "load": "Load JSON",
        "netlist": "Show Netlist",
        "simulate": "Run Ngspice",
        "inspector": "Inspector",
        "name": "Name",
        "value": "Value",
        "type": "Type",
        "analysis_step": "Tran Step",
        "analysis_stop": "Tran Stop",
        "apply": "Apply Changes",
        "language": "Language",
        "status_ready": "Ready",
    },
    "bg": {
        "window_title": "VoltForge Studio",
        "subtitle": "Created by Nikola Stoyanov (Necrotix)",
        "components": "Компоненти",
        "tools": "Инструменти",
        "select_tool": "Избор",
        "wire_tool": "Кабел",
        "delete": "Изтрий избраното",
        "save": "Запази JSON",
        "load": "Зареди JSON",
        "netlist": "Покажи netlist",
        "simulate": "Пусни Ngspice",
        "inspector": "Инспектор",
        "name": "Име",
        "value": "Стойност",
        "type": "Тип",
        "analysis_step": "Tran стъпка",
        "analysis_stop": "Tran край",
        "apply": "Приложи",
        "language": "Език",
        "status_ready": "Готово",
    },
}


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.language = "en"
        self.schematic = Schematic(title="VoltForge Studio")
        self.scene = SchematicScene(self.schematic)
        self.runner = NgspiceRunner()
        self.waveform_viewer: WaveformViewer | None = None
        self.current_path: Path | None = None
        self._selected_component_id: str | None = None

        self._build_ui()
        self._connect_signals()
        self._create_menu()
        self._apply_language()

    def _build_ui(self) -> None:
        self.resize(1520, 920)
        central = QWidget(self)
        self.setCentralWidget(central)

        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(16, 16, 16, 16)
        root_layout.setSpacing(14)

        self.title_label = QLabel("VoltForge Studio")
        title_font = QFont()
        title_font.setPointSize(22)
        title_font.setBold(True)
        self.title_label.setFont(title_font)

        self.subtitle_label = QLabel('Created by Nikola Stoyanov (<a href="https://instagram.com/dr.necrotix">Necrotix</a>)')
        self.subtitle_label.setOpenExternalLinks(True)
        self.subtitle_label.setTextFormat(Qt.RichText)

        header = QWidget()
        header_layout = QVBoxLayout(header)
        header_layout.setContentsMargins(18, 14, 18, 14)
        header_layout.addWidget(self.title_label)
        header_layout.addWidget(self.subtitle_label)
        header.setStyleSheet(
            "background:#0d1529;border:1px solid rgba(148,163,184,0.18);"
            "border-radius:18px;color:#eef2ff;"
        )
        root_layout.addWidget(header)

        splitter = QSplitter(Qt.Horizontal)
        root_layout.addWidget(splitter, 1)

        splitter.addWidget(self._build_left_panel())
        splitter.addWidget(self._build_center_panel())
        splitter.addWidget(self._build_right_panel())
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([240, 900, 280])

        self.statusBar().showMessage(TRANSLATIONS[self.language]["status_ready"])

    def _build_left_panel(self) -> QWidget:
        panel = QWidget()
        panel_layout = QVBoxLayout(panel)
        panel_layout.setContentsMargins(0, 0, 0, 0)
        panel_layout.setSpacing(14)

        self.components_heading = QLabel()
        self.components_heading.setStyleSheet("font-weight:700;font-size:18px;")
        panel_layout.addWidget(self.components_heading)

        self.component_buttons: dict[str, QPushButton] = {}
        for component_type, spec in COMPONENT_LIBRARY.items():
            button = QPushButton(spec.display_name)
            button.clicked.connect(lambda _checked=False, t=component_type: self._add_component(t))
            button.setMinimumHeight(42)
            button.setStyleSheet(
                "text-align:left;padding:10px 12px;border-radius:14px;"
                "background:#101a31;color:#eef2ff;border:1px solid rgba(148,163,184,0.18);"
            )
            self.component_buttons[component_type] = button
            panel_layout.addWidget(button)

        panel_layout.addStretch(1)
        return panel

    def _build_center_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        toolbar = QWidget()
        toolbar_layout = QHBoxLayout(toolbar)
        toolbar_layout.setContentsMargins(0, 0, 0, 0)
        toolbar_layout.setSpacing(8)

        self.select_tool_button = QToolButton()
        self.select_tool_button.clicked.connect(lambda: self.scene.set_tool("select"))
        toolbar_layout.addWidget(self.select_tool_button)

        self.wire_tool_button = QToolButton()
        self.wire_tool_button.clicked.connect(lambda: self.scene.set_tool("wire"))
        toolbar_layout.addWidget(self.wire_tool_button)

        self.delete_button = QToolButton()
        self.delete_button.clicked.connect(self.scene.remove_selected)
        toolbar_layout.addWidget(self.delete_button)

        self.save_button = QToolButton()
        self.save_button.clicked.connect(self._save_json)
        toolbar_layout.addWidget(self.save_button)

        self.load_button = QToolButton()
        self.load_button.clicked.connect(self._load_json)
        toolbar_layout.addWidget(self.load_button)

        self.netlist_button = QToolButton()
        self.netlist_button.clicked.connect(self._show_netlist)
        toolbar_layout.addWidget(self.netlist_button)

        self.simulate_button = QToolButton()
        self.simulate_button.clicked.connect(self._run_simulation)
        toolbar_layout.addWidget(self.simulate_button)

        toolbar_layout.addStretch(1)
        layout.addWidget(toolbar)

        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(QPainter.Antialiasing, True)
        self.view.setDragMode(QGraphicsView.RubberBandDrag)
        self.view.setStyleSheet(
            "background:#09111f;border:1px solid rgba(148,163,184,0.18);border-radius:18px;"
        )
        layout.addWidget(self.view, 1)

        analysis_row = QWidget()
        analysis_layout = QHBoxLayout(analysis_row)
        analysis_layout.setContentsMargins(0, 0, 0, 0)
        analysis_layout.setSpacing(8)

        self.analysis_step_label = QLabel()
        self.analysis_step_edit = QLineEdit(self.schematic.analysis.step)
        self.analysis_step_edit.editingFinished.connect(self._apply_analysis_settings)
        analysis_layout.addWidget(self.analysis_step_label)
        analysis_layout.addWidget(self.analysis_step_edit)

        self.analysis_stop_label = QLabel()
        self.analysis_stop_edit = QLineEdit(self.schematic.analysis.stop)
        self.analysis_stop_edit.editingFinished.connect(self._apply_analysis_settings)
        analysis_layout.addWidget(self.analysis_stop_label)
        analysis_layout.addWidget(self.analysis_stop_edit)
        analysis_layout.addStretch(1)
        layout.addWidget(analysis_row)

        return panel

    def _build_right_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        self.inspector_heading = QLabel()
        self.inspector_heading.setStyleSheet("font-weight:700;font-size:18px;")
        layout.addWidget(self.inspector_heading)

        form_container = QWidget()
        self.inspector_form = QFormLayout(form_container)
        self.inspector_form.setContentsMargins(0, 0, 0, 0)
        self.inspector_form.setSpacing(10)

        self.component_type_label = QLabel("--")
        self.name_edit = QLineEdit()
        self.value_edit = QLineEdit()
        self.apply_button = QPushButton()
        self.apply_button.clicked.connect(self._apply_component_changes)

        self.inspector_form.addRow(QLabel(), QLabel())
        self.inspector_form.addRow(self._make_form_label("Type"), self.component_type_label)
        self.inspector_form.addRow(self._make_form_label("Name"), self.name_edit)
        self.inspector_form.addRow(self._make_form_label("Value"), self.value_edit)
        layout.addWidget(form_container)
        layout.addWidget(self.apply_button)

        self.netlist_preview = QPlainTextEdit()
        self.netlist_preview.setReadOnly(True)
        self.netlist_preview.setPlaceholderText("Generated netlist preview...")
        self.netlist_preview.setMinimumHeight(220)
        layout.addWidget(self.netlist_preview, 1)

        return panel

    def _make_form_label(self, text: str) -> QLabel:
        label = QLabel(text)
        label.setStyleSheet("color:#9fb2d9;")
        return label

    def _connect_signals(self) -> None:
        self.scene.selection_changed.connect(self._on_selection_changed)
        self.scene.schematic_changed.connect(self._refresh_netlist_preview)
        self.scene.status_message.connect(self.statusBar().showMessage)

    def _create_menu(self) -> None:
        language_menu = self.menuBar().addMenu("Language")
        english_action = QAction("🇬🇧 English", self)
        bulgarian_action = QAction("🇧🇬 Български", self)
        english_action.triggered.connect(lambda: self._set_language("en"))
        bulgarian_action.triggered.connect(lambda: self._set_language("bg"))
        language_menu.addAction(english_action)
        language_menu.addAction(bulgarian_action)
        self.language_menu = language_menu

    def _set_language(self, language: str) -> None:
        self.language = language
        self._apply_language()

    def _apply_language(self) -> None:
        t = TRANSLATIONS[self.language]
        self.setWindowTitle(t["window_title"])
        self.title_label.setText(t["window_title"])
        self.subtitle_label.setText(
            'Created by Nikola Stoyanov (<a href="https://instagram.com/dr.necrotix">Necrotix</a>)'
        )
        self.components_heading.setText(t["components"])
        self.select_tool_button.setText(t["select_tool"])
        self.wire_tool_button.setText(t["wire_tool"])
        self.delete_button.setText(t["delete"])
        self.save_button.setText(t["save"])
        self.load_button.setText(t["load"])
        self.netlist_button.setText(t["netlist"])
        self.simulate_button.setText(t["simulate"])
        self.inspector_heading.setText(t["inspector"])
        self.analysis_step_label.setText(t["analysis_step"])
        self.analysis_stop_label.setText(t["analysis_stop"])
        self.apply_button.setText(t["apply"])
        self.statusBar().showMessage(t["status_ready"])
        self.language_menu.setTitle(t["language"])

    def _add_component(self, component_type: str) -> None:
        component = self.scene.add_component(component_type)
        self._focus_component(component.id)

    def _focus_component(self, component_id: str) -> None:
        self._selected_component_id = component_id
        component = self.schematic.component_by_id(component_id)
        self.component_type_label.setText(COMPONENT_LIBRARY[component.type].display_name)
        self.name_edit.setText(component.name)
        self.value_edit.setText(component.value)
        self.value_edit.setEnabled(component.type != "ground")

    def _on_selection_changed(self, component) -> None:
        if component is None:
            self._selected_component_id = None
            self.component_type_label.setText("--")
            self.name_edit.clear()
            self.value_edit.clear()
            return
        self._focus_component(component.id)

    def _apply_component_changes(self) -> None:
        if not self._selected_component_id:
            return
        component = self.schematic.component_by_id(self._selected_component_id)
        component.name = self.name_edit.text().strip() or component.name
        if component.type != "ground":
            component.value = self.value_edit.text().strip() or component.value
        self.scene.sync_from_schematic()
        self.scene.schematic_changed.emit()
        self._focus_component(component.id)
        self.statusBar().showMessage("Component updated.")

    def _apply_analysis_settings(self) -> None:
        self.schematic.analysis.step = self.analysis_step_edit.text().strip() or self.schematic.analysis.step
        self.schematic.analysis.stop = self.analysis_stop_edit.text().strip() or self.schematic.analysis.stop
        self._refresh_netlist_preview()

    def _refresh_netlist_preview(self) -> None:
        try:
            netlist = generate_netlist(self.schematic)
        except ValueError as error:
            self.netlist_preview.setPlainText(str(error))
            return
        self.netlist_preview.setPlainText(netlist)

    def _show_netlist(self) -> None:
        self._refresh_netlist_preview()
        QMessageBox.information(self, "Generated Netlist", self.netlist_preview.toPlainText())

    def _save_json(self) -> None:
        target_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save project",
            str(self.current_path or Path.home() / "schematic.json"),
            "JSON Files (*.json)",
        )
        if not target_path:
            return
        save_schematic(self.schematic, target_path)
        self.current_path = Path(target_path)
        self.statusBar().showMessage(f"Saved {self.current_path.name}")

    def _load_json(self) -> None:
        source_path, _ = QFileDialog.getOpenFileName(
            self,
            "Load project",
            str(self.current_path or Path.home()),
            "JSON Files (*.json)",
        )
        if not source_path:
            return
        self.current_path = Path(source_path)
        self.schematic = load_schematic(self.current_path)
        self.scene.set_schematic(self.schematic)
        self.analysis_step_edit.setText(self.schematic.analysis.step)
        self.analysis_stop_edit.setText(self.schematic.analysis.stop)
        self._refresh_netlist_preview()
        self.statusBar().showMessage(f"Loaded {self.current_path.name}")

    def _run_simulation(self) -> None:
        netlist = generate_netlist(self.schematic)
        result = self.runner.run(netlist)
        if not result.success:
            QMessageBox.warning(
                self,
                "Simulation error",
                result.error_message or "Ngspice reported an error.",
            )
            return
        self.waveform_viewer = WaveformViewer(result, self)
        self.waveform_viewer.show()
        self.statusBar().showMessage("Simulation finished successfully.")
