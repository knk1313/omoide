import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from setlog_join.auth import ShareAuth
from setlog_join.jobs import JobManager
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip
from setlog_join.server import GATE_COOKIE, SESSION_COOKIE, create_app
from setlog_join.workspace import Workspace

PASSWORD = "correct horse"


def _scan(video: Path) -> VideoScan:
    panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
    info = VideoInfo(video, 4.0, 30.0, 640, 1080, None)
    clips = [
        ScannedClip(Clip(1, 0.0, 2.0), [panels[0], panels[2]]),
        ScannedClip(Clip(2, 2.0, 4.0), [panels[1]]),
    ]
    return VideoScan(info=info, panels=panels, clips=clips)


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class ServerTestCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.web_dir = Path(tmp.name)
        (self.web_dir / "assets").mkdir()
        (self.web_dir / "index.html").write_text("<!doctype html><title>omoide</title>")
        (self.web_dir / "assets" / "app.js").write_text("console.log('app')")
        self.data_dir = Path(tmp.name) / "data"
        self.data_dir.mkdir()
        video = self.data_dir / "setlog.mov"
        video.write_bytes(b"video")
        self.workspace = Workspace(
            [_scan(video)], self.data_dir / "project.json", self.data_dir / "thumbnails", self.data_dir / "clips",
        )
        self.clock = FakeClock()
        self.auth = ShareAuth(PASSWORD, 3600, clock=self.clock)
        self.client = TestClient(create_app(self.workspace, self.auth, self.web_dir), follow_redirects=False)

    def open_share(self) -> None:
        self.client.get(f"/p/{self.auth.token}")

    def login(self) -> None:
        self.open_share()
        self.assertEqual(self.client.post("/api/session/login", json={"password": PASSWORD}).status_code, 200)


class GateTest(ServerTestCase):
    def test_hides_everything_without_the_share_url(self):
        for path in ("/", "/clips", "/assets/app.js", "/api/health"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_wrong_token_is_404(self):
        self.assertEqual(self.client.get("/p/wrong").status_code, 404)
        self.assertNotIn(GATE_COOKIE, self.client.cookies)

    def test_share_url_sets_a_strict_http_only_cookie_and_redirects(self):
        response = self.client.get(f"/p/{self.auth.token}")
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/")
        cookie = response.headers["set-cookie"].lower()
        for attribute in ("httponly", "samesite=strict", "path=/", "max-age="):
            self.assertIn(attribute, cookie)

    def test_screen_is_visible_after_opening_the_share_url(self):
        self.open_share()
        self.assertIn("<title>omoide</title>", self.client.get("/").text)
        self.assertIn("<title>omoide</title>", self.client.get("/clips").text)
        self.assertEqual(self.client.get("/assets/app.js").status_code, 200)


class LoginTest(ServerTestCase):
    def test_api_requires_login(self):
        self.open_share()
        self.assertEqual(self.client.get("/api/health").status_code, 401)

    def test_login_with_the_right_password(self):
        self.login()
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_wrong_password_gives_the_same_generic_error(self):
        self.open_share()
        response = self.client.post("/api/session/login", json={"password": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "パスワードが違います"})
        self.assertNotIn(SESSION_COOKIE, self.client.cookies)

    def test_rejects_overlong_passwords_without_hashing(self):
        self.open_share()
        response = self.client.post("/api/session/login", json={"password": "x" * 10_000})
        self.assertEqual(response.status_code, 422)

    def test_login_is_throttled(self):
        self.open_share()
        for _ in range(5):
            self.client.post("/api/session/login", json={"password": "wrong"})
        response = self.client.post("/api/session/login", json={"password": PASSWORD})
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry-after", response.headers)

    def test_login_needs_the_share_url_first(self):
        response = self.client.post("/api/session/login", json={"password": PASSWORD})
        self.assertEqual(response.status_code, 404)

    def test_logout_ends_the_session(self):
        self.login()
        self.assertEqual(self.client.post("/api/session/logout").status_code, 200)
        self.assertEqual(self.client.get("/api/health").status_code, 401)

    def test_forged_session_cookie_is_rejected(self):
        self.open_share()
        self.client.cookies.set(SESSION_COOKIE, "forged")
        self.assertEqual(self.client.get("/api/health").status_code, 401)

    def test_everything_is_gone_after_expiry(self):
        self.login()
        self.clock.now += 3600
        for path in ("/", "/api/health", f"/p/{self.auth.token}"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 410)


class ScreenTest(ServerTestCase):
    def test_unknown_api_is_404_not_index(self):
        self.login()
        response = self.client.get("/api/unknown")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers["content-type"], "application/json")

    def test_does_not_expose_api_docs(self):
        self.login()
        for path in ("/docs", "/openapi.json"):
            with self.subTest(path=path):
                self.assertNotIn("openapi", self.client.get(path).text.lower())

    def test_explains_when_screen_is_not_built(self):
        with tempfile.TemporaryDirectory() as empty:
            client = TestClient(create_app(self.workspace, self.auth, Path(empty)))
            client.get(f"/p/{self.auth.token}")
            self.assertIn("npm run build", client.get("/").text)


class ClipsApiTest(ServerTestCase):
    def setUp(self):
        super().setUp()
        self.login()

    def test_project_summary(self):
        body = self.client.get("/api/project").json()
        self.assertEqual(body["speed"], 1.0)
        self.assertEqual((body["total_count"], body["selected_count"]), (3, 3))
        self.assertAlmostEqual(body["estimated_seconds"], 6.0)
        self.assertEqual(body["videos"], [{"name": "setlog", "created_at": None, "panel_count": 3}])
        self.assertEqual(body["frame"], {"width": 640, "height": 360})
        self.client.post("/api/clips/select-all", json={"selected": False})
        self.assertIsNone(self.client.get("/api/project").json()["frame"])

    def test_lists_clips_with_media_urls(self):
        clips = self.client.get("/api/clips").json()
        self.assertEqual([c["id"] for c in clips], ["setlog/001-1", "setlog/001-3", "setlog/002-2"])
        self.assertEqual(clips[1], {
            "id": "setlog/001-3", "video": "setlog", "clip": 1, "panel": 3, "label": "ユーザー3", "width": 640, "height": 360,
            "start": 0.0, "duration": 2.0, "selected": True,
            "thumbnail_url": "/media/thumbnails/setlog/001-3", "video_url": "/media/clips/setlog/001-3",
        })

    def test_toggles_a_clip_and_persists_it(self):
        response = self.client.patch("/api/clips/setlog/001-3", json={"selected": False})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["selected"])
        self.assertEqual(self.client.get("/api/project").json()["selected_count"], 2)
        self.assertIn("setlog/001-3", (self.data_dir / "project.json").read_text())

    def test_select_all(self):
        self.assertEqual(self.client.post("/api/clips/select-all", json={"selected": False}).json()["selected_count"], 0)
        self.assertEqual(self.client.post("/api/clips/select-all", json={"selected": True}).json()["selected_count"], 3)

    def test_updates_speed(self):
        body = self.client.patch("/api/settings", json={"speed": 2}).json()
        self.assertEqual(body["speed"], 2.0)
        self.assertAlmostEqual(body["estimated_seconds"], 3.0)
        self.assertEqual(self.client.patch("/api/settings", json={"speed": 3}).status_code, 422)

    def test_unknown_or_malicious_ids_are_404(self):
        # "../" はクライアントが送る前に正規化して API に届かないので、エンコードした形で確かめる
        for path in ("/api/clips/setlog/009-1", "/api/clips/setlog%2F..%2F..%2Fetc%2Fpasswd", "/api/clips/%2Fetc%2Fpasswd"):
            with self.subTest(path=path):
                self.assertEqual(self.client.patch(path, json={"selected": True}).status_code, 404)
        for path in ("/media/clips/setlog/009-1", "/media/thumbnails/..%2F..%2Fetc%2Fpasswd"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_serves_thumbnail(self):
        path = self.workspace.thumbnail_path(self.workspace.get("setlog/001-1"))
        path.parent.mkdir(parents=True)
        path.write_bytes(b"\xff\xd8jpeg")
        response = self.client.get("/media/thumbnails/setlog/001-1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/jpeg")
        self.assertEqual(self.client.get("/media/thumbnails/setlog/001-3").status_code, 404)

    def test_serves_clip_with_range_requests(self):
        data = bytes(range(256)) * 8
        path = self.data_dir / "clip.mp4"
        path.write_bytes(data)
        with mock.patch.object(Workspace, "clip_path", return_value=path):
            full = self.client.get("/media/clips/setlog/001-1")
            partial = self.client.get("/media/clips/setlog/001-1", headers={"Range": "bytes=0-99"})
            outside = self.client.get("/media/clips/setlog/001-1", headers={"Range": "bytes=99999-"})
        self.assertEqual((full.status_code, full.headers["content-type"]), (200, "video/mp4"))
        self.assertEqual(full.headers["accept-ranges"], "bytes")
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(partial.headers["content-range"], f"bytes 0-99/{len(data)}")
        self.assertEqual(partial.content, data[:100])
        self.assertEqual(outside.status_code, 416)


class JobsApiTest(ServerTestCase):
    def setUp(self):
        super().setUp()
        self.free = 10**12

        def runner(segments, speed, out, quality, progress):
            out.write_bytes(b"0123456789" * 100)
            progress(1.0)

        self.jobs = JobManager(self.workspace, self.data_dir / "previews", self.data_dir / "output", runner,
                               free_bytes=lambda path: self.free)
        self.addCleanup(self.jobs.shutdown)
        self.client = TestClient(create_app(self.workspace, self.auth, self.web_dir, self.jobs), follow_redirects=False)
        self.login()

    def wait(self, job: dict) -> dict:
        for _ in range(500):
            if job["status"] not in ("queued", "running"):
                return job
            time.sleep(0.01)
            job = self.client.get(f"/api/jobs/{job['id']}").json()
        self.fail("job did not finish")

    def test_preview_then_play_it(self):
        self.assertEqual(self.client.get("/media/preview").status_code, 404)
        response = self.client.post("/api/preview")
        self.assertEqual(response.status_code, 202)
        job = self.wait(response.json())
        self.assertEqual((job["status"], job["progress"]), ("done", 1.0))
        preview = self.client.get(job["url"], headers={"Range": "bytes=0-9"})
        self.assertEqual(preview.status_code, 206)
        self.assertEqual(preview.content, b"0123456789")

    def test_export_then_download_it_as_an_attachment(self):
        self.assertEqual(self.client.get("/download/output").status_code, 404)
        job = self.wait(self.client.post("/api/export").json())
        response = self.client.get(job["url"])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-disposition"].startswith("attachment;"))
        self.assertIn("omoide-", response.headers["content-disposition"])

    def test_errors_tell_the_user_what_to_do(self):
        self.client.post("/api/clips/select-all", json={"selected": False})
        response = self.client.post("/api/preview")
        self.assertEqual(response.status_code, 422)
        self.assertIn("クリップを選んでください", response.json()["detail"])

        self.client.post("/api/clips/select-all", json={"selected": True})
        self.free = 0
        response = self.client.post("/api/export")
        self.assertEqual(response.status_code, 507)
        self.assertIn("空き容量", response.json()["detail"])

    def test_unknown_job_is_404(self):
        self.assertEqual(self.client.get("/api/jobs/nope").status_code, 404)

    def test_clear_temporary(self):
        self.wait(self.client.post("/api/preview").json())
        self.assertEqual(self.client.delete("/api/temporary").status_code, 200)
        self.assertEqual(self.client.get("/media/preview").status_code, 404)


class MediaAuthTest(ServerTestCase):
    def test_media_requires_login(self):
        self.open_share()
        for path in ("/media/thumbnails/setlog/001-1", "/media/clips/setlog/001-1", "/media/preview",
                     "/download/output", "/api/clips", "/api/project", "/api/jobs/x"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)


if __name__ == "__main__":
    unittest.main()
