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

    def _guest_owner(self):
        owner_id = self.client.session.get("ft_guest_workspace_owner_id")
        self.assertIsNotNone(owner_id)
        return User.objects.get(id=owner_id)

    def test_guest_home_bootstraps_workspace_entities(self):
        self.client.logout()
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)

        owner = self._guest_owner()
        self.assertEqual(WorkspaceSection.objects.filter(owner=owner).count(), 1)
        self.assertEqual(WorkspaceProject.objects.filter(owner=owner).count(), 1)
        self.assertEqual(WorkspaceCanvas.objects.filter(owner=owner).count(), 1)
        section = WorkspaceSection.objects.get(owner=owner)
        project = WorkspaceProject.objects.get(owner=owner)
        canvas = WorkspaceCanvas.objects.get(owner=owner)
        self.assertEqual(section.name, "Untitled Project")
        self.assertEqual(project.title, "Untitled Folder")
        self.assertEqual(canvas.title, "Untitled Canvas")

    def test_guest_sections_api_returns_bootstrapped_workspace(self):
        self.client.logout()
        self.client.get("/")
        resp = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload["items"]), 1)
        section = payload["items"][0]
        self.assertEqual(len(section.get("projects", [])), 1)
        project = section["projects"][0]
        self.assertEqual(project["canvas_count"], 1)

    def test_guest_quota_blocks_extra_project_and_canvas(self):
        self.client.logout()
        self.client.get("/")
        owner = self._guest_owner()
        section = WorkspaceSection.objects.get(owner=owner)
        project = WorkspaceProject.objects.get(owner=owner)

        project_resp = self.client.post(
            f"/api/dashboard/sections/{section.id}/projects/",
            data=json.dumps({"title": "Another project"}),
            content_type="application/json",
        )
        self.assertEqual(project_resp.status_code, 403)
        self.assertEqual(project_resp.json()["code"], "workspace_limit_reached")
        self.assertIn("upgrade_url", project_resp.json())

        canvas_resp = self.client.post(
            f"/api/dashboard/projects/{project.id}/canvases/",
            data=json.dumps({"title": "Another canvas", "state": {}}),
            content_type="application/json",
        )
        self.assertEqual(canvas_resp.status_code, 201)
        canvas_payload = canvas_resp.json()
        self.assertIn("quota_lock_notice", canvas_payload)
        listing = self.client.get("/api/dashboard/sections/?include=full")
        canvases = listing.json()["items"][0]["projects"][0]["canvases"]
        locked = [canvas for canvas in canvases if canvas.get("quota_locked")]
        self.assertEqual(len(locked), 1)

    def test_guest_workspace_is_adopted_after_login(self):
        self.client.logout()
        self.client.get("/")
        guest_owner = self._guest_owner()
        guest_canvas = WorkspaceCanvas.objects.get(owner=guest_owner)
        guest_canvas.state_json = self._canvas_state("Guest migrated", trace_id="guest-1")
        guest_canvas.state_size = len(json.dumps(guest_canvas.state_json))
        guest_canvas.save(update_fields=["state_json", "state_size", "updated_at"])

        adopted_user = User.objects.create_user(username="adopted", password="secret")
        self.assertTrue(self.client.login(username="adopted", password="secret"))
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)

        guest_canvas.refresh_from_db()
        self.assertEqual(guest_canvas.owner, adopted_user)
        self.assertEqual(WorkspaceProject.objects.filter(owner=adopted_user).count(), 1)
        self.assertEqual(WorkspaceCanvas.objects.filter(owner=adopted_user).count(), 1)
        adopted_project = WorkspaceProject.objects.get(owner=adopted_user)
        adopted_section = WorkspaceSection.objects.get(owner=adopted_user)
        self.assertEqual(adopted_section.name, "Untitled Project")
        self.assertEqual(adopted_project.title, "Untitled Folder")
        self.assertNotIn("ft_guest_workspace_owner_id", self.client.session)

    def test_pristine_guest_workspace_is_not_migrated_on_login(self):
        self.client.logout()
        self.client.get("/")
        guest_owner = self._guest_owner()
        pristine_canvas = WorkspaceCanvas.objects.get(owner=guest_owner)

        target_user = User.objects.create_user(username="fresh-account", password="secret")
        self.assertTrue(self.client.login(username="fresh-account", password="secret"))
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)

        pristine_canvas.refresh_from_db()
        self.assertEqual(pristine_canvas.owner, guest_owner)
        self.assertFalse(WorkspaceCanvas.objects.filter(owner=target_user).exists())
        self.assertNotIn("ft_guest_workspace_owner_id", self.client.session)

    def test_guest_workspace_at_quota_is_staged_not_adopted(self):
        self.client.logout()
        self.client.get("/")
        guest_owner = self._guest_owner()
        guest_canvas = WorkspaceCanvas.objects.get(owner=guest_owner)
        guest_canvas.state_json = self._canvas_state("Guest staged", trace_id="guest-stage")
        guest_canvas.state_size = len(json.dumps(guest_canvas.state_json))
        guest_canvas.save(update_fields=["state_json", "state_size", "updated_at"])

        quota_user = User.objects.create_user(username="quota-user", password="secret")
        quota_section = WorkspaceSection.objects.create(owner=quota_user, name="Owned")
        quota_project = WorkspaceProject.objects.create(owner=quota_user, section=quota_section, title="Folder")
        for index in range(3):
            WorkspaceCanvas.objects.create(
                owner=quota_user,
                project=quota_project,
                title=f"Canvas {index + 1}",
                state_json={"index": index},
                state_size=10,
            )

        self.assertTrue(self.client.login(username="quota-user", password="secret"))
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)

        guest_canvas.refresh_from_db()
        self.assertEqual(guest_canvas.owner, guest_owner)
        self.assertEqual(WorkspaceCanvas.objects.filter(owner=quota_user).count(), 3)

        me = self.client.get("/api/me/")
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["pending_guest_workspace_adoption"])
        self.assertNotIn("ft_guest_workspace_owner_id", self.client.session)

    def test_logout_after_adoption_bootstraps_fresh_guest_workspace(self):
        self.client.logout()
        self.client.get("/")
        guest_owner = self._guest_owner()
        guest_canvas = WorkspaceCanvas.objects.get(owner=guest_owner)
        guest_canvas.state_json = self._canvas_state("Guest migrated", trace_id="guest-fresh")
        guest_canvas.state_size = len(json.dumps(guest_canvas.state_json))
        guest_canvas.save(update_fields=["state_json", "state_size", "updated_at"])

        adopted_user = User.objects.create_user(username="adopted-fresh", password="secret")
        self.assertTrue(self.client.login(username="adopted-fresh", password="secret"))
        self.client.get("/")
        self.client.logout()

        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        fresh_guest_owner = self._guest_owner()
        self.assertNotEqual(fresh_guest_owner.pk, guest_owner.pk)
        self.assertEqual(WorkspaceCanvas.objects.filter(owner=fresh_guest_owner).count(), 1)
        fresh_canvas = WorkspaceCanvas.objects.get(owner=fresh_guest_owner)
        self.assertEqual(fresh_canvas.title, "Untitled Canvas")
        self.assertEqual(fresh_canvas.state_json, {})

    def test_logout_after_staged_adoption_bootstraps_fresh_guest_workspace(self):
        self.client.logout()
        self.client.get("/")
        guest_owner = self._guest_owner()
        guest_canvas = WorkspaceCanvas.objects.get(owner=guest_owner)
        guest_canvas.state_json = self._canvas_state("Guest staged", trace_id="guest-stage-fresh")
        guest_canvas.state_size = len(json.dumps(guest_canvas.state_json))
        guest_canvas.save(update_fields=["state_json", "state_size", "updated_at"])

        quota_user = User.objects.create_user(username="quota-fresh", password="secret")
        quota_section = WorkspaceSection.objects.create(owner=quota_user, name="Owned")
        quota_project = WorkspaceProject.objects.create(owner=quota_user, section=quota_section, title="Folder")
        for index in range(3):
            WorkspaceCanvas.objects.create(
                owner=quota_user,
                project=quota_project,
                title=f"Canvas {index + 1}",
                state_json={"index": index},
                state_size=10,
            )

        self.assertTrue(self.client.login(username="quota-fresh", password="secret"))
        self.client.get("/")
        self.client.logout()

        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        fresh_guest_owner = self._guest_owner()
        self.assertNotEqual(fresh_guest_owner.pk, guest_owner.pk)
        self.assertEqual(WorkspaceCanvas.objects.filter(owner=fresh_guest_owner).count(), 1)
        fresh_canvas = WorkspaceCanvas.objects.get(owner=fresh_guest_owner)
        self.assertEqual(fresh_canvas.title, "Untitled Canvas")
        self.assertEqual(fresh_canvas.state_json, {})

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

    def test_create_canvas_beyond_quota_locks_oldest_canvas(self):
        url = f"/api/dashboard/projects/{self.project.id}/canvases/"
        created_payloads = []
        for index in range(3):
            resp = self.client.post(
                url,
                data=json.dumps({"title": f"Analysis {index + 1}", "state": {"order": [str(index)]}}),
                content_type="application/json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
            created_payloads.append(resp.json())

        overflow_payload = created_payloads[-1]
        self.assertIn("quota_lock_notice", overflow_payload)
        self.assertFalse(overflow_payload["quota_locked"])

        listing = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(listing.status_code, 200)
        canvases = listing.json()["items"][0]["projects"][0]["canvases"]
        locked = [canvas for canvas in canvases if canvas.get("quota_locked")]
        self.assertEqual(len(locked), 1)
        self.assertEqual(locked[0]["id"], str(self.canvas.id))

        locked_state = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/state/")
        self.assertEqual(locked_state.status_code, 200)
        self.assertIn("state", locked_state.json())

        locked_state_put = self.client.put(
            f"/api/dashboard/canvases/{self.canvas.id}/state/",
            data=json.dumps({"state": {"order": []}}),
            content_type="application/json",
        )
        self.assertEqual(locked_state_put.status_code, 423)
        self.assertEqual(locked_state_put.json()["code"], "canvas_quota_locked")
        self.assertIn("upgrade_url", locked_state_put.json())

        locked_versions = self.client.get(f"/api/dashboard/canvases/{self.canvas.id}/versions/")
        self.assertEqual(locked_versions.status_code, 200)
        self.assertIn("items", locked_versions.json())

        locked_versions_post = self.client.post(
            f"/api/dashboard/canvases/{self.canvas.id}/versions/",
            data=json.dumps({"label": "blocked"}),
            content_type="application/json",
        )
        self.assertEqual(locked_versions_post.status_code, 423)
        self.assertEqual(locked_versions_post.json()["code"], "canvas_quota_locked")

        locked_patch = self.client.patch(
            f"/api/dashboard/canvases/{self.canvas.id}/",
            data=json.dumps({"title": "Blocked rename"}),
            content_type="application/json",
        )
        self.assertEqual(locked_patch.status_code, 423)
        self.assertEqual(locked_patch.json()["code"], "canvas_quota_locked")

    def test_deleting_canvas_below_quota_unlocks_oldest_canvas(self):
        url = f"/api/dashboard/projects/{self.project.id}/canvases/"
        created_ids = []
        for index in range(3):
            resp = self.client.post(
                url,
                data=json.dumps({"title": f"Analysis {index + 1}", "state": {"order": [str(index)]}}),
                content_type="application/json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
            created_ids.append(resp.json()["id"])

        locked_patch = self.client.patch(
            f"/api/dashboard/canvases/{self.canvas.id}/",
            data=json.dumps({"title": "Still blocked"}),
            content_type="application/json",
        )
        self.assertEqual(locked_patch.status_code, 423)

        delete_resp = self.client.delete(f"/api/dashboard/canvases/{created_ids[-1]}/")
        self.assertEqual(delete_resp.status_code, 204)

        listing = self.client.get("/api/dashboard/sections/?include=full")
        self.assertEqual(listing.status_code, 200)
        canvases = listing.json()["items"][0]["projects"][0]["canvases"]
        unlocked = next(canvas for canvas in canvases if canvas["id"] == str(self.canvas.id))
        self.assertFalse(unlocked["quota_locked"])

        unlocked_patch = self.client.patch(
            f"/api/dashboard/canvases/{self.canvas.id}/",
            data=json.dumps({"title": "Unlocked again"}),
            content_type="application/json",
        )
        self.assertEqual(unlocked_patch.status_code, 200)

    def test_plans_and_checkout_placeholder_pages_render(self):
        plans = self.client.get("/plans/")
        self.assertEqual(plans.status_code, 200)
        self.assertContains(plans, "Choose a plan")

        checkout = self.client.get("/plans/checkout/?plan=pro")
        self.assertEqual(checkout.status_code, 200)
        self.assertContains(checkout, "Review your Pro upgrade")

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
