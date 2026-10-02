"""프로젝트 역할(RBAC)·회의·Action Item·리스크/이슈 동작 테스트."""
import unittest

from tests.harness import SAMPLE_WBS, env


def setUpModule():
    e = env()
    e.ensure_user("pm1", "PM User", "viewer")
    e.ensure_user("member1", "Member User", "viewer")
    e.ensure_user("viewer2", "Viewer Two", "viewer")
    e.ensure_user("reviewer1", "Reviewer User", "viewer")


class RoleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        e = env()
        cls.pid = e.create_project("[TEST] 역할")
        assert e.save_wbs(cls.pid, SAMPLE_WBS).status == 200
        for key, role in (("pm1", "pm"), ("member1", "member"), ("viewer2", "viewer"), ("reviewer1", "reviewer")):
            r = e.post(f"/api/projects/{cls.pid}/members", {"user_id": e.users[key]["id"], "project_role": role})
            assert r.status == 201, r

    def test_project_roles_endpoint(self):
        keys = [r["key"] for r in env().get("/api/project-roles").body["roles"]]
        self.assertEqual(keys, ["admin", "pm", "pmo", "member", "reviewer", "viewer"])

    def test_invalid_role_rejected(self):
        r = env().post(f"/api/projects/{self.pid}/members",
                       {"user_id": env().users["pm1"]["id"], "project_role": "owner"})
        self.assertEqual(r.status, 400)

    def test_list_shows_my_project_role(self):
        mine = [p for p in env().get("/api/projects", as_="member1").body if str(p["id"]) == self.pid]
        self.assertEqual(mine[0]["project_role"], "member")

    def test_pm_can_edit_wbs_member_cannot(self):
        e = env()
        self.assertEqual(e.save_wbs(self.pid, SAMPLE_WBS).status, 200)  # admin
        r = e.post(f"/api/projects/{self.pid}/wbs-items", {"rows": SAMPLE_WBS}, as_="pm1")
        self.assertEqual(r.status, 200, r)
        r = e.post(f"/api/projects/{self.pid}/wbs-items", {"rows": SAMPLE_WBS}, as_="member1")
        self.assertEqual(r.status, 403)

    def test_member_updates_own_task_only(self):
        e = env()
        self.assertEqual(e.patch(f"/api/projects/{self.pid}/work-items/P.1.1", {"progress": 30}, as_="member1").status, 200)
        self.assertEqual(e.patch(f"/api/projects/{self.pid}/work-items/P.1.2", {"progress": 30}, as_="member1").status, 403)

    def test_pm_manages_members_but_not_admin_role(self):
        e = env()
        out = e.ensure_user("extra1", "Extra User", "viewer")
        r = e.post(f"/api/projects/{self.pid}/members", {"user_id": out["id"], "project_role": "admin"}, as_="pm1")
        self.assertEqual(r.status, 403)
        r = e.post(f"/api/projects/{self.pid}/members", {"user_id": out["id"], "project_role": "member"}, as_="pm1")
        self.assertEqual(r.status, 201, r)
        self.assertEqual(e.get(f"/api/projects/{self.pid}/members/candidates", as_="member1").status, 403)

    def test_member_can_raise_issue_viewer_cannot(self):
        e = env()
        self.assertEqual(e.post(f"/api/projects/{self.pid}/issues", {"title": "팀원 이슈"}, as_="member1").status, 201)
        self.assertEqual(e.post(f"/api/projects/{self.pid}/issues", {"title": "열람자 이슈"}, as_="viewer2").status, 403)
        self.assertEqual(e.post(f"/api/projects/{self.pid}/risks", {"title": "팀원 리스크"}, as_="member1").status, 201)


class MeetingActionItemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        e = env()
        cls.pid = e.create_project("[TEST] 회의")
        assert e.save_wbs(cls.pid, SAMPLE_WBS).status == 200
        for key, role in (("member1", "member"), ("viewer2", "viewer")):
            e.post(f"/api/projects/{cls.pid}/members", {"user_id": e.users[key]["id"], "project_role": role})
        cls.issue_id = e.post(f"/api/projects/{cls.pid}/issues", {"title": "연결 이슈"}).body["id"]
        r = e.post(f"/api/projects/{cls.pid}/meetings", {
            "title": "주간 점검", "meeting_type": "정기", "meeting_date": "2026-10-02",
            "attendees": ["PM User", "Member User"],
            "action_items": [
                {"title": "보고서 보완", "assignee": "Member User", "due_date": "2020-01-01", "wbs_code": "P.1.2"},
                {"title": "영향도 정리", "assignee": "외부 인원", "due_date": "2099-01-01", "issue_id": cls.issue_id},
            ],
        })
        assert r.status == 201, r
        cls.meeting = r.body

    def test_meeting_created_with_action_items(self):
        self.assertEqual(self.meeting["action_count"], 2)
        ai = {a["title"]: a for a in self.meeting["action_items"]}
        self.assertTrue(ai["보고서 보완"]["is_overdue"])
        self.assertEqual(ai["보고서 보완"]["display_status"], "지연")
        self.assertIsNotNone(ai["보고서 보완"]["assignee_user_id"])
        self.assertEqual(ai["영향도 정리"]["issue_title"], "연결 이슈")

    def test_invalid_links_rejected(self):
        r = env().post(f"/api/projects/{self.pid}/action-items", {"title": "x", "wbs_code": "NOPE"})
        self.assertEqual(r.status, 400)

    def test_viewer_cannot_create_meeting(self):
        r = env().post(f"/api/projects/{self.pid}/meetings", {"title": "열람자 회의"}, as_="viewer2")
        self.assertEqual(r.status, 403)

    def test_member_can_create_meeting(self):
        r = env().post(f"/api/projects/{self.pid}/meetings", {"title": "팀원 회의"}, as_="member1")
        self.assertEqual(r.status, 201, r)

    def test_my_action_items_and_assignee_permissions(self):
        e = env()
        mine = [a for a in e.get("/api/me/action-items", as_="member1").body if a["project_id"] == self.pid]
        self.assertEqual([a["title"] for a in mine], ["보고서 보완"])
        aid = mine[0]["id"]
        r = e.patch(f"/api/action-items/{aid}", {"status": "진행중", "comment": "진행 중"}, as_="member1")
        self.assertEqual(r.status, 200, r)
        self.assertEqual(len(r.body["metadata"]["comments"]), 1)
        r = e.patch(f"/api/action-items/{aid}", {"title": "제목 변경"}, as_="member1")
        self.assertEqual(r.status, 403)
        self.assertEqual(e.delete(f"/api/action-items/{aid}", as_="member1").status, 403)

    def test_work_items_show_open_action_count(self):
        items = {i["code"]: i for i in env().get(f"/api/projects/{self.pid}/work-items").body}
        self.assertEqual(items["P.1.2"]["action_open_count"], 1)

    def test_overdue_alert_scan(self):
        r = env().post("/api/action-items/alerts/scan")
        self.assertEqual(r.status, 200)
        self.assertGreaterEqual(r.body["scanned"], 1)
        notes = env().get("/api/notifications", as_="member1").body
        self.assertTrue(any(n["event_type"] == "action_item.delayed" for n in notes))

    def test_meeting_update_and_soft_delete(self):
        e = env()
        mid = e.post(f"/api/projects/{self.pid}/meetings", {"title": "삭제용"}).body["id"]
        self.assertEqual(e.patch(f"/api/meetings/{mid}", {"status": "Final"}).body["status"], "Final")
        self.assertEqual(e.delete(f"/api/meetings/{mid}", as_="member1").status, 403)
        self.assertEqual(e.delete(f"/api/meetings/{mid}").status, 200)
        self.assertEqual(e.get(f"/api/meetings/{mid}").status, 404)


if __name__ == "__main__":
    unittest.main()
