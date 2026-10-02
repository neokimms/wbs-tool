"""wbs_rules 순수 함수 단위 테스트 (DB·FastAPI 불필요)."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app", "domain"))
from wbs_rules import compute_wbs_rollup, planned_progress, validate_hierarchy  # noqa: E402

ROWS = [
    {"code": "P", "item_type": "프로젝트", "weight": 100},
    {"code": "P.1", "parent_code": "P", "item_type": "단계", "weight": 40,
     "start_date": "2026-09-01", "finish_date": "2026-09-30"},
    {"code": "P.1.1", "parent_code": "P.1", "item_type": "작업", "weight": 20, "metadata": {"progress": 100}},
    {"code": "P.1.2", "parent_code": "P.1", "item_type": "작업", "weight": 20, "metadata": {"progress": 50}},
    {"code": "P.2", "parent_code": "P", "item_type": "단계", "weight": 60,
     "start_date": "2026-10-01", "finish_date": "2026-10-31"},
    {"code": "P.2.1", "parent_code": "P.2", "item_type": "산출물"},
    {"code": "P.2.1.1", "parent_code": "P.2.1", "item_type": "작업", "metadata": {"status": "완료"}},
    {"code": "P.2.1.2", "parent_code": "P.2.1", "item_type": "작업", "metadata": {"progress": 0}},
    {"code": "P.2.2", "parent_code": "P.2", "item_type": "마일스톤"},
    {"code": "R", "parent_code": "P", "item_type": "리스크"},
]


class RollupTests(unittest.TestCase):
    def setUp(self):
        self.r = compute_wbs_rollup(ROWS, date(2026, 10, 2))

    def test_project_progress_is_weighted_leaf_rollup(self):
        self.assertEqual(self.r["summary"]["progress_pct"], 60.0)
        self.assertEqual(self.r["nodes"]["P.1"]["progress"], 75.0)
        self.assertEqual(self.r["nodes"]["P.2"]["progress"], 50.0)

    def test_parent_without_weights_shares_equally(self):
        self.assertEqual(self.r["nodes"]["P.2.1"]["effective_weight"], 60.0)
        self.assertEqual(self.r["nodes"]["P.2.1.1"]["effective_weight"], 30.0)

    def test_milestone_has_zero_weight_and_point_plan(self):
        ms = self.r["nodes"]["P.2.2"]
        self.assertEqual(ms["effective_weight"], 0.0)
        self.assertEqual(ms["planned_progress"], 0.0)

    def test_done_status_counts_as_100(self):
        self.assertEqual(self.r["nodes"]["P.2.1.1"]["progress"], 100.0)

    def test_risk_items_excluded(self):
        self.assertNotIn("R", self.r["nodes"])
        self.assertEqual(self.r["summary"]["leaf_count"], 5)

    def test_spi_is_ev_over_pv(self):
        s = self.r["summary"]
        self.assertAlmostEqual(s["spi"], round(s["earned_value"] / s["planned_value"], 3), places=3)
        self.assertEqual(self.r["nodes"]["P.1"]["spi"], 0.75)

    def test_empty_and_unweighted(self):
        self.assertIsNone(compute_wbs_rollup([])["summary"]["spi"])
        r = compute_wbs_rollup([
            {"code": "A", "item_type": "단계"},
            {"code": "A.1", "parent_code": "A", "item_type": "작업", "metadata": {"progress": 40}},
            {"code": "A.2", "parent_code": "A", "item_type": "작업"},
        ])
        self.assertEqual(r["summary"]["progress_pct"], 20.0)
        self.assertIsNone(r["summary"]["spi"])


class PlannedProgressTests(unittest.TestCase):
    def test_linear_window(self):
        self.assertEqual(planned_progress(date(2026, 1, 1), date(2026, 1, 10), date(2025, 12, 31)), 0.0)
        self.assertEqual(planned_progress(date(2026, 1, 1), date(2026, 1, 10), date(2026, 1, 5)), 50.0)
        self.assertEqual(planned_progress(date(2026, 1, 1), date(2026, 1, 10), date(2026, 1, 10)), 100.0)
        self.assertIsNone(planned_progress(None, None, date(2026, 1, 1)))


class HierarchyTests(unittest.TestCase):
    def test_valid_rows_pass(self):
        errors, _ = validate_hierarchy(ROWS)
        self.assertEqual(errors, [])

    def test_child_under_milestone_rejected(self):
        errors, _ = validate_hierarchy(ROWS + [{"code": "X", "parent_code": "P.2.2", "item_type": "작업"}])
        self.assertTrue(any("마일스톤" in e["message"] for e in errors))

    def test_invalid_root_type_rejected(self):
        errors, _ = validate_hierarchy([{"code": "Y", "item_type": "산출물"}])
        self.assertTrue(any("최상위" in e["message"] for e in errors))

    def test_depth_limit(self):
        rows = [{"code": "L1", "item_type": "단계"}]
        for i in range(2, 8):
            rows.append({"code": f"L{i}", "parent_code": f"L{i-1}", "item_type": "작업" if i > 2 else "작업"})
        errors, _ = validate_hierarchy(rows)
        self.assertTrue(any("깊이" in e["message"] for e in errors))

    def test_unknown_type_rejected(self):
        errors, _ = validate_hierarchy([{"code": "Z", "item_type": "에픽"}])
        self.assertTrue(any("허용되지 않은" in e["message"] for e in errors))


if __name__ == "__main__":
    unittest.main()
