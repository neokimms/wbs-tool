"""Excel 보고서 작성 유틸리티.
"""
from datetime import date, datetime
from io import BytesIO
from typing import Any
import asyncpg
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Side, Border

from app.core.config import APPROVAL_SELECT, SYNC_RUN_SELECT
from app.services.wbs import fetch_rollups_for_projects


def worksheet_timestamp(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def append_report_table(worksheet, title: str, headers: list[str], rows: list[list[Any]]) -> None:
    if worksheet.max_row > 1 or worksheet.cell(row=1, column=1).value:
        worksheet.append([])
    worksheet.append([title])
    title_row = worksheet.max_row
    worksheet.cell(title_row, 1).font = Font(bold=True, size=13)
    worksheet.append(headers)
    header_row = worksheet.max_row
    header_fill = PatternFill("solid", fgColor="EAF2FF")
    thin_border = Border(bottom=Side(style="thin", color="D7DFEA"))
    for cell in worksheet[header_row]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center")
    for row in rows:
        worksheet.append([worksheet_timestamp(value) for value in row])


def autosize_worksheet(worksheet) -> None:
    for column_cells in worksheet.columns:
        length = 0
        column = column_cells[0].column_letter
        for cell in column_cells:
            length = max(length, len(str(cell.value or "")))
        worksheet.column_dimensions[column].width = min(max(length + 2, 12), 42)


async def build_weekly_report_workbook(
    pool: asyncpg.Pool,
    period_start: datetime,
    period_end: datetime,
) -> tuple[bytes, dict[str, Any]]:
    async with pool.acquire() as connection:
        project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
        template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
        pending_approvals = await connection.fetchval(
            "SELECT count(*) FROM wbs_approval_requests WHERE status = 'Pending'"
        )
        preview_imports = await connection.fetchval("SELECT count(*) FROM wbs_import_jobs WHERE status = 'Preview'")
        locked_baselines = await connection.fetchval("SELECT count(*) FROM wbs_project_baselines WHERE status = 'Locked'")
        status_rows = await connection.fetch(
            """
            SELECT status, count(*) AS count
            FROM wbs_projects
            GROUP BY status
            ORDER BY status
            """
        )
        projects = await connection.fetch(
            """
            SELECT name, owner, status, template_key, start_date,
                   openproject_project_id, created_at, updated_at
            FROM wbs_projects
            ORDER BY updated_at DESC
            LIMIT 100
            """
        )
        approvals = await connection.fetch(
            f"""
            SELECT {APPROVAL_SELECT}
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            WHERE a.created_at >= $1 OR a.updated_at >= $1
            ORDER BY a.updated_at DESC
            LIMIT 100
            """,
            period_start,
        )
        imports = await connection.fetch(
            """
            SELECT source_file, template_key, template_name, status, total_rows,
                   accepted_rows, rejected_rows, applied_at, created_at
            FROM wbs_import_jobs
            WHERE created_at >= $1 OR applied_at >= $1
            ORDER BY created_at DESC
            LIMIT 100
            """,
            period_start,
        )
        sync_runs = await connection.fetch(
            f"""
            SELECT {SYNC_RUN_SELECT}
            FROM wbs_sync_runs s
            JOIN wbs_projects p ON p.id = s.project_id
            WHERE s.started_at >= $1
            ORDER BY s.started_at DESC
            LIMIT 100
            """,
            period_start,
        )
        wbs_progress = await connection.fetch(
            """
            SELECT
                p.id AS project_id,
                p.name AS project_name,
                p.owner,
                p.status AS project_status,
                count(i.code)::integer AS total_items,
                count(i.code) FILTER (
                    WHERE COALESCE(i.metadata->>'status', '') = '완료'
                       OR CASE
                            WHEN COALESCE(i.metadata->>'progress', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                            THEN (i.metadata->>'progress')::numeric
                            ELSE 0
                          END >= 100
                )::integer AS done_items,
                count(i.code) FILTER (
                    WHERE i.finish_date < CURRENT_DATE
                      AND COALESCE(i.metadata->>'status', '') <> '완료'
                      AND CASE
                            WHEN COALESCE(i.metadata->>'progress', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                            THEN (i.metadata->>'progress')::numeric
                            ELSE 0
                          END < 100
                )::integer AS overdue_items,
                round(avg(
                    CASE
                        WHEN COALESCE(i.metadata->>'progress', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                        THEN (i.metadata->>'progress')::numeric
                        ELSE 0
                    END
                ), 1) AS avg_progress
            FROM wbs_projects p
            LEFT JOIN wbs_project_wbs_items i
              ON i.project_id = p.id AND COALESCE(i.item_type, '작업') <> '프로젝트'
            GROUP BY p.id
            ORDER BY p.updated_at DESC
            LIMIT 100
            """
        )
        weekly_rollups = await fetch_rollups_for_projects(
            connection, [row["project_id"] for row in wbs_progress], period_end.date() if isinstance(period_end, datetime) else None
        )

    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    append_report_table(
        summary,
        "WBS 주간 프로젝트 보고서",
        ["항목", "값"],
        [
            ["보고 기간", f"{period_start.date().isoformat()} ~ {period_end.date().isoformat()}"],
            ["생성 시각", period_end],
            ["프로젝트", project_count],
            ["템플릿", template_count],
            ["승인 대기", pending_approvals],
            ["Excel 미반영 Preview", preview_imports],
            ["Locked Baseline", locked_baselines],
        ],
    )
    append_report_table(
        summary,
        "프로젝트 상태 분포",
        ["상태", "건수"],
        [[row["status"], row["count"]] for row in status_rows],
    )
    autosize_worksheet(summary)

    project_sheet = wb.create_sheet("Projects")
    append_report_table(
        project_sheet,
        "프로젝트 현황",
        ["프로젝트", "담당", "상태", "템플릿", "시작일", "외부 프로젝트 ID", "생성", "수정"],
        [
            [
                row["name"],
                row["owner"],
                row["status"],
                row["template_key"],
                row["start_date"],
                row["openproject_project_id"],
                row["created_at"],
                row["updated_at"],
            ]
            for row in projects
        ],
    )
    autosize_worksheet(project_sheet)

    progress_sheet = wb.create_sheet("WBS Progress")
    append_report_table(
        progress_sheet,
        "내부 WBS 진행 현황",
        ["프로젝트", "담당", "상태", "작업 항목", "완료", "지연", "진척률(가중)", "계획 진척률", "SPI"],
        [
            [
                row["project_name"],
                row["owner"],
                row["project_status"],
                row["total_items"],
                row["done_items"],
                row["overdue_items"],
                f"{weekly_rollups.get(str(row['project_id']), {}).get('summary', {}).get('progress_pct', 0)}%",
                f"{weekly_rollups.get(str(row['project_id']), {}).get('summary', {}).get('planned_pct', 0)}%",
                weekly_rollups.get(str(row['project_id']), {}).get('summary', {}).get('spi') or "—",
            ]
            for row in wbs_progress
        ],
    )
    autosize_worksheet(progress_sheet)

    approval_sheet = wb.create_sheet("Approvals")
    append_report_table(
        approval_sheet,
        "최근 승인 이력",
        ["프로젝트", "제목", "상태", "요청자", "검토자", "생성", "결정"],
        [
            [
                row["project_name"],
                row["title"],
                row["status"],
                row["requester"],
                row["reviewer"],
                row["created_at"],
                row["decided_at"],
            ]
            for row in approvals
        ],
    )
    autosize_worksheet(approval_sheet)

    import_sheet = wb.create_sheet("Excel Imports")
    append_report_table(
        import_sheet,
        "최근 Excel 반영",
        ["파일", "템플릿", "상태", "전체", "정상", "오류", "생성", "반영"],
        [
            [
                row["source_file"],
                row["template_name"] or row["template_key"],
                row["status"],
                row["total_rows"],
                row["accepted_rows"],
                row["rejected_rows"],
                row["created_at"],
                row["applied_at"],
            ]
            for row in imports
        ],
    )
    autosize_worksheet(import_sheet)

    sync_sheet = wb.create_sheet("Baseline Runs")
    append_report_table(
        sync_sheet,
        "최근 기준선 반영 실행",
        ["프로젝트", "모드", "상태", "전체", "생성", "외부 프로젝트 ID", "시작", "완료"],
        [
            [
                row["project_name"],
                row["mode"],
                row["status"],
                row["total_rows"],
                row["created_work_packages"],
                row["openproject_project_id"],
                row["started_at"],
                row["completed_at"],
            ]
            for row in sync_runs
        ],
    )
    autosize_worksheet(sync_sheet)

    buffer = BytesIO()
    wb.save(buffer)
    metadata = {
        "project_count": project_count,
        "pending_approvals": pending_approvals,
        "preview_imports": preview_imports,
        "sync_runs": len(sync_runs),
        "wbs_progress_projects": len(wbs_progress),
        "approvals": len(approvals),
        "imports": len(imports),
        "data_source": "internal_wbs",
    }
    return buffer.getvalue(), metadata
