import tempfile
import unittest
from pathlib import Path

from pipeline import run_pipeline
from reader import Order, read_orders
from rules import net_cents

SOURCE = Path(__file__).resolve().parent.parent / "data" / "orders.csv"


class PipelineTests(unittest.TestCase):
    def test_default_report_preserves_lineage(self):
        report = run_pipeline(SOURCE)
        self.assertEqual(report["total_net_cents"], 4190)
        self.assertEqual(report["included_orders"], 4)
        self.assertEqual(report["regions"][0]["order_ids"], ["o1", "o3"])
        self.assertEqual(report["regions"][1]["net_cents"], 2940)

    def test_filter_change_removes_north(self):
        report = run_pipeline(SOURCE, minimum_cents=1000)
        self.assertEqual(report["total_net_cents"], 2940)
        self.assertEqual([region["region"] for region in report["regions"]], ["south"])

    def test_discount_rounds_half_up(self):
        order = Order("x", "north", 1, 101, 50, "completed")
        self.assertEqual(net_cents(order), 51)

    def test_empty_input_produces_zero(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "empty.csv"
            source.write_text(SOURCE.read_text().splitlines()[0] + "\n", encoding="utf-8")
            report = run_pipeline(source)
        self.assertEqual(report["total_net_cents"], 0)
        self.assertEqual(report["regions"], [])

    def test_duplicate_ids_fail_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "duplicate.csv"
            rows = SOURCE.read_text().splitlines()
            source.write_text("\n".join([rows[0], rows[1], rows[1]]), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate order_id"):
                read_orders(source)


if __name__ == "__main__":
    unittest.main()
