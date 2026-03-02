import json
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase

from .. import sessions_repository as session_repo
from ..models import PlotSession
from ..sessions_repository import SessionTooLargeError

User = get_user_model()


class SessionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="secret")
        self.client.force_login(self.user)

    def test_api_me_authenticated(self):
        resp = self.client.get("/api/me/")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["username"], "tester")
        self.assertIn("login_url", payload)
        self.assertIn("logout_url", payload)

    def test_api_me_anonymous(self):
        self.client.logout()
        resp = self.client.get("/api/me/")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertFalse(payload["authenticated"])
        self.assertIn(settings.LOGIN_URL, payload["login_url"])

    def test_anonymous_session_create_bootstraps_guest_storage(self):
        self.client.logout()
        resp = self.client.post(
            "/api/session/",
            data=json.dumps({"title": "anon", "state": {"global": {}}}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(PlotSession.objects.count(), 1)

    def test_create_list_get_update_delete_roundtrip(self):
        payload = {
            "title": "First session",
            "state": {
                "version": 2,
                "global": {"foo": "bar"},
                "order": [],
                "traces": {},
                "folders": {},
                "folderOrder": [],
                "ui": {},
            },
        }

        resp = self.client.post("/api/session/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(resp.status_code, 201, resp.content)
        data = resp.json()
        session_id = data["session_id"]
        self.assertEqual(data["title"], payload["title"])
        self.assertGreater(data["size"], 0)
        self.assertEqual(data["storage"], "db")
        self.assertEqual(PlotSession.objects.count(), 1)

        listing = self.client.get("/api/session/list/")
        self.assertEqual(listing.status_code, 200)
        items = listing.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["session_id"], session_id)
        self.assertIn("updated", items[0])
        self.assertEqual(items[0]["storage"], "db")

        detail = self.client.get(f"/api/session/{session_id}/")
        self.assertEqual(detail.status_code, 200)
        detail_data = detail.json()
        self.assertEqual(detail_data["title"], payload["title"])
        self.assertEqual(detail_data["state"]["global"]["foo"], "bar")
        self.assertEqual(detail_data["storage"], "db")

        updated_payload = {
            "title": "Renamed session",
            "state": {
                "version": 2,
                "global": {"foo": "baz"},
                "order": ["trace"],
                "traces": {"trace": {"id": "trace"}},
                "folders": {},
                "folderOrder": [],
                "ui": {},
            },
        }
        update_resp = self.client.put(
            f"/api/session/{session_id}/",
            data=json.dumps(updated_payload),
            content_type="application/json",
        )
        self.assertEqual(update_resp.status_code, 200)
        updated = update_resp.json()
        self.assertEqual(updated["title"], updated_payload["title"])
        self.assertGreater(updated["size"], 0)
        self.assertEqual(updated["storage"], "db")

        delete_resp = self.client.delete(
            f"/api/session/{session_id}/",
            HTTP_X_CSRFTOKEN="dummy",
            follow=False,
        )
        self.assertEqual(delete_resp.status_code, 204)
        self.assertEqual(PlotSession.objects.count(), 0)

    def test_payload_limit_returns_413(self):
        big_state = {
            "version": 2,
            "global": {},
            "order": [],
            "traces": {},
            "folders": {},
            "folderOrder": [],
            "ui": {},
            "filler": "x" * 2048,
        }
        with patch.object(session_repo, "_prepare_storage", side_effect=SessionTooLargeError("too large")):
            resp = self.client.post(
                "/api/session/",
                data=json.dumps({"title": "Too big", "state": big_state}),
                content_type="application/json",
            )
        self.assertEqual(resp.status_code, 413)
        self.assertIn("too large", resp.json()["error"])
