import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from setlog_join.auth import ShareAuth
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip
from setlog_join.server import GATE_COOKIE, SESSION_COOKIE, create_app

PASSWORD = "correct horse"


def _scan() -> VideoScan:
    panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
    info = VideoInfo(Path("/videos/setlog.mov"), 4.0, 30.0, 640, 1080, None)
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
        self.clock = FakeClock()
        self.auth = ShareAuth(PASSWORD, 3600, clock=self.clock)
        self.client = TestClient(create_app([_scan()], self.auth, self.web_dir), follow_redirects=False)

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
        self.assertEqual(response.json(), {"status": "ok", "videos": 1, "clips": 2, "panels": 3})

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
            client = TestClient(create_app([_scan()], self.auth, Path(empty)))
            client.get(f"/p/{self.auth.token}")
            self.assertIn("npm run build", client.get("/").text)


if __name__ == "__main__":
    unittest.main()
