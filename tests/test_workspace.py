import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setlog_join import workspace as workspace_module
from setlog_join.cache import video_key
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo, probe
from setlog_join.project import load_project
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip
from setlog_join.workspace import Workspace


def _scan(info: VideoInfo, filled_by_clip: list[list[int]], black_edges=None) -> VideoScan:
    panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
    clips = [
        ScannedClip(Clip(i + 1, i * 2.0, (i + 1) * 2.0), [panels[p] for p in filled], (black_edges or {}).get(i + 1, {}))
        for i, filled in enumerate(filled_by_clip)
    ]
    return VideoScan(info=info, panels=panels, clips=clips)


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.video = self.tmp / "sep.mov"
        self.video.write_bytes(b"video")
        info = VideoInfo(self.video, 4.0, 30.0, 640, 1080, None)
        # クリップ 2 の中のパネルは末尾 3 フレームが黒い
        self.scan = _scan(info, [[0, 2], [1]], black_edges={2: {1: (0, 3)}})
        self.project_path = self.tmp / "project.json"
        self.workspace = Workspace(
            [self.scan], self.project_path, self.tmp / "thumbnails", self.tmp / "clips",
        )

    def test_lists_filled_panels_in_time_order(self):
        self.assertEqual(list(self.workspace.entries), ["sep/001-1", "sep/001-3", "sep/002-2"])

    def test_entry_uses_the_trimmed_span(self):
        self.assertAlmostEqual(self.workspace.get("sep/002-2").clip.duration, 2.0 - 3 / 30)

    def test_unknown_id_is_key_error(self):
        for panel_id in ("sep/009-1", "../../etc/passwd", ""):
            with self.subTest(panel_id=panel_id), self.assertRaises(KeyError):
                self.workspace.get(panel_id)

    def test_selection_and_speed_are_saved(self):
        self.workspace.set_selected("sep/001-3", False)
        self.workspace.set_speed(2.0)
        saved = load_project(self.project_path)
        self.assertEqual(saved.excluded, {"sep/001-3"})
        self.assertEqual(saved.speed, 2.0)

    def test_rejects_unsupported_speed(self):
        with self.assertRaises(ValueError):
            self.workspace.set_speed(3.0)

    def test_select_all(self):
        self.workspace.select_all(False)
        self.assertEqual(self.workspace.summary()["selected_count"], 0)
        self.workspace.select_all(True)
        self.assertEqual(self.workspace.summary()["selected_count"], 3)

    def test_select_all_for_one_user(self):
        self.workspace.select_all(False, panel=1)
        self.assertEqual(self.workspace.project.excluded, {"sep/001-1"})
        self.workspace.select_all(True, panel=1)
        self.assertEqual(self.workspace.project.excluded, set())

    def test_use_only_one_user(self):
        self.workspace.select_all(True, panel=3, only=True)
        self.assertEqual(self.workspace.project.excluded, {"sep/001-1", "sep/002-2"})
        self.assertEqual(self.workspace.summary()["selected_count"], 1)

    def test_summary_estimates_the_length_at_the_chosen_speed(self):
        self.workspace.set_speed(2.0)
        summary = self.workspace.summary()
        self.assertEqual(summary["total_count"], 3)
        self.assertAlmostEqual(summary["estimated_seconds"], (2.0 + 2.0 + 2.0 - 0.1) / 2, places=2)

    def test_thumbnail_path_is_built_from_the_id(self):
        path = self.workspace.thumbnail_path(self.workspace.get("sep/001-3"))
        self.assertEqual(path, self.tmp / "thumbnails" / video_key(self.scan.info) / "001-3.jpg")

    def test_clip_is_generated_once_and_reused(self):
        def fake_export(info, clip, panel, out):
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"mp4")

        with mock.patch.object(workspace_module, "export_panel_clip", side_effect=fake_export) as export:
            first = self.workspace.clip_path(self.workspace.get("sep/002-2"))
            second = self.workspace.clip_path(self.workspace.get("sep/002-2"))
        self.assertEqual(first, second)
        self.assertEqual(first.read_bytes(), b"mp4")
        self.assertEqual(export.call_count, 1)
        # 黒いフレームを除いた区間で書き出す
        self.assertAlmostEqual(export.call_args.args[1].end, 4.0 - 3 / 30)
        self.assertEqual(list(first.parent.glob("*.tmp.mp4")), [])

    def test_clip_is_regenerated_when_the_video_changes(self):
        entry = self.workspace.get("sep/001-1")
        with mock.patch.object(workspace_module, "export_panel_clip",
                               side_effect=lambda i, c, p, out: (out.parent.mkdir(parents=True, exist_ok=True),
                                                                 out.write_bytes(b"x"))) as export:
            before = self.workspace.clip_path(entry)
            self.video.write_bytes(b"replaced video")
            after = self.workspace.clip_path(entry)
        self.assertNotEqual(before.parent, after.parent)
        self.assertEqual(export.call_count, 2)


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class WorkspaceClipFileTest(unittest.TestCase):
    def test_generated_clip_starts_with_moov_for_streaming(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "stacked.mp4"
            inputs = []
            for _ in range(3):
                inputs += ["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2"]
            subprocess.run(["ffmpeg", "-v", "error", *inputs, "-filter_complex", "vstack=inputs=3",
                            "-pix_fmt", "yuv420p", str(src)], check=True)
            workspace = Workspace([_scan(probe(src), [[0]])], Path(tmp) / "p.json", Path(tmp) / "t", Path(tmp) / "c")
            data = workspace.clip_path(workspace.get("stacked/001-1")).read_bytes()
        self.assertLess(data.find(b"moov"), data.find(b"mdat"))


if __name__ == "__main__":
    unittest.main()
