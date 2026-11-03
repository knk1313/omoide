import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip
from setlog_join.server import create_app


def _scan() -> VideoScan:
    panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
    info = VideoInfo(Path("/videos/setlog.mov"), 4.0, 30.0, 640, 1080, None)
    clips = [
        ScannedClip(Clip(1, 0.0, 2.0), [panels[0], panels[2]]),
        ScannedClip(Clip(2, 2.0, 4.0), [panels[1]]),
    ]
    return VideoScan(info=info, panels=panels, clips=clips)


class ServerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.web_dir = Path(tmp.name)
        (self.web_dir / "assets").mkdir()
        (self.web_dir / "index.html").write_text("<!doctype html><title>omoide</title>")
        (self.web_dir / "assets" / "app.js").write_text("console.log('app')")
        self.client = TestClient(create_app([_scan()], self.web_dir))

    def test_health_reports_loaded_videos(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "videos": 1, "clips": 2, "panels": 3})

    def test_serves_built_files(self):
        self.assertIn("<title>omoide</title>", self.client.get("/").text)
        response = self.client.get("/assets/app.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.headers["content-type"])

    def test_falls_back_to_index_for_screen_routes(self):
        for path in ("/clips", "/preview/settings"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn("<title>omoide</title>", response.text)

    def test_unknown_api_is_404_not_index(self):
        response = self.client.get("/api/unknown")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers["content-type"], "application/json")

    def test_does_not_expose_api_docs(self):
        for path in ("/docs", "/openapi.json"):
            with self.subTest(path=path):
                self.assertNotIn("openapi", self.client.get(path).text.lower())

    def test_explains_when_screen_is_not_built(self):
        with tempfile.TemporaryDirectory() as empty:
            client = TestClient(create_app([_scan()], Path(empty)))
            self.assertIn("npm run build", client.get("/").text)
            self.assertEqual(client.get("/api/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
