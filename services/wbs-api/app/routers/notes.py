"""노트/보고서 API 라우터.
"""
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import _NOTE_ROLES
from app.core.db import get_pool
from app.core.security import require_admin_role, require_roles

router = APIRouter()


@router.get("/api/notes/folders")
async def list_note_folders(request: Request):
    require_roles(request, _NOTE_ROLES)
    async with get_pool(request).acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, parent_id, name, sort_order, created_at, updated_at
               FROM note_folders
               WHERE tenant_id = $1
               ORDER BY sort_order, name""",
            _get_tenant(request),
        )
    return [dict(r) for r in rows]


@router.post("/api/notes/folders", status_code=201)
async def create_note_folder(request: Request):
    require_roles(request, _NOTE_ROLES)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    parent_id = body.get("parent_id") or None
    sort_order = int(body.get("sort_order") or 0)
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO note_folders (tenant_id, parent_id, name, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id, parent_id, name, sort_order, created_at""",
            _get_tenant(request), parent_id, name, sort_order,
        )
    return dict(row)


@router.patch("/api/notes/folders/{folder_id}")
async def update_note_folder(folder_id: str, request: Request):
    require_roles(request, _NOTE_ROLES)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE note_folders SET name=$1, updated_at=now()
               WHERE id=$2 AND tenant_id=$3 RETURNING id, name, updated_at""",
            name, folder_id, _get_tenant(request),
        )
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")
    return dict(row)


@router.delete("/api/notes/folders/{folder_id}", status_code=204)
async def delete_note_folder(folder_id: str, request: Request):
    require_roles(request, _NOTE_ROLES)
    async with get_pool(request).acquire() as conn:
        await conn.execute(
            "DELETE FROM note_folders WHERE id=$1 AND tenant_id=$2",
            folder_id, _get_tenant(request),
        )


@router.get("/api/notes")
async def list_notes(request: Request, folder_id: str = None, q: str = None):
    require_roles(request, _NOTE_ROLES)
    conditions = ["tenant_id = $1", "deleted_at IS NULL"]
    params: list = [_get_tenant(request)]
    if folder_id:
        params.append(folder_id)
        conditions.append(f"folder_id = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        conditions.append(f"title ILIKE ${len(params)}")
    where = " AND ".join(conditions)
    async with get_pool(request).acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id, folder_id, title, template_key, report_date,
                       created_at, updated_at
                FROM notes WHERE {where}
                ORDER BY updated_at DESC LIMIT 200""",
            *params,
        )
    return [dict(r) for r in rows]


@router.post("/api/notes", status_code=201)
async def create_note(request: Request):
    require_roles(request, _NOTE_ROLES)
    body = await request.json()
    title = (body.get("title") or "제목 없음").strip()
    content = body.get("content") or ""
    folder_id = body.get("folder_id") or None
    template_key = body.get("template_key") or None
    report_date = body.get("report_date") or None
    user_id = getattr(request.state, "user_id", None)
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO notes
               (tenant_id, folder_id, title, content, template_key, report_date, created_by, updated_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
               RETURNING id, folder_id, title, content, template_key, report_date, created_at, updated_at""",
            _get_tenant(request), folder_id, title, content, template_key, report_date, user_id,
        )
        await insert_audit_event(
            conn, request=request,
            event_type="note.created", entity_type="note", entity_id=str(row["id"]),
            summary=f"노트 생성: {title}",
        )
    return dict(row)


@router.get("/api/notes/deleted")
async def list_deleted_notes(request: Request):
    """삭제된 노트 목록 조회 (admin 전용)."""
    require_admin_role(request)
    async with get_pool(request).acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, folder_id, title, created_at, updated_at,
                      deleted_at, deleted_by
               FROM notes
               WHERE tenant_id=$1 AND deleted_at IS NOT NULL
               ORDER BY deleted_at DESC LIMIT 200""",
            _get_tenant(request),
        )
    return [dict(r) for r in rows]


@router.get("/api/notes/{note_id}")
async def get_note(note_id: str, request: Request):
    require_roles(request, _NOTE_ROLES)
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id, folder_id, title, content, template_key, report_date,
                      created_at, updated_at, deleted_at
               FROM notes WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL""",
            note_id, _get_tenant(request),
        )
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return dict(row)


@router.patch("/api/notes/{note_id}")
async def update_note(note_id: str, request: Request):
    require_roles(request, _NOTE_ROLES)
    body = await request.json()
    sets = []
    params: list = []

    if "title" in body:
        params.append((body["title"] or "").strip() or "제목 없음")
        sets.append(f"title=${len(params)}")
    if "content" in body:
        params.append(body["content"] or "")
        sets.append(f"content=${len(params)}")
    if "folder_id" in body:
        params.append(body["folder_id"] or None)
        sets.append(f"folder_id=${len(params)}")
    if "report_date" in body:
        params.append(body["report_date"] or None)
        sets.append(f"report_date=${len(params)}")

    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    user_id = getattr(request.state, "user_id", None)
    params.append(user_id)
    sets.append(f"updated_by=${len(params)}")
    sets.append("updated_at=now()")

    params.extend([note_id, _get_tenant(request)])
    sql = f"""UPDATE notes SET {', '.join(sets)}
              WHERE id=${len(params)-1} AND tenant_id=${len(params)} AND deleted_at IS NULL
              RETURNING id, folder_id, title, updated_at"""
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(sql, *params)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return dict(row)


@router.delete("/api/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, request: Request):
    """소프트 딜리트 — DB 레코드는 보존되고 deleted_at 만 기록됩니다."""
    require_roles(request, _NOTE_ROLES)
    user_id = getattr(request.state, "user_id", None)
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE notes
               SET deleted_at=now(), deleted_by=$1
               WHERE id=$2 AND tenant_id=$3 AND deleted_at IS NULL
               RETURNING id, title""",
            user_id, note_id, _get_tenant(request),
        )
        if row:
            await insert_audit_event(
                conn, request=request,
                event_type="note.deleted", entity_type="note", entity_id=str(row["id"]),
                summary=f"노트 삭제(숨김): {row['title']}",
            )


@router.post("/api/notes/{note_id}/restore", status_code=200)
async def restore_note(note_id: str, request: Request):
    """삭제된 노트 복구 (admin 전용)."""
    require_admin_role(request)
    async with get_pool(request).acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE notes
               SET deleted_at=NULL, deleted_by=NULL, updated_at=now()
               WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NOT NULL
               RETURNING id, title""",
            note_id, _get_tenant(request),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Note not found or not deleted")
        await insert_audit_event(
            conn, request=request,
            event_type="note.restored", entity_type="note", entity_id=str(row["id"]),
            summary=f"노트 복구: {row['title']}",
        )
    return {"id": str(row["id"]), "title": row["title"], "restored": True}




def _get_tenant(request: Request) -> str:
    return getattr(request.state, "tenant_id", None) or "default"
