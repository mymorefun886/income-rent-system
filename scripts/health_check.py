#!/usr/bin/env python3
"""健康检查脚本：读取 db.json 并输出租户与合同统计。"""

import json
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "storage", "db.json")


def main():
    if not os.path.exists(DB_PATH):
        print(f"错误: 数据文件不存在: {DB_PATH}")
        print("请先启动后端服务以生成 db.json")
        sys.exit(1)

    try:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"错误: JSON 格式无效: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: 读取文件失败: {e}")
        sys.exit(1)

    print("JSON 格式验证: 通过")

    tenants = data.get("tenants", [])
    contracts = data.get("contracts", [])

    print(f"租户总数: {len(tenants)}")
    print()

    if not tenants:
        print("暂无租户数据")
        return

    # 按 tenantId 分组合同
    contract_map = {}
    for c in contracts:
        tid = c.get("tenantId", "")
        contract_map.setdefault(tid, []).append(c)

    print(f"{'租户名称':<12} {'状态':<8} {'合同数':<8}")
    print("-" * 30)
    for t in tenants:
        tid = t.get("id", "")
        name = t.get("name", "未知")
        status = t.get("status", "未知")
        count = len(contract_map.get(tid, []))
        print(f"{name:<12} {status:<8} {count:<8}")


if __name__ == "__main__":
    main()
