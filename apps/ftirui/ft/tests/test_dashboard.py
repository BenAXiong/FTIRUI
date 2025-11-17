import json

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from ..management.commands.seed_dashboard_demo import (
    PROJECT_NAME as DEMO_PROJECT_NAME,
    SECTION_NAME as DEMO_SECTION_NAME,
    SAMPLE_CANVASES as DEMO_SAMPLE_CANVASES,
)
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
            tags=["FT-IR", "NMR"],
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
        self.assertTrue(project["canvases"])
        canvas_payload = project["canvases"][0]
        self.assertIn("tags", canvas_payload)
        self.assertEqual(canvas_payload["tags"], self.canvas.tags)

    def test_create_canvas(self):
        url = f"/api/dashboard/projects/{self.project.id}/canvases/"
        resp = self.client.post(
            url,
            data=json.dumps({"title": "Analysis", "state": {"order": ["a"]}}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(WorkspaceCanvas.objects.filter(project=self.project).count(), 2)
        data = resp.json()
        self.assertIn("tags", data)
        self.assertGreaterEqual(len(data["tags"]), 1)
        self.assertLessEqual(len(data["tags"]), 5)
        created = WorkspaceCanvas.objects.get(id=data["id"])
        self.assertEqual(created.tags, data["tags"])

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

    def test_seed_dashboard_demo_populates_sample_canvases(self):
        call_command("seed_dashboard_demo", self.user.username, replace=True)
        section = WorkspaceSection.objects.get(owner=self.user, name=DEMO_SECTION_NAME)
        project = section.projects.get(title=DEMO_PROJECT_NAME)
        canvases = list(project.canvases.order_by("title"))

        expected_count = len(DEMO_SAMPLE_CANVASES)
        expected_titles = sorted(sample["title"] for sample in DEMO_SAMPLE_CANVASES)
        self.assertEqual(len(canvases), expected_count)
        self.assertEqual([canvas.title for canvas in canvases], expected_titles)

        for canvas in canvases:
            sample = next(item for item in DEMO_SAMPLE_CANVASES if item["title"] == canvas.title)
            self.assertEqual(canvas.state_json["global"]["sessionTitle"], sample["title"])
            self.assertEqual(canvas.version_label, sample.get("version") or "")
            self.assertGreater(canvas.state_size, 0)

        resp = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        seeded_section = next((item for item in payload["items"] if item["id"] == str(section.id)), None)
        self.assertIsNotNone(seeded_section)
        self.assertEqual(seeded_section["name"], DEMO_SECTION_NAME)
        seeded_projects = seeded_section.get("projects", [])
        project_payload = next((item for item in seeded_projects if item["id"] == str(project.id)), None)
        self.assertIsNotNone(project_payload)
        self.assertEqual(project_payload["canvas_count"], expected_count)
        returned_titles = sorted(canvas["title"] for canvas in project_payload.get("canvases", []))
        self.assertEqual(returned_titles, expected_titles)

    def test_snapshot_create_with_custom_state_and_restore(self):
        inline_state = self._canvas_state("Snapshot inline", trace_id="inline-1")
        create = self.client.post(
            f"/api/dashboard/canvases/{self.canvas.id}/versions/",
            data=json.dumps(
                {
                    "label": "Inline",
                    "state": inline_state,
                    "thumbnail_url": "https://example.com/thumb.png",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        version_id = create.json()["id"]

        listing = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/versions/")
        self.assertEqual(listing.status_code, 200)
        items = listing.json()["items"]
        self.assertTrue(any(item["id"] == version_id for item in items))

        mutated_state = self._canvas_state("Mutated", trace_id="mutated")
        self._put_canvas_state(self.canvas, state=mutated_state, version_label="Mutated")

        detail = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/versions/{version_id}/")
        self.assertEqual(detail.status_code, 200)
        snapshot_payload = detail.json()
        self.assertEqual(snapshot_payload["label"], "Inline")
        self.assertEqual(snapshot_payload["state"]["order"], inline_state["order"])

        restore = self._put_canvas_state(
            self.canvas,
            state=snapshot_payload["state"],
            version_label="Inline Restore",
            thumbnail_url="https://example.com/restore.png",
        )
        self.assertEqual(restore.status_code, 200)
        self.canvas.refresh_from_db()
        self.assertEqual(self.canvas.state_json["order"], inline_state["order"])
        self.assertEqual(self.canvas.version_label, "Inline Restore")

    def test_sections_payload_includes_nested_projects_for_filters(self):
        second_section = WorkspaceSection.objects.create(owner=self.user, name="Process", position=2)
        folder_project = WorkspaceProject.objects.create(
            owner=self.user,
            section=second_section,
            title="Folder B",
            summary="Sub analyses",
        )
        folder_canvas = WorkspaceCanvas.objects.create(
            owner=self.user,
            project=folder_project,
            title="Folder canvas",
            state_json={
                "version": 2,
                "order": ["trace-99"],
                "traces": {"trace-99": {"id": "trace-99"}},
                "folders": {},
                "folderOrder": [],
            },
            state_size=42,
            tags=["B"],
        )

        resp = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()

        sections_by_id = {item["id"]: item for item in payload["items"]}
        self.assertIn(str(second_section.id), sections_by_id)
        second_payload = sections_by_id[str(second_section.id)]
        projects = second_payload.get("projects", [])
        self.assertEqual(len(projects), 1)
        project_payload = projects[0]
        self.assertEqual(project_payload["id"], str(folder_project.id))
        self.assertEqual(project_payload["section_id"], str(second_section.id))
        self.assertEqual(project_payload["canvas_count"], 1)
        canvases = project_payload.get("canvases", [])
        self.assertEqual(len(canvases), 1)
        canvas_payload = canvases[0]
        self.assertEqual(canvas_payload["id"], str(folder_canvas.id))
        self.assertEqual(canvas_payload["project_id"], str(folder_project.id))
        self.assertEqual(canvas_payload["title"], folder_canvas.title)
