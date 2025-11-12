import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from ..models import WorkspaceCanvas, WorkspaceProject, WorkspaceSection

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
        self.canvas = WorkspaceCanvas.objects.create(
            owner=self.user,
            project=self.project,
            title="Initial canvas",
            state_json={"order": []},
            state_size=2,
        )

    def _canvas_state(self, title="Autosave Title", *, trace_id="trace-1"):
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

    def _put_canvas_state(self, canvas, *, state, **extras):
        payload = {"state": state} | extras
        return self.client.put(
            f"/api/dashboard/canvases/{canvas.id}/state/",
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
        self.assertEqual(project["canvas_count"], 1)

    def test_create_canvas(self):
        url = f"/api/dashboard/projects/{self.project.id}/canvases/"
        resp = self.client.post(
            url,
            data=json.dumps({"title": "Analysis", "state": {"order": ["a"]}}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(WorkspaceCanvas.objects.filter(project=self.project).count(), 2)

    def test_canvas_version_detail_includes_state(self):
        url = f"/api/dashboard/canvases/{self.canvas.id}/versions/"
        create = self.client.post(
            url,
            data=json.dumps({"label": "alpha"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        version_id = create.json()["id"]
        detail = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/versions/{version_id}/")
        self.assertEqual(detail.status_code, 200)
        payload = detail.json()
        self.assertEqual(payload["label"], "alpha")
        self.assertIn("state", payload)

    def test_canvas_state_put_updates_size_and_payload(self):
        state = self._canvas_state("Autosave v1")
        resp = self._put_canvas_state(self.canvas, state=state, version_label="Alpha v1")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.canvas.refresh_from_db()
        self.assertGreater(self.canvas.state_size, 0)
        self.assertEqual(self.canvas.version_label, "Alpha v1")
        self.assertEqual(self.canvas.state_json, state)
        detail = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/state/")
        self.assertEqual(detail.status_code, 200)
        payload = detail.json()
        self.assertEqual(payload["state"], state)
        self.assertEqual(payload["state_size"], self.canvas.state_size)

    def test_snapshot_roundtrip_restores_saved_state(self):
        initial_state = self._canvas_state("Snapshot A", trace_id="trace-a")
        self._put_canvas_state(self.canvas, state=initial_state, version_label="Snapshot A")
        create = self.client.post(
            f"/api/dashboard/canvases/{self.canvas.id}/versions/",
            data=json.dumps({"label": "Snapshot A"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        version_id = create.json()["id"]

        mutated_state = self._canvas_state("Snapshot B", trace_id="trace-b")
        self._put_canvas_state(self.canvas, state=mutated_state, version_label="Snapshot B")

        version_detail = self.client.get(
            f"/api/dashboard/canvases/{self.canvas.id}/versions/{version_id}/"
        )
        self.assertEqual(version_detail.status_code, 200)
        snapshot_state = version_detail.json()["state"]
        self.assertEqual(snapshot_state["order"], initial_state["order"])

        restore = self._put_canvas_state(
            self.canvas,
            state=snapshot_state,
            version_label="Snapshot A (restored)",
        )
        self.assertEqual(restore.status_code, 200)
        self.canvas.refresh_from_db()
        self.assertEqual(self.canvas.state_json["order"], initial_state["order"])
        self.assertEqual(self.canvas.version_label, "Snapshot A (restored)")
