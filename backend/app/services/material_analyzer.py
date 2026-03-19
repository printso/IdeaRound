from typing import Optional, Dict, Any, List
import json

try:
    from backend.app.services.document_parser import get_document_parser, ImageParser
    from backend.app.services.file_validator import MaterialFormat, MaterialType
except ImportError:
    from app.services.document_parser import get_document_parser, ImageParser
    from app.services.file_validator import MaterialFormat, MaterialType


class MaterialAnalysisResult:
    def __init__(
        self,
        material_id: str,
        success: bool,
        extracted_content: Optional[str] = None,
        key_info: Optional[Dict[str, Any]] = None,
        intent_indicators: Optional[List[str]] = None,
        summary: Optional[str] = None,
        error_message: Optional[str] = None
    ):
        self.material_id = material_id
        self.success = success
        self.extracted_content = extracted_content
        self.key_info = key_info
        self.intent_indicators = intent_indicators
        self.summary = summary
        self.error_message = error_message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "material_id": self.material_id,
            "success": self.success,
            "extracted_content": self.extracted_content,
            "key_info": self.key_info,
            "intent_indicators": self.intent_indicators,
            "summary": self.summary,
            "error_message": self.error_message
        }


class MaterialAnalyzer:
    def __init__(self):
        self.intent_keywords = {
            "goal": ["目标", "目的", "希望", "想要", "需要", "实现", "达成", "完成", "goal", "objective", "target"],
            "requirement": ["需求", "要求", "必须", "应该", "需要", "规定", "requirement", "need", "must"],
            "constraint": ["限制", "约束", "不能", "禁止", "不得超过", "预算", "时间", "constraint", "limit", "restrict"],
            "problem": ["问题", "困难", "挑战", "痛点", "风险", "担忧", "issue", "problem", "challenge", "pain"],
            "solution": ["方案", "解决方案", "策略", "方法", "建议", "计划", "solution", "strategy", "method", "plan"],
            "evaluation": ["评估", "评价", "效果", "指标", "KPI", "成功", "evaluation", "assess", "measure"],
            "stakeholder": ["用户", "客户", "团队", "领导", "部门", "公司", "user", "customer", "team", "stakeholder"]
        }

    def analyze_document(
        self,
        material_id: str,
        content: bytes,
        file_format: MaterialFormat
    ) -> MaterialAnalysisResult:
        try:
            parser = get_document_parser(file_format.value)
            parse_result = parser.parse(content)

            if "error" in parse_result:
                return MaterialAnalysisResult(
                    material_id=material_id,
                    success=False,
                    error_message=parse_result["error"]
                )

            extracted_text = parse_result.get("text", "")
            key_info = parser.extract_key_info(extracted_text)
            intent_indicators = self._extract_intent_indicators(extracted_text)
            summary = key_info.get("summary", "")

            return MaterialAnalysisResult(
                material_id=material_id,
                success=True,
                extracted_content=extracted_text,
                key_info=key_info,
                intent_indicators=intent_indicators,
                summary=summary
            )
        except Exception as e:
            return MaterialAnalysisResult(
                material_id=material_id,
                success=False,
                error_message=f"Analysis failed: {str(e)}"
            )

    def analyze_image(
        self,
        material_id: str,
        content: bytes,
        filename: str = ""
    ) -> MaterialAnalysisResult:
        try:
            image_parser = ImageParser()
            parse_result = image_parser.parse(content, filename)

            if "error" in parse_result:
                return MaterialAnalysisResult(
                    material_id=material_id,
                    success=False,
                    error_message=parse_result["error"]
                )

            extracted_text = parse_result.get("text", "")
            key_info = image_parser.extract_key_info(extracted_text)
            intent_indicators = self._extract_intent_indicators(extracted_text)
            summary = key_info.get("summary", "")

            return MaterialAnalysisResult(
                material_id=material_id,
                success=True,
                extracted_content=extracted_text,
                key_info=key_info,
                intent_indicators=intent_indicators,
                summary=summary
            )
        except Exception as e:
            return MaterialAnalysisResult(
                material_id=material_id,
                success=False,
                error_message=f"Image analysis failed: {str(e)}"
            )

    def _extract_intent_indicators(self, text: str) -> List[str]:
        if not text:
            return []

        text_lower = text.lower()
        found_indicators = []

        for category, keywords in self.intent_keywords.items():
            for keyword in keywords:
                if keyword.lower() in text_lower:
                    if category not in found_indicators:
                        found_indicators.append(category)
                    break

        return found_indicators

    def batch_analyze(
        self,
        materials: List[Dict[str, Any]]
    ) -> List[MaterialAnalysisResult]:
        results = []
        for material in materials:
            material_id = material.get("material_id", "unknown")
            content = material.get("content", b"")
            material_type = material.get("type")
            filename = material.get("filename", "")

            if material_type == MaterialType.IMAGE.value:
                result = self.analyze_image(material_id, content, filename)
            else:
                file_format = material.get("format", MaterialFormat.TXT)
                if isinstance(file_format, str):
                    try:
                        file_format = MaterialFormat(file_format.lower().replace(".", ""))
                    except ValueError:
                        file_format = MaterialFormat.TXT
                result = self.analyze_document(material_id, content, file_format)

            results.append(result)

        return results


class IntentSynthesisEngine:
    def __init__(self):
        self.analyzer = MaterialAnalyzer()

    def synthesize_intent(
        self,
        room_id: str,
        material_results: List[MaterialAnalysisResult],
        context_text: Optional[str] = None
    ) -> Dict[str, Any]:
        all_content_parts = []
        all_keywords = []
        all_intent_indicators = []
        all_summaries = []

        for result in material_results:
            if result.success:
                if result.extracted_content:
                    all_content_parts.append(result.extracted_content)
                if result.key_info and result.key_info.get("keywords"):
                    all_keywords.extend(result.key_info.get("keywords", []))
                if result.intent_indicators:
                    all_intent_indicators.extend(result.intent_indicators)
                if result.summary:
                    all_summaries.append(result.summary)

        if context_text:
            all_content_parts.insert(0, context_text)

        full_content = "\n\n".join(all_content_parts)

        keyword_freq = {}
        for kw in all_keywords:
            kw_lower = kw.lower()
            keyword_freq[kw_lower] = keyword_freq.get(kw_lower, 0) + 1
        top_keywords = sorted(keyword_freq.items(), key=lambda x: x[1], reverse=True)[:15]
        top_keywords = [kw for kw, _ in top_keywords]

        intent_counter = {}
        for indicator in all_intent_indicators:
            intent_counter[indicator] = intent_counter.get(indicator, 0) + 1
        sorted_intents = sorted(intent_counter.items(), key=lambda x: x[1], reverse=True)
        core_intents = [intent for intent, _ in sorted_intents[:5]]

        synthesized = self._synthesize_core_intent(
            full_content,
            top_keywords,
            core_intents,
            all_summaries
        )

        recommendations = self._generate_recommendations(core_intents, top_keywords)

        return {
            "room_id": room_id,
            "synthesized_intent": synthesized,
            "material_summaries": [
                {"material_id": r.material_id, "summary": r.summary, "intent_indicators": r.intent_indicators}
                for r in material_results if r.success
            ],
            "core_intent_indicators": core_intents,
            "key_topics": top_keywords,
            "recommendations": recommendations,
            "content_length": len(full_content)
        }

    def _synthesize_core_intent(
        self,
        content: str,
        keywords: List[str],
        intents: List[str],
        summaries: List[str]
    ) -> Dict[str, Any]:
        goal_text = ""
        requirement_text = ""
        constraint_text = ""
        problem_text = ""

        for intent_type, keyword_list in [
            ("goal", ["目标", "目的", "希望", "想要", "实现", "达成", "完成"]),
            ("requirement", ["需求", "要求", "必须", "应该", "需要"]),
            ("constraint", ["限制", "约束", "不能", "预算", "时间", "不得超过"]),
            ("problem", ["问题", "困难", "挑战", "痛点", "风险", "担忧"])
        ]:
            found_sentences = []
            for keyword in keyword_list:
                if keyword in content:
                    idx = content.find(keyword)
                    start = max(0, idx - 50)
                    end = min(len(content), idx + 100)
                    sentence = content[start:end].strip()
                    if sentence:
                        found_sentences.append(sentence)

            if intent_type == "goal":
                goal_text = " ".join(found_sentences[:3])
            elif intent_type == "requirement":
                requirement_text = " ".join(found_sentences[:3])
            elif intent_type == "constraint":
                constraint_text = " ".join(found_sentences[:3])
            elif intent_type == "problem":
                problem_text = " ".join(found_sentences[:3])

        combined_summary = " ".join(summaries[:3]) if summaries else content[:500]

        return {
            "core_goal": goal_text[:200] if goal_text else combined_summary[:200],
            "requirements": requirement_text[:200] if requirement_text else "",
            "constraints": constraint_text[:200] if constraint_text else "",
            "pain_points": problem_text[:200] if problem_text else "",
            "key_topics": keywords[:10],
            "intent_types": intents,
            "combined_summary": combined_summary[:500]
        }

    def _generate_recommendations(
        self,
        core_intents: List[str],
        keywords: List[str]
    ) -> List[str]:
        recommendations = []

        if "goal" in core_intents or "solution" in core_intents:
            recommendations.append("建议采用方案规划类角色配置，重点关注目标分解与路径设计")

        if "problem" in core_intents or "constraint" in core_intents:
            recommendations.append("建议增加风险分析与合规评审角色配置，关注潜在障碍")

        if "evaluation" in core_intents:
            recommendations.append("建议配置效果评估专家角色，建立可量化的成功指标")

        if "stakeholder" in core_intents:
            recommendations.append("建议考虑多方利益相关者视角，配置代表不同立场的角色")

        if len(keywords) > 10:
            recommendations.append("材料内容丰富，建议进行专题分组分析以深化讨论")

        if not recommendations:
            recommendations.append("建议根据具体业务场景选择合适的角色矩阵进行圆桌讨论")

        return recommendations


material_analyzer = MaterialAnalyzer()
intent_synthesis_engine = IntentSynthesisEngine()
