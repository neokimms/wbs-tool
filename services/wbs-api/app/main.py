"""AX WBS Platform API — 애플리케이션 조립(앱 생성·미들웨어·라우터 등록)만 담당.

엔드포인트는 app/routers/*, 공통 로직은 app/core/*·app/services/*, 규칙은 app/domain/* 에 있다.
"""
from contextlib import asynccontextmanager
import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import (
    ALLOW_FILE_ORIGIN,
    AsyncIOScheduler,
    CronTrigger,
    DATABASE_URL,
    MIGRATION_PATHS,
    MULTITENANCY_ENABLED,
    PORTAL_ORIGIN,
    REPORT_DEFAULT_TIMEZONE,
    REPORT_SCHEDULER_ENABLED,
    RUN_MIGRATIONS_ON_STARTUP,
)
from app.core.db import get_pool, init_connection
from app.core.security import (
    apply_security_headers,
    auth_token_from_request,
    fetch_user_by_token,
    get_tenant_id,
    validate_request_tenant,
)
from app.services.reports import refresh_report_scheduler
from app.routers import (
    system,
    auth,
    users,
    settings,
    reports,
    templates,
    projects,
    pm_engine,
    wbs,
    approvals,
    imports,
    agile,
    risks,
    notifications,
    notes,
    meetings,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=1,
        max_size=8,
        init=init_connection,
    )
    if RUN_MIGRATIONS_ON_STARTUP:
        async with pool.acquire() as connection:
            for mp in MIGRATION_PATHS:
                if mp.exists():
                    await connection.execute(mp.read_text(encoding="utf-8"))
    app.state.pool = pool
    app.state.report_scheduler = None
    if REPORT_SCHEDULER_ENABLED and AsyncIOScheduler and CronTrigger:
        scheduler = AsyncIOScheduler(timezone=REPORT_DEFAULT_TIMEZONE)
        app.state.report_scheduler = scheduler
        scheduler.start()
        await refresh_report_scheduler(app)
    yield
    scheduler = getattr(app.state, "report_scheduler", None)
    if scheduler:
        scheduler.shutdown(wait=False)
    await pool.close()


app = FastAPI(
    title="WBS Platform Extension API",
    version="0.1.0",
    lifespan=lifespan,
)


allowed_origins = [PORTAL_ORIGIN, "http://localhost:3010", "http://127.0.0.1:3010"]


if ALLOW_FILE_ORIGIN:
    allowed_origins.append("null")


@app.middleware("http")
async def authenticate_api_requests(request: Request, call_next):
    path = request.url.path
    public_paths = {"/api/auth/login"}
    if request.method == "OPTIONS" or not path.startswith("/api/"):
        return apply_security_headers(await call_next(request))

    is_tenant_management = path == "/api/tenants" or path.startswith("/api/tenants/")
    is_auth_context = path in {"/api/auth/me", "/api/auth/logout"}
    async with get_pool(request).acquire() as connection:
        try:
            await validate_request_tenant(
                connection,
                request,
                enforce_active=not (is_tenant_management or is_auth_context),
            )
        except HTTPException as exc:
            return apply_security_headers(JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}))

        if path in public_paths:
            return apply_security_headers(await call_next(request))

        token = auth_token_from_request(request)
        if not token:
            return apply_security_headers(JSONResponse(status_code=401, content={"detail": "Authentication required"}))

        user = await fetch_user_by_token(connection, token)

    if not user:
        return apply_security_headers(JSONResponse(status_code=401, content={"detail": "Invalid or expired session"}))
    if (
        MULTITENANCY_ENABLED
        and not (is_tenant_management or is_auth_context)
        and user.get("role") != "admin"
        and user.get("tenant_id") != get_tenant_id(request)
    ):
        return apply_security_headers(JSONResponse(status_code=403, content={"detail": "User is not assigned to this tenant"}))

    request.state.user = user
    return apply_security_headers(await call_next(request))


# CORS 는 반드시 마지막에 등록한다 (= 가장 바깥 미들웨어).
# 인증 미들웨어가 직접 돌려주는 401/403 에도 CORS 헤더가 붙어야 브라우저가 응답을 읽고
# 세션 만료를 감지(자동 로그아웃)할 수 있다. 순서가 바뀌면 만료 탭이 CORS 오류로 무한 재시도한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 라우터 등록 — 원본 main.py 의 경로 등록 순서를 보존한다 (경로 매칭 우선순위 유지)
for _router_module in (
    system,
    auth,
    users,
    settings,
    reports,
    templates,
    projects,
    pm_engine,
    wbs,
    approvals,
    imports,
    agile,
    risks,
    notifications,
    notes,
    meetings,
):
    app.include_router(_router_module.router)
