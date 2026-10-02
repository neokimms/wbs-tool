"""API 동작 테스트 하네스 — 격리된 테스트 DB에서 앱을 in-process로 실행한다.

실행 (API 컨테이너 안):
    python -m unittest discover -s tests -t . -v

동작
  1. DATABASE_URL(운영/개발 DB)과 같은 서버에 테스트 전용 DB(WBS_TEST_DB, 기본 wbs_test)를
     매 실행마다 DROP → CREATE 한다. 개발 데이터는 건드리지 않는다.
  2. 환경변수를 테스트 DB로 바꾼 뒤 app.main 을 import 하고 lifespan(마이그레이션 포함)을 실행한다.
  3. httpx.ASGITransport 로 네트워크 없이 요청을 보낸다.
"""
from __future__ import annotations

import asyncio
import atexit
import os
from typing import Any
from urllib.parse import urlsplit, urlunsplit

_ENV: "TestEnv | None" = None

ADMIN_EMAIL = "admin@wbs.local"
ADMIN_PASSWORD = os.getenv("WBS_TEST_ADMIN_PASSWORD", "adminadmin")
USER_PASSWORD = "Test@Pass1234"


def _with_db(dsn: str, db: str) -> str:
    parts = urlsplit(dsn)
    return urlunsplit((parts.scheme, parts.netloc, "/" + db, parts.query, parts.fragment))


class Response:
    def __init__(self, status: int, body: Any, headers: dict[str, str]):
        self.status = status
        self.body = body
        self.headers = headers

    def __repr__(self) -> str:  # 실패 메시지 가독성
        return f"<Response {self.status} {str(self.body)[:300]}>"


class TestEnv:
    def __init__(self) -> None:
        import asyncpg  # noqa: F401  (컨테이너 의존성 확인)

        base = os.environ.get("WBS_TEST_BASE_DSN") or os.environ["DATABASE_URL"]
        self.test_db = os.environ.get("WBS_TEST_DB", "wbs_test")
        if self.test_db in {"wbs_platform", "openproject", "postgres"}:
            raise RuntimeError("테스트 DB 이름이 운영 DB와 같습니다")
        self.loop = asyncio.new_event_loop()
        self.loop.run_until_complete(self._recreate_db(_with_db(base, "postgres")))

        os.environ["DATABASE_URL"] = _with_db(base, self.test_db)
        os.environ["WBS_REPORT_SCHEDULER_ENABLED"] = "false"
        os.environ["WBS_RUN_MIGRATIONS_ON_STARTUP"] = "true"
        os.environ["WBS_LOGIN_FAILURE_LIMIT"] = "1000"
        os.environ.setdefault("OPENPROJECT_SYNC_ENABLED", "false")
        os.environ.setdefault("PM_ENGINE_ADAPTER", "mock")

        import httpx
        from app import main  # 환경변수 설정 이후 import

        self.main = main
        self.app = main.app
        self._lifespan = self.app.router.lifespan_context(self.app)
        self.loop.run_until_complete(self._lifespan.__aenter__())
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        self.tokens: dict[str, str] = {}
        self.users: dict[str, dict[str, Any]] = {}
        self.tokens["admin"] = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        atexit.register(self.close)

    async def _recreate_db(self, admin_dsn: str) -> None:
        import asyncpg

        conn = await asyncpg.connect(admin_dsn)
        try:
            await conn.execute(f'DROP DATABASE IF EXISTS "{self.test_db}" WITH (FORCE)')
            await conn.execute(f'CREATE DATABASE "{self.test_db}"')
        finally:
            await conn.close()

    def close(self) -> None:
        try:
            self.loop.run_until_complete(self.client.aclose())
            self.loop.run_until_complete(self._lifespan.__aexit__(None, None, None))
        except Exception:
            pass

    # ── HTTP ──────────────────────────────────────────────────────────
    def call(self, method: str, path: str, *, as_: str | None = "admin", json: Any = None,
             params: dict[str, Any] | None = None) -> Response:
        headers = {}
        if as_:
            headers["Authorization"] = f"Bearer {self.tokens[as_]}"
        resp = self.loop.run_until_complete(
            self.client.request(method, path, json=json, params=params, headers=headers)
        )
        ctype = resp.headers.get("content-type", "")
        body: Any = resp.json() if "application/json" in ctype else resp.content
        return Response(resp.status_code, body, dict(resp.headers))

    def get(self, path: str, **kw: Any) -> Response:
        return self.call("GET", path, **kw)

    def post(self, path: str, json: Any = None, **kw: Any) -> Response:
        return self.call("POST", path, json=json, **kw)

    def patch(self, path: str, json: Any = None, **kw: Any) -> Response:
        return self.call("PATCH", path, json=json, **kw)

    def delete(self, path: str, **kw: Any) -> Response:
        return self.call("DELETE", path, **kw)

    def login(self, email: str, password: str) -> str:
        r = self.call("POST", "/api/auth/login", as_=None, json={"email": email, "password": password})
        if r.status != 200:
            raise AssertionError(f"login failed for {email}: {r}")
        return r.body["token"]

    # ── 픽스처 헬퍼 ───────────────────────────────────────────────────
    def ensure_user(self, key: str, display_name: str, global_role: str = "viewer") -> dict[str, Any]:
        if key in self.users:
            return self.users[key]
        email = f"{key}@test.local"
        r = self.post("/api/users", {
            "email": email, "display_name": display_name, "role": global_role,
            "password": USER_PASSWORD, "must_change_password": False,
        })
        if r.status not in (200, 201):
            raise AssertionError(f"user create failed: {r}")
        user = r.body.get("user", r.body)
        self.users[key] = user
        self.tokens[key] = self.login(email, USER_PASSWORD)
        return user

    def create_project(self, name: str, **extra: Any) -> str:
        r = self.post("/api/projects", {"name": name, "template_key": "si-standard",
                                         "owner": "PMO", "start_date": "2026-09-15", **extra})
        if r.status != 201:
            raise AssertionError(f"project create failed: {r}")
        return str(r.body.get("id") or r.body["project"]["id"])

    def save_wbs(self, project_id: str, rows: list[dict[str, Any]]) -> Response:
        return self.post(f"/api/projects/{project_id}/wbs-items", {"rows": rows})


def env() -> TestEnv:
    global _ENV
    if _ENV is None:
        _ENV = TestEnv()
    return _ENV


# 진척률·SPI 검증용 표준 WBS (기준일과 무관하게 진척률이 결정되도록 구성)
SAMPLE_WBS = [
    {"code": "P", "name": "테스트 프로젝트", "item_type": "프로젝트", "weight": 100},
    {"code": "P.1", "parent_code": "P", "name": "분석", "item_type": "단계", "weight": 40,
     "start_date": "2020-01-01", "finish_date": "2020-01-31"},
    {"code": "P.1.1", "parent_code": "P.1", "name": "요구사항 정의", "item_type": "작업", "weight": 20,
     "owner": "Member User"},
    {"code": "P.1.2", "parent_code": "P.1", "name": "현행 분석", "item_type": "작업", "weight": 20},
    {"code": "P.2", "parent_code": "P", "name": "설계", "item_type": "단계", "weight": 60,
     "start_date": "2099-01-01", "finish_date": "2099-12-31"},
    {"code": "P.2.1", "parent_code": "P.2", "name": "설계서", "item_type": "산출물", "weight": 60},
    {"code": "P.2.1.1", "parent_code": "P.2.1", "name": "화면 설계", "item_type": "작업", "weight": 30},
    {"code": "P.2.1.2", "parent_code": "P.2.1", "name": "DB 설계", "item_type": "작업", "weight": 30},
    {"code": "P.2.2", "parent_code": "P.2", "name": "설계 검토 완료", "item_type": "마일스톤",
     "finish_date": "2099-12-31"},
]
