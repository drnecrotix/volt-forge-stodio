"""Waveform viewer window for transient analysis results."""

from __future__ import annotations

import csv
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from opencircuitlab.simulation.result import SimulationResult

try:
    import pyqtgraph as pg
except ImportError:  # pragma: no cover - depends on optional dependency
    pg = None


class WaveformViewer(QMainWindow):
    def __init__(self, result: SimulationResult, parent=None) -> None:
        super().__init__(parent)
        self.result = result
        self.setWindowTitle("Waveform Viewer")
        self.resize(1024, 640)

        central = QWidget(self)
        self.setCentralWidget(central)
        layout = QHBoxLayout(central)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(16)

        sidebar = QWidget()
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(12)

        sidebar_layout.addWidget(QLabel("Signals"))
        self.signal_list = QListWidget()
        sidebar_layout.addWidget(self.signal_list, stretch=1)

        export_button = QPushButton("Export CSV")
        export_button.clicked.connect(self.export_csv)
        sidebar_layout.addWidget(export_button)

        self.cursor_label = QLabel("Cursor: --")
        self.cursor_label.setWordWrap(True)
        sidebar_layout.addWidget(self.cursor_label)

        layout.addWidget(sidebar, 0)

        if pg is None:
            self.plot_widget = None
            self.placeholder = QLabel(
                "PyQtGraph is not installed.\nInstall it to see interactive waveforms.\n\n"
                "CSV export is still available."
            )
            self.placeholder.setAlignment(Qt.AlignCenter)
            layout.addWidget(self.placeholder, 1)
        else:
            self.plot_widget = pg.PlotWidget(background="#09111f")
            self.plot_widget.showGrid(x=True, y=True, alpha=0.18)
            self.plot_widget.addLegend()
            self.plot_widget.setLabel("bottom", self.result.scale_name)
            self.plot_widget.setMouseEnabled(x=True, y=True)
            layout.addWidget(self.plot_widget, 1)
            self._vertical_cursor = pg.InfiniteLine(angle=90, movable=False, pen=pg.mkPen("#f8fafc", width=1))
            self._horizontal_cursor = pg.InfiniteLine(angle=0, movable=False, pen=pg.mkPen("#f8fafc", width=1))
            self.plot_widget.addItem(self._vertical_cursor, ignoreBounds=True)
            self.plot_widget.addItem(self._horizontal_cursor, ignoreBounds=True)
            self.plot_widget.scene().sigMouseMoved.connect(self._handle_mouse_move)

        self._populate_signal_list()
        self.refresh_plot()

    def _populate_signal_list(self) -> None:
        for signal_name in self.result.signals:
            item = QListWidgetItem(signal_name)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked if self.signal_list.count() < 3 else Qt.Unchecked)
            self.signal_list.addItem(item)
        self.signal_list.itemChanged.connect(lambda _item: self.refresh_plot())

    def _selected_signals(self) -> list[str]:
        selected: list[str] = []
        for index in range(self.signal_list.count()):
            item = self.signal_list.item(index)
            if item.checkState() == Qt.Checked:
                selected.append(item.text())
        return selected

    def refresh_plot(self) -> None:
        if self.plot_widget is None or pg is None:
            return

        self.plot_widget.clear()
        self.plot_widget.addLegend()
        self.plot_widget.addItem(self._vertical_cursor, ignoreBounds=True)
        self.plot_widget.addItem(self._horizontal_cursor, ignoreBounds=True)

        colors = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#fb7185", "#f8fafc"]
        for index, signal_name in enumerate(self._selected_signals()):
            pen = pg.mkPen(colors[index % len(colors)], width=2)
            self.plot_widget.plot(
                self.result.scale_values,
                self.result.trace_values(signal_name),
                pen=pen,
                name=signal_name,
            )

    def _handle_mouse_move(self, scene_position) -> None:  # pragma: no cover - GUI callback
        if self.plot_widget is None or pg is None:
            return
        view_box = self.plot_widget.plotItem.vb
        point = view_box.mapSceneToView(scene_position)
        x_value = point.x()
        y_value = point.y()
        self._vertical_cursor.setPos(x_value)
        self._horizontal_cursor.setPos(y_value)
        self.cursor_label.setText(f"Cursor: {self.result.scale_name}={x_value:.6g}, value={y_value:.6g}")

    def export_csv(self) -> None:
        selected_signals = self._selected_signals() or self.result.signals
        target_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export waveform data",
            str(Path.home() / "waveforms.csv"),
            "CSV Files (*.csv)",
        )
        if not target_path:
            return

        with Path(target_path).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            header = [self.result.scale_name, *selected_signals]
            writer.writerow(header)
            for row_index, scale_value in enumerate(self.result.scale_values):
                row = [scale_value]
                for signal_name in selected_signals:
                    row.append(self.result.traces[signal_name].values[row_index])
                writer.writerow(row)

        QMessageBox.information(self, "Export complete", f"Waveform data exported to:\n{target_path}")
