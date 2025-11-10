import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from ..models import WorkspaceBoard, WorkspaceProject, WorkspaceSection

User = get_user_model()


class DashboardApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dash", password="secret")
        self.client.force_login(self.user)
        self.section = WorkspaceSection.objects.create(owner=self.user, name="Reports")
        self.project = WorkspaceProject.objects.create(
            owner=self.user,
            section=self.section,
            title="Week 42",
            summary="Daily summary",
        )
        self.board = WorkspaceBoard.objects.create(
            owner=self.user,
            project=self.project,
            title="Initial board",
            state_json={"order": []},
            state_size=2,
        )

    def _board_state(self, title="Autosave Title", *, trace_id="trace-1"):
        return {
            "version": 2,
            "global": {"sessionTitle": title},
            "order": [trace_id],
            "traces": {
                trace_id: {
                    "id": trace_id,
                    "meta": {"label": title},
                    "data": {"x": [1, 2, 3], "y": [4, 5, 6]},
                    "source": {"x": [1, 2, 3], "y": [4, 5, 6]},
                }
            },
            "folders": {
                "root": {
                    "id": "root",
                    "name": "Root",
                    "parent": None,
                    "folders": [],
                    "traces": [trace_id],
                    "collapsed": False,
                }
            },
            "folderOrder": ["root"],
            "ui": {"activeFolder": "root"},
        }

    def _put_board_state(self, board, *, state, **extras):
        payload = {"state": state} | extras
        return self.client.put(
            f"/api/dashboard/boards/{board.id}/state/",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_sections_require_auth(self):
        self.client.logout()
        resp = self.client.get("/api/dashboard/sections/")
        self.assertEqual(resp.status_code, 401)

    def test_list_sections_with_projects(self):
        resp = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload["items"]), 1)
        section = payload["items"][0]
        self.assertEqual(section["name"], "Reports")
        self.assertEqual(len(section.get("projects", [])), 1)
        project = section["projects"][0]
        self.assertEqual(project["title"], "Week 42")
        self.assertEqual(project["board_count"], 1)

    def test_create_board(self):
        url = f"/api/dashboard/projects/{self.project.id}/boards/"
        resp = self.client.post(
            url,
            data=json.dumps({"title": "Analysis", "state": {"order": ["a"]}}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(WorkspaceBoard.objects.filter(project=self.project).count(), 2)

    def test_board_version_detail_includes_state(self):
        url = f"/api/dashboard/boards/{self.board.id}/versions/"
        create = self.client.post(
            url,
            data=json.dumps({"label": "alpha"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        version_id = create.json()["id"]
        detail = self.client.get(f"/api/dashboard/boards/{self.board.id}/versions/{version_id}/")
        self.assertEqual(detail.status_code, 200)
        payload = detail.json()
        self.assertEqual(payload["label"], "alpha")
        self.assertIn("state", payload)

    def test_board_state_put_updates_size_and_payload(self):
        state = self._board_state("Autosave v1")
        resp = self._put_board_state(self.board, state=state, version_label="Alpha v1")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.board.refresh_from_db()
        self.assertGreater(self.board.state_size, 0)
        self.assertEqual(self.board.version_label, "Alpha v1")
        self.assertEqual(self.board.state_json, state)
        detail = self.client.get(f"/api/dashboard/boards/{self.board.id}/state/")
        self.assertEqual(detail.status_code, 200)
        payload = detail.json()
        self.assertEqual(payload["state"], state)
        self.assertEqual(payload["state_size"], self.board.state_size)

    def test_snapshot_roundtrip_restores_saved_state(self):
        initial_state = self._board_state("Snapshot A", trace_id="trace-a")
        self._put_board_state(self.board, state=initial_state, version_label="Snapshot A")
        create = self.client.post(
            f"/api/dashboard/boards/{self.board.id}/versions/",
            data=json.dumps({"label": "Snapshot A"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        version_id = create.json()["id"]

        mutated_state = self._board_state("Snapshot B", trace_id="trace-b")
        self._put_board_state(self.board, state=mutated_state, version_label="Snapshot B")

        version_detail = self.client.get(
            f"/api/dashboard/boards/{self.board.id}/versions/{version_id}/"
        )
        self.assertEqual(version_detail.status_code, 200)
        snapshot_state = version_detail.json()["state"]
        self.assertEqual(snapshot_state["order"], initial_state["order"])

        restore = self._put_board_state(
            self.board,
            state=snapshot_state,
            version_label="Snapshot A (restored)",
        )
        self.assertEqual(restore.status_code, 200)
        self.board.refresh_from_db()
        self.assertEqual(self.board.state_json["order"], initial_state["order"])
        self.assertEqual(self.board.version_label, "Snapshot A (restored)")

