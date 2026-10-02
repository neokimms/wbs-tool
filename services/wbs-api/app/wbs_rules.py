"""WBS 공통 규칙 — 진척률 롤업·SPI 산식, 계층 깊이·유형 규칙.

모든 화면(대시보드, 프로젝트 상세, 히트맵, 주간보고, 번다운)은 이 모듈의
`compute_wbs_rollup()` 결과만 사용한다. 산식을 바꿀 때는 이 파일만 수정한다.

진척률 규칙
  1. 진척률은 최하위(leaf) 작업에만 입력한다. 상위 항목은 자동 계산된다.
  2. leaf 진척률 = metadata.progress (0~100). 상태가 '완료'이면 100으로 본다.
  3. 상위 항목 진척률 = Σ(leaf 유효가중치 × leaf 진척률) ÷ Σ(leaf 유효가중치)
  4. 유효가중치: 항목에 가중치가 있으면 그 값, 형제 모두 가중치가 없으면
     부모 유효가중치를 형제 수로 균등 분배, 일부만 있으면 없는 항목은 0.
  5. 리스크·이슈·변경요청 유형은 진척 계산에서 제외한다.
  6. 마일스톤은 명시 가중치가 없으면 가중치 0(시점 이벤트), 계획진척은 종료일 기준 0/100.

SPI 규칙 (계획 일정 대비 실적, EVM 방식)
  - leaf 계획진척률(PV%) = 기준일이 계획 시작~종료 사이에서 경과한 비율(선형).
    시작 전 0, 종료일 이후 100. leaf에 일정이 없으면 가장 가까운 상위 항목 일정 사용.
    일정 정보가 전혀 없으면 PV 계산에서 제외한다.
  - EV = Σ(w × 실적%), PV = Σ(w × 계획%)  (일정 있는 leaf 대상)
  - SPI = EV ÷ PV. PV가 0(아직 계획상 시작 전)이면 SPI는 None.
"""
from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Iterable

NON_PROGRESS_TYPES = {"리스크", "이슈", "변경요청"}
DONE_STATUS = "완료"
MILESTONE_TYPE = "마일스톤"

# ── 계층 규칙 ─────────────────────────────────────────────────────────────
WBS_MAX_DEPTH = int(os.getenv("WBS_MAX_DEPTH", "5"))
WBS_HIERARCHY_MODE = os.getenv("WBS_HIERARCHY_MODE", "strict").lower()  # strict | warn | off

WBS_ITEM_TYPES = ["프로그램", "프로젝트", "단계", "산출물", "작업", "마일스톤", "리스크", "이슈", "변경요청"]
WBS_ROOT_TYPES = {"프로그램", "프로젝트", "단계", "작업", "마일스톤"}
_LEAF_ONLY = set()
WBS_CHILD_RULES: dict[str, set[str]] = {
    "프로그램": {"프로젝트", "단계"},
    "프로젝트": {"단계", "마일스톤", "리스크", "이슈", "변경요청"},
    "단계": {"단계", "산출물", "작업", "마일스톤", "리스크", "이슈", "변경요청"},
    "산출물": {"작업", "마일스톤"},
    "작업": {"작업", "마일스톤"},
    "마일스톤": _LEAF_ONLY,
    "리스크": _LEAF_ONLY,
    "이슈": _LEAF_ONLY,
    "변경요청": _LEAF_ONLY,
}


def hierarchy_rules_payload() -> dict[str, Any]:
    return {
        "mode": WBS_HIERARCHY_MODE,
        "max_depth": WBS_MAX_DEPTH,
        "item_types": WBS_ITEM_TYPES,
        "root_types": sorted(WBS_ROOT_TYPES, key=WBS_ITEM_TYPES.index),
        "child_rules": {k: sorted(v, key=WBS_ITEM_TYPES.index) for k, v in WBS_CHILD_RULES.items()},
        "progress_rule": "leaf 입력 · 상위 가중 롤업",
        "spi_rule": "EV ÷ PV (계획 일정 선형 기준)",
    }


def validate_hierarchy(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """계층 깊이·부모-자식 유형 규칙 검증. (errors, warnings) 반환."""
    if WBS_HIERARCHY_MODE == "off":
        return [], []
    issues: list[dict[str, Any]] = []
    by_code = {r.get("code"): r for r in rows if r.get("code")}

    def depth_of(code: str) -> int:
        d, seen, cur = 1, {code}, by_code.get(code)
        while cur and cur.get("parent_code") and cur["parent_code"] in by_code:
            parent = cur["parent_code"]
            if parent in seen:  # 순환은 기존 검증에서 처리
                break
            seen.add(parent)
            d += 1
            cur = by_code[parent]
        return d

    for idx, row in enumerate(rows, start=1):
        code = row.get("code")
        if not code:
            continue
        row_no = row.get("row_number", idx)
        item_type = (row.get("item_type") or "작업").strip()
        if item_type not in WBS_CHILD_RULES:
            issues.append({"row": row_no, "field": "item_type",
                           "message": f"허용되지 않은 항목 유형 '{item_type}' (허용: {', '.join(WBS_ITEM_TYPES)})"})
            continue
        depth = depth_of(code)
        if depth > WBS_MAX_DEPTH:
            issues.append({"row": row_no, "field": "parent_code",
                           "message": f"WBS 계층 깊이 {depth}단계 — 최대 {WBS_MAX_DEPTH}단계까지 허용"})
        parent = by_code.get(row.get("parent_code")) if row.get("parent_code") else None
        if parent is None:
            if item_type not in WBS_ROOT_TYPES:
                issues.append({"row": row_no, "field": "item_type",
                               "message": f"'{item_type}' 유형은 최상위에 둘 수 없습니다"})
        else:
            p_type = (parent.get("item_type") or "작업").strip()
            allowed = WBS_CHILD_RULES.get(p_type)
            if allowed is not None and item_type not in allowed:
                hint = ", ".join(sorted(allowed, key=WBS_ITEM_TYPES.index)) or "하위 항목 불가"
                issues.append({"row": row_no, "field": "item_type",
                               "message": f"'{p_type}' 아래에 '{item_type}'을(를) 둘 수 없습니다 (허용: {hint})"})
    if WBS_HIERARCHY_MODE == "warn":
        return [], issues
    return issues, []


# ── 진척률 롤업 ────────────────────────────────────────────────────────────

def _num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _meta(row: dict[str, Any]) -> dict[str, Any]:
    meta = row.get("metadata")
    return meta if isinstance(meta, dict) else {}


def leaf_actual_progress(row: dict[str, Any]) -> float:
    meta = _meta(row)
    status = str(meta.get("status") or row.get("status") or "").strip()
    if status == DONE_STATUS:
        return 100.0
    value = _num(meta.get("progress", row.get("progress")))
    return max(0.0, min(100.0, value or 0.0))


def planned_progress(start: date | None, finish: date | None, as_of: date) -> float | None:
    if not start and not finish:
        return None
    if finish and not start:
        return 100.0 if as_of >= finish else 0.0
    if start and not finish:
        return 0.0 if as_of < start else None
    if as_of < start:
        return 0.0
    if as_of >= finish:
        return 100.0
    span = (finish - start).days + 1
    return round(((as_of - start).days + 1) / span * 100.0, 2)


def compute_wbs_rollup(rows: Iterable[dict[str, Any]], as_of: date | None = None) -> dict[str, Any]:
    """WBS 행 목록 → {"nodes": {code: {...}}, "summary": {...}}"""
    as_of = as_of or date.today()
    items = [r for r in rows if r.get("code") and (r.get("item_type") or "작업") not in NON_PROGRESS_TYPES]
    by_code = {r["code"]: r for r in items}
    children: dict[str | None, list[str]] = {}
    for r in sorted(items, key=lambda x: (x.get("sort_order") or 0, x["code"])):
        parent = r.get("parent_code") if r.get("parent_code") in by_code else None
        children.setdefault(parent, []).append(r["code"])

    def raw_weight(r: dict[str, Any]) -> float | None:
        w = _num(_meta(r).get("weight"))
        if w is None:
            w = _num(r.get("weight"))
        return w if w and w > 0 else None

    eff_weight: dict[str, float] = {}

    def assign(parent: str | None, parent_weight: float) -> None:
        kids = children.get(parent, [])
        if not kids:
            return
        weights = [raw_weight(by_code[k]) for k in kids]
        is_ms = [(by_code[k].get("item_type") or "") == MILESTONE_TYPE for k in kids]
        # 마일스톤은 명시 가중치가 없으면 0 (시점 이벤트 — 진척 분배 대상 아님)
        sharable = [i for i, w in enumerate(weights) if w is None and not is_ms[i]]
        if all(w is None for w in weights) and sharable:
            share = parent_weight / len(sharable)
            weights = [share if i in sharable else 0.0 for i in range(len(kids))]
        else:
            weights = [w or 0.0 for w in weights]
        for k, w in zip(kids, weights):
            eff_weight[k] = w
            assign(k, w)

    assign(None, 100.0)

    nodes: dict[str, dict[str, Any]] = {}

    def walk(code: str, inherited: tuple[date | None, date | None]) -> tuple[float, float, float, float, int, int, int]:
        """returns (w_total, w_earned, pv_w, ev_w_for_pv, leaves, done, delayed)"""
        r = by_code[code]
        start = _date(r.get("start_date")) or inherited[0]
        finish = _date(r.get("finish_date")) or inherited[1]
        kids = children.get(code, [])
        if not kids:
            w = eff_weight.get(code, 0.0)
            actual = leaf_actual_progress(r)
            if (r.get("item_type") or "") == MILESTONE_TYPE:
                # 마일스톤: 자기 종료일(없으면 상위 종료일) 시점에 계획 100%
                plan = planned_progress(None, finish, as_of) if finish else None
            else:
                plan = planned_progress(start, finish, as_of)
            delayed = 1 if (finish and finish < as_of and actual < 100) else 0
            nodes[code] = {
                "is_leaf": True, "progress": round(actual, 1),
                "planned_progress": plan, "effective_weight": round(w, 4),
                "progress_source": "manual",
            }
            pv = w * plan / 100.0 if plan is not None else 0.0
            ev_pv = w * actual / 100.0 if plan is not None else 0.0
            return (w, w * actual / 100.0, pv, ev_pv, 1, 1 if actual >= 100 else 0, delayed)
        acc = [0.0, 0.0, 0.0, 0.0, 0, 0, 0]
        for k in kids:
            res = walk(k, (start, finish))
            for i, v in enumerate(res):
                acc[i] += v
        w_total, w_earned, pv, ev_pv, leaves, done, delayed = acc
        if w_total > 0:
            prog = w_earned / w_total * 100.0
        else:  # 가중치가 모두 0인 경우 단순 평균으로 대체
            leaf_vals = [nodes[c]["progress"] for c in _leaf_codes(code)]
            prog = sum(leaf_vals) / len(leaf_vals) if leaf_vals else 0.0
        nodes[code] = {
            "is_leaf": False, "progress": round(prog, 1),
            "planned_progress": round(pv / w_total * 100.0, 1) if w_total and pv else (0.0 if w_total else None),
            "effective_weight": round(eff_weight.get(code, 0.0), 4),
            "progress_source": "rollup", "leaf_count": int(leaves),
            "spi": round(ev_pv / pv, 3) if pv > 0 else None,
        }
        return (w_total, w_earned, pv, ev_pv, leaves, done, delayed)

    def _leaf_codes(code: str) -> list[str]:
        out, stack = [], [code]
        while stack:
            c = stack.pop()
            ks = children.get(c, [])
            if ks:
                stack.extend(ks)
            elif c != code:
                out.append(c)
        return out

    total = [0.0, 0.0, 0.0, 0.0, 0, 0, 0]
    for root in children.get(None, []):
        res = walk(root, (None, None))
        for i, v in enumerate(res):
            total[i] += v
    w_total, w_earned, pv, ev_pv, leaves, done, delayed = total
    if w_total > 0:
        progress_pct = round(w_earned / w_total * 100.0, 1)
    else:
        leaf_vals = [n["progress"] for n in nodes.values() if n["is_leaf"]]
        progress_pct = round(sum(leaf_vals) / len(leaf_vals), 1) if leaf_vals else 0.0
    summary = {
        "as_of": as_of.isoformat(),
        "progress_pct": progress_pct,
        "planned_pct": round(pv / w_total * 100.0, 1) if w_total and pv else 0.0,
        "spi": round(ev_pv / pv, 3) if pv > 0 else None,
        "earned_value": round(ev_pv, 3),
        "planned_value": round(pv, 3),
        "total_weight": round(w_total, 2),
        "earned_weight": round(w_earned, 2),
        "leaf_count": int(leaves),
        "done_leaf_count": int(done),
        "delayed_leaf_count": int(delayed),
        "item_count": len(items),
        "formula": "progress=Σ(w·p)/Σw over leaves; SPI=EV/PV",
    }
    return {"nodes": nodes, "summary": summary}


def apply_rollup_to_items(items: list[dict[str, Any]], rollup: dict[str, Any]) -> list[dict[str, Any]]:
    """직렬화된 work-item 목록에 롤업 결과를 덮어쓴다(상위 항목 progress = 자동 계산값)."""
    nodes = rollup["nodes"]
    for item in items:
        node = nodes.get(item.get("code"))
        if not node:
            item.setdefault("is_leaf", True)
            continue
        item["is_leaf"] = node["is_leaf"]
        item["progress_source"] = node["progress_source"]
        item["planned_progress"] = node["planned_progress"]
        item["effective_weight"] = node["effective_weight"]
        if not node["is_leaf"]:
            item["progress"] = round(node["progress"])
            item["progress_exact"] = node["progress"]
            item["spi"] = node.get("spi")
    return items
