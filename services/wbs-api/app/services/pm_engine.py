"""OpenProject(PM 엔진) 어댑터·사전 점검.
"""
from datetime import date
import re
from typing import Any
import httpx
from fastapi import HTTPException

from app.core.config import (
    OPENPROJECT_API_TOKEN,
    OPENPROJECT_AUTH_MODE,
    OPENPROJECT_BASE_URL,
    OPENPROJECT_DEFAULT_TYPE_ID,
    OPENPROJECT_HOST_HEADER,
    OPENPROJECT_SYNC_ENABLED,
    OPENPROJECT_SYNC_PARENT_LINKS,
    OPENPROJECT_TYPE_MAP_JSON,
    PM_ENGINE_ADAPTER,
)
from app.core.db import normalize_metadata, parse_json_object


def normalize_openproject_identifier(value: str, fallback: str) -> str:
    identifier = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
    identifier = re.sub(r"-{2,}", "-", identifier).strip("-")
    return (identifier or fallback)[:100]


class OpenProjectClient:
    def __init__(
        self,
        base_url: str,
        api_token: str,
        auth_mode: str = "bearer",
        host_header: str = OPENPROJECT_HOST_HEADER,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.auth_mode = auth_mode
        self.host_header = host_header

    def request_options(self) -> dict[str, Any]:
        headers = {"Accept": "application/hal+json", "Content-Type": "application/json"}
        if self.host_header:
            headers["Host"] = self.host_header
        options: dict[str, Any] = {"headers": headers}
        if self.api_token:
            if self.auth_mode == "basic":
                options["auth"] = ("apikey", self.api_token)
            else:
                headers["Authorization"] = f"Bearer {self.api_token}"
        return options

    async def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=payload,
                    **self.request_options(),
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "OpenProject API is unreachable",
                    "base_url": self.base_url,
                    "error": str(exc),
                },
            ) from exc

        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "OpenProject API request failed",
                    "status_code": response.status_code,
                    "response": self.response_detail(response),
                },
            )
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="OpenProject API returned invalid JSON") from exc

    @staticmethod
    def response_detail(response: httpx.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            return response.text[:1000]

    async def probe(
        self,
        *,
        name: str,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        accepted_error_statuses: set[int] | None = None,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": name,
            "method": method,
            "path": path,
            "base_url": self.base_url,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=payload,
                    **self.request_options(),
                )
        except httpx.RequestError as exc:
            return {
                **result,
                "ok": False,
                "status": "fail",
                "message": "OpenProject endpoint is unreachable",
                "error": str(exc),
            }

        result["status_code"] = response.status_code
        accepted_error_statuses = accepted_error_statuses or set()
        if 200 <= response.status_code < 400 or response.status_code in accepted_error_statuses:
            result.update({"ok": True, "status": "pass"})
            if response.content:
                detail = self.response_detail(response)
                if isinstance(detail, dict):
                    result["resource_type"] = detail.get("_type")
                    if detail.get("id"):
                        result["resource_id"] = detail["id"]
                    if detail.get("name"):
                        result["resource_name"] = detail["name"]
                    if response.status_code >= 400:
                        result["message"] = detail.get("message", "Endpoint is reachable")
                        result["response"] = detail
            return result

        return {
            **result,
            "ok": False,
            "status": "fail",
            "message": "OpenProject endpoint returned an error",
            "response": self.response_detail(response),
        }

    async def create_project(self, project: dict[str, Any], identifier: str) -> dict[str, Any]:
        return await self.request(
            "POST",
            "/api/v3/projects",
            {
                "_type": "Project",
                "name": project["name"],
                "identifier": identifier,
                "active": True,
            },
        )

    def build_version_payload(
        self,
        *,
        openproject_project_id: str,
        sprint: dict[str, Any],
    ) -> dict[str, Any]:
        status = "closed" if str(sprint.get("status") or "").lower() == "closed" else "open"
        payload: dict[str, Any] = {
            "_type": "Version",
            "name": str(sprint.get("name") or "Sprint")[:255],
            "description": {
                "format": "plain",
                "raw": str(sprint.get("goal") or ""),
            },
            "status": status,
            "sharing": "none",
            "_links": {
                "definingProject": {"href": f"/api/v3/projects/{openproject_project_id}"},
            },
        }
        if sprint.get("start_date"):
            payload["startDate"] = sprint["start_date"]
        if sprint.get("end_date"):
            payload["endDate"] = sprint["end_date"]
        return payload

    async def create_version_from_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", "/api/v3/versions", payload)

    def build_work_package_payload(
        self,
        *,
        openproject_project_id: str,
        row: dict[str, Any],
        parent_href: str | None = None,
    ) -> dict[str, Any]:
        type_map = parse_json_object(OPENPROJECT_TYPE_MAP_JSON)
        type_id = type_map.get(row.get("item_type") or "") or OPENPROJECT_DEFAULT_TYPE_ID
        links: dict[str, Any] = {
            "project": {"href": f"/api/v3/projects/{openproject_project_id}"},
        }
        if type_id:
            links["type"] = {"href": f"/api/v3/types/{type_id}"}
        if parent_href and OPENPROJECT_SYNC_PARENT_LINKS:
            links["parent"] = {"href": parent_href}

        metadata = normalize_metadata(row.get("metadata"))
        description_lines = [
            f"WBS code: {row['code']}",
            f"Type: {row.get('item_type') or '작업'}",
        ]
        if row.get("owner"):
            description_lines.append(f"Owner: {row['owner']}")
        if row.get("weight") is not None:
            description_lines.append(f"Weight: {row['weight']}")
        if metadata.get("deliverable_type"):
            description_lines.append(f"Deliverable: {metadata['deliverable_type']}")

        payload: dict[str, Any] = {
            "_type": "WorkPackage",
            "subject": f"{row['code']} {row['name']}"[:255],
            "description": {
                "format": "markdown",
                "raw": "\n".join(description_lines),
            },
            "_links": links,
        }
        if row.get("start_date"):
            payload["startDate"] = row["start_date"]
        if row.get("finish_date"):
            payload["dueDate"] = row["finish_date"]

        return payload

    async def validate_work_package_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.request("POST", "/api/v3/work_packages/form", payload)
        embedded = normalize_metadata(response.get("_embedded"))
        validation_errors = normalize_metadata(embedded.get("validationErrors"))
        if validation_errors:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "OpenProject rejected the work package payload during form validation",
                    "validation_errors": validation_errors,
                },
            )
        return response

    async def create_work_package_from_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", "/api/v3/work_packages?notify=false", payload)

    async def update_work_package_dates(
        self,
        *,
        work_package_id: str,
        start_date: date | None,
        finish_date: date | None,
    ) -> dict[str, Any]:
        current = await self.request("GET", f"/api/v3/work_packages/{work_package_id}")
        lock_version = current.get("lockVersion")
        if lock_version is None:
            raise HTTPException(
                status_code=502,
                detail="OpenProject work package lockVersion is missing",
            )
        return await self.request(
            "PATCH",
            f"/api/v3/work_packages/{work_package_id}",
            {
                "lockVersion": lock_version,
                "startDate": start_date.isoformat() if start_date else None,
                "dueDate": finish_date.isoformat() if finish_date else None,
            },
        )

    async def create_work_package(
        self,
        *,
        openproject_project_id: str,
        row: dict[str, Any],
        parent_href: str | None = None,
    ) -> dict[str, Any]:
        payload = self.build_work_package_payload(
            openproject_project_id=openproject_project_id,
            row=row,
            parent_href=parent_href,
        )
        return await self.create_work_package_from_payload(payload)


def openproject_engine_status() -> dict[str, Any]:
    return {
        "adapter": "openproject",
        "base_url": OPENPROJECT_BASE_URL,
        "host_header_configured": bool(OPENPROJECT_HOST_HEADER),
        "enabled": OPENPROJECT_SYNC_ENABLED,
        "token_configured": bool(OPENPROJECT_API_TOKEN),
        "auth_mode": OPENPROJECT_AUTH_MODE,
        "default_type_configured": bool(OPENPROJECT_DEFAULT_TYPE_ID),
        "type_map_configured": bool(parse_json_object(OPENPROJECT_TYPE_MAP_JSON)),
        "parent_links": OPENPROJECT_SYNC_PARENT_LINKS,
    }


def pm_engine_status(setting_value: dict[str, Any] | None = None) -> dict[str, Any]:
    setting_value = setting_value or {}
    runtime = openproject_engine_status()
    adapter = PM_ENGINE_ADAPTER or setting_value.get("adapter") or runtime["adapter"]
    portal_enabled = bool(setting_value.get("portal_enabled", setting_value.get("enabled", True)))
    if adapter in {"disabled", "none", "internal"}:
        portal_enabled = False
    display_name = (
        "내부 WBS Only"
        if not portal_enabled
        else "Mock PM Engine"
        if adapter == "mock"
        else setting_value.get("display_name") or "OpenProject"
    )
    runtime_enabled = portal_enabled and (runtime["enabled"] or adapter == "mock")
    actual_sync_ready = portal_enabled and (adapter == "mock" or (runtime["enabled"] and bool(OPENPROJECT_API_TOKEN)))
    return {
        **runtime,
        "adapter": adapter,
        "display_name": display_name,
        "provider": runtime["adapter"],
        "mode": setting_value.get("mode") or ("internal-wbs" if not portal_enabled else "ce-api-adapter"),
        "dependency_boundary": setting_value.get("dependency_boundary") or "pm-engine-api",
        "actual_sync_control": setting_value.get("actual_sync_control") or "OPENPROJECT_SYNC_ENABLED",
        "portal_enabled": portal_enabled,
        "enabled": runtime_enabled,
        "capabilities": {
            "preflight": True,
            "dry_run": True,
            "actual_sync": actual_sync_ready,
            "work_package_payload_validation": True,
            "hierarchy_parent_links": portal_enabled and runtime["parent_links"],
            "mock_adapter": portal_enabled and adapter == "mock",
        },
        "runtime": runtime,
    }


def openproject_preflight_check(name: str, status: str, message: str, **extra: Any) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "ok": status == "pass",
        "message": message,
        **extra,
    }


async def run_openproject_preflight() -> dict[str, Any]:
    if PM_ENGINE_ADAPTER == "mock":
        return {
            "engine": pm_engine_status({"adapter": "mock", "display_name": "Mock PM Engine"}),
            "state": "ready",
            "ready_for_actual_sync": True,
            "checks": [
                openproject_preflight_check(
                    "pm_engine_adapter",
                    "pass",
                    "Mock PM engine adapter is ready for local product validation",
                ),
                openproject_preflight_check(
                    "external_api",
                    "skip",
                    "OpenProject API calls are skipped by the mock adapter",
                ),
            ],
        }

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    checks: list[dict[str, Any]] = []

    api_root_check = await client.probe(
        name="api_root",
        method="GET",
        path="/api/v3",
        accepted_error_statuses={401, 403},
    )
    checks.append(api_root_check)
    checks.append(
        openproject_preflight_check(
            "sync_enabled",
            "pass" if OPENPROJECT_SYNC_ENABLED else "warn",
            "Actual OpenProject sync is enabled"
            if OPENPROJECT_SYNC_ENABLED
            else "Actual OpenProject sync is disabled; dry-run and planning endpoints remain available",
        )
    )
    checks.append(
        openproject_preflight_check(
            "api_token",
            "pass" if OPENPROJECT_API_TOKEN else "warn",
            "OPENPROJECT_API_TOKEN is configured"
            if OPENPROJECT_API_TOKEN
            else "OPENPROJECT_API_TOKEN is not configured; actual sync will be blocked",
        )
    )

    if OPENPROJECT_API_TOKEN:
        checks.append(await client.probe(name="authenticated_user", method="GET", path="/api/v3/users/me"))
    else:
        checks.append(
            openproject_preflight_check(
                "authenticated_user",
                "skip",
                "Skipped because OPENPROJECT_API_TOKEN is not configured",
            )
        )

    failed = any(check.get("status") == "fail" for check in checks)
    api_root_failed = any(check.get("name") == "api_root" and check.get("status") == "fail" for check in checks)
    auth_failed = any(
        check.get("name") == "authenticated_user" and check.get("status") == "fail" for check in checks
    )
    ready = (
        not failed
        and OPENPROJECT_SYNC_ENABLED
        and bool(OPENPROJECT_API_TOKEN)
        and any(check.get("name") == "authenticated_user" and check.get("ok") for check in checks)
    )
    if api_root_failed:
        state = "offline"
    elif auth_failed:
        state = "auth_failed"
    elif failed:
        state = "blocked"
    elif ready:
        state = "ready"
    else:
        state = "dry_run_only"

    return {
        "engine": pm_engine_status(),
        "state": state,
        "ready_for_actual_sync": ready,
        "checks": checks,
    }
