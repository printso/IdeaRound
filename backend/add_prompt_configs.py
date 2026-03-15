"""
添加提示词模板配置到数据库
运行: python add_prompt_configs.py
"""
import sqlite3

def add_prompt_configs():
    conn = sqlite3.connect('idearound.db')
    cursor = conn.cursor()

    configs = [
        {
            "config_key": "prompt_base",
            "config_value": "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话与重复。",
            "description": "基础系统提示词",
            "is_active": 1
        },
        {
            "config_key": "prompt_brief_stage",
            "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划，不要写\"综上/总结/最终方案\"。\n直接给出你认为最关键的点即可。\n用 Markdown 输出，建议使用无序列表。",
            "description": "脑暴阶段提示词",
            "is_active": 1
        },
        {
            "config_key": "prompt_final_stage",
            "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n请给出可执行的落地方案，避免空话。\n用 Markdown 输出，结构清晰。",
            "description": "收敛阶段提示词",
            "is_active": 1
        },
        {
            "config_key": "prompt_audit_brief",
            "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划。\n你是审计官：请用\"优点/缺点\"各 2-3 条进行严格评审（同样要短）。\n用 Markdown 输出，建议使用无序列表。",
            "description": "审计官脑暴阶段提示词",
            "is_active": 1
        },
        {
            "config_key": "prompt_audit_final",
            "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n你是审计官：在方案后补充\"优缺点/风险/需要补证的数据与实验\"。\n用 Markdown 输出，结构清晰。",
            "description": "审计官收敛阶段提示词",
            "is_active": 1
        },
        {
            "config_key": "prompt_converge_trigger",
            "config_value": "我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。",
            "description": "触发收敛阶段的用户消息",
            "is_active": 1
        },
    ]

    for config in configs:
        cursor.execute(
            "SELECT id FROM roundtable_configs WHERE config_key = ?",
            (config["config_key"],)
        )
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute(
                """UPDATE roundtable_configs 
                   SET config_value = ?, description = ?, is_active = ? 
                   WHERE config_key = ?""",
                (config["config_value"], config["description"], config["is_active"], config["config_key"])
            )
            print(f"✓ 已更新: {config['config_key']}")
        else:
            cursor.execute(
                """INSERT INTO roundtable_configs (config_key, config_value, description, is_active) 
                   VALUES (?, ?, ?, ?)""",
                (config["config_key"], config["config_value"], config["description"], config["is_active"])
            )
            print(f"✓ 已添加: {config['config_key']}")

    conn.commit()
    conn.close()
    print("\n提示词模板配置添加完成！")

if __name__ == "__main__":
    add_prompt_configs()
