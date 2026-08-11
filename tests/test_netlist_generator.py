from __future__ import annotations

import unittest

from opencircuitlab.core import PinRef, Schematic
from opencircuitlab.simulation import generate_netlist


class NetlistGeneratorTests(unittest.TestCase):
    def test_resistor_divider_netlist(self) -> None:
        schematic = Schematic(title="Divider")
        source = schematic.add_component("voltage_source", value="5")
        resistor_top = schematic.add_component("resistor", value="1k")
        resistor_bottom = schematic.add_component("resistor", value="1k")
        ground = schematic.add_component("ground")

        schematic.add_wire(PinRef(source.id, "positive"), PinRef(resistor_top.id, "a"))
        schematic.add_wire(PinRef(resistor_top.id, "b"), PinRef(resistor_bottom.id, "a"))
        schematic.add_wire(PinRef(resistor_bottom.id, "b"), PinRef(ground.id, "gnd"))
        schematic.add_wire(PinRef(source.id, "negative"), PinRef(ground.id, "gnd"))

        netlist = generate_netlist(schematic)
        self.assertIn("V1 N1 0 DC 5", netlist)
        self.assertIn("R1 N1 N2 1k", netlist)
        self.assertIn("R2 N2 0 1k", netlist)
        self.assertTrue(netlist.strip().endswith(".end"))

    def test_rc_transient_netlist(self) -> None:
        schematic = Schematic(title="RC")
        schematic.analysis.step = "1ms"
        schematic.analysis.stop = "100ms"
        source = schematic.add_component("voltage_source", value="5")
        resistor = schematic.add_component("resistor", value="1k")
        capacitor = schematic.add_component("capacitor", value="10u")
        ground = schematic.add_component("ground")

        schematic.add_wire(PinRef(source.id, "positive"), PinRef(resistor.id, "a"))
        schematic.add_wire(PinRef(resistor.id, "b"), PinRef(capacitor.id, "a"))
        schematic.add_wire(PinRef(capacitor.id, "b"), PinRef(ground.id, "gnd"))
        schematic.add_wire(PinRef(source.id, "negative"), PinRef(ground.id, "gnd"))

        netlist = generate_netlist(schematic)
        self.assertIn("V1 N1 0 DC 5", netlist)
        self.assertIn("R1 N1 N2 1k", netlist)
        self.assertIn("C1 N2 0 10u", netlist)
        self.assertIn(".tran 1ms 100ms", netlist)


if __name__ == "__main__":
    unittest.main()
