import threading
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from setlog_join.launcher import COOKIE, Controller, create_launcher_app
from setlog_join.share import ShareError
from setlog_join.storage import default_storage

TOKEN = "launcher-token"
PORT = 50123


class FakeServer:
    def __init__(self):
        self.should_exit = False

    def run(self):
        while not self.should_exit:
            time.sleep(0.01)


class FakeShare:
    """share.prepare の代わり。止めるか期限（end_after）まで動く。"""

    def __init__(self, url="http://192.168.1.20:8080/p/abc", end_after: float | None = None):
        self.server = FakeServer()
        self.url = url
        self.ends_at = datetime.now() + timedelta(hours=2)
        self.videos = 3
        self.end_after = end_after

    def run(self):
        if self.end_after is not None:
            threading.Timer(self.end_after, self.stop).start()
        self.server.run()

    def stop(self):
        self.server.should_exit = True


class LauncherTestCase(unittest.TestCase):
    def setUp(self):
        self.prepared: list[tuple] = []
        self.next_share = FakeShare()

        def prepare(password, lifetime, store, folder):
            if password == "bad":
                raise ShareError("パスワードは4文字以上にしてください")
            self.prepared.append((password, lifetime, folder))
            return self.next_share

        self.store = default_storage(Path("/tmp/omoide-test"))
        self.controller = Controller(self.store, prepare_share=prepare)
        self.addCleanup(self.controller.stop)
        self.quit = mock.Mock()
        app = create_launcher_app(self.controller, TOKEN, PORT, web_dir=Path("/nonexistent"), on_quit=self.quit)
        self.client = TestClient(app, base_url=f"http://127.0.0.1:{PORT}", follow_redirects=False)

    def enter(self):
        response = self.client.get(f"/launcher/t/{TOKEN}")
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/launcher")


class GuardTest(LauncherTestCase):
    def test_api_needs_the_token_cookie(self):
        self.assertEqual(self.client.get("/launcher/api/status").status_code, 403)
        self.assertEqual(self.client.get("/launcher/t/wrong").status_code, 404)
        self.enter()
        self.assertIn(COOKIE, self.client.cookies)
        self.assertEqual(self.client.get("/launcher/api/status").status_code, 200)

    def test_rejects_other_host_names(self):
        # DNS リバインディング: 別の名前で 127.0.0.1 に届いた要求は受けない
        self.enter()
        response = self.client.get("/launcher/api/status", headers={"host": f"evil.example:{PORT}"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/launcher/api/status", headers={"host": f"localhost:{PORT}"}).status_code, 200)


class ShareFlowTest(LauncherTestCase):
    def setUp(self):
        super().setUp()
        self.enter()

    def test_idle_then_start_shows_the_share_and_qr(self):
        status = self.client.get("/launcher/api/status").json()
        self.assertEqual(status["state"], "idle")
        self.assertEqual(status["storage"]["input"], str(self.store.input))
        self.assertEqual(self.client.get("/launcher/api/qr.svg").status_code, 404)

        status = self.client.post("/launcher/api/start", json={"password": "secret", "expires": "2h"}).json()
        self.assertEqual(status["state"], "running")
        self.assertEqual(status["url"], "http://192.168.1.20:8080/p/abc")
        self.assertEqual(status["videos"], 3)
        self.assertEqual(self.prepared, [("secret", 7200, self.store.input)])
        qr = self.client.get("/launcher/api/qr.svg")
        self.assertEqual(qr.headers["content-type"], "image/svg+xml")
        self.assertIn(b"<svg", qr.content)

    def test_cannot_start_twice(self):
        self.client.post("/launcher/api/start", json={"password": "secret", "expires": "1h"})
        response = self.client.post("/launcher/api/start", json={"password": "secret", "expires": "1h"})
        self.assertEqual(response.status_code, 409)
        self.assertIn("すでに共有しています", response.json()["detail"])

    def test_explains_why_it_could_not_start(self):
        response = self.client.post("/launcher/api/start", json={"password": "bad", "expires": "1h"})
        self.assertEqual(response.status_code, 409)
        self.assertIn("4文字以上", response.json()["detail"])
        self.assertEqual(self.client.post("/launcher/api/start", json={"password": "secret", "expires": "9h"}).status_code, 422)

    def test_stop_ends_the_share(self):
        self.client.post("/launcher/api/start", json={"password": "secret", "expires": "1h"})
        status = self.client.post("/launcher/api/stop").json()
        self.assertEqual(status["state"], "idle")
        self.assertIn("共有を止めました", status["notice"])

    def test_tells_when_the_share_expired(self):
        self.next_share = FakeShare(end_after=0.05)
        self.client.post("/launcher/api/start", json={"password": "secret", "expires": "1h"})
        time.sleep(0.3)
        status = self.client.get("/launcher/api/status").json()
        self.assertEqual(status["state"], "idle")
        self.assertIn("期限が来た", status["notice"])

    def test_quit_stops_the_share_and_the_launcher(self):
        self.client.post("/launcher/api/start", json={"password": "secret", "expires": "1h"})
        self.assertEqual(self.client.post("/launcher/api/quit").status_code, 200)
        time.sleep(0.7)
        self.quit.assert_called_once()
        self.assertFalse(self.controller.running())


if __name__ == "__main__":
    unittest.main()
