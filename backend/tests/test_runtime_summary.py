import unittest
from unittest.mock import AsyncMock, patch

from backend.app.api.v1.endpoints.runtime import (
    _build_extractive_summary,
    _generate_message_summary_with_settings,
    _score_summary_consistency,
)


SOURCE_TEXT = (
    "结论：建议优先上线高意向线索评分能力，预计转化率提升18%，客服人效提升12%。"
    "行动项：2周内完成A/B实验和埋点校验，并在下周三前输出回滚预案。"
    "说明：现有方案描述过长、修辞偏多，需要压缩为核心要点。"
)


class RuntimeSummaryTests(unittest.IsolatedAsyncioTestCase):
    def test_extractive_summary_keeps_critical_facts(self):
        summary = _build_extractive_summary(SOURCE_TEXT)

        self.assertLessEqual(len(summary), 120)
        self.assertIn("18%", summary)
        self.assertTrue("建议" in summary or "行动项" in summary or "完成" in summary)

    def test_consistency_score_penalizes_missing_numbers_and_actions(self):
        good_summary = _build_extractive_summary(SOURCE_TEXT)
        weak_summary = "建议尽快优化方案并持续推进，提升整体体验。"

        self.assertGreaterEqual(_score_summary_consistency(SOURCE_TEXT, good_summary), 95.0)
        self.assertLess(_score_summary_consistency(SOURCE_TEXT, weak_summary), 95.0)

    async def test_summary_guardrail_falls_back_when_llm_summary_is_incomplete(self):
        with patch(
            "backend.app.api.v1.endpoints.runtime._call_llm_text_with_settings",
            new=AsyncMock(return_value="建议尽快推进优化，提高整体体验。"),
        ):
            result = await _generate_message_summary_with_settings({}, SOURCE_TEXT)

        summary = result["summary"]
        metrics = result["summary_metrics"]

        self.assertLessEqual(len(summary), 120)
        self.assertIn("18%", summary)
        self.assertGreaterEqual(metrics["semantic_consistency"], 95.0)
        self.assertEqual(metrics["source"], "extractive_guardrail")


if __name__ == "__main__":
    unittest.main()
