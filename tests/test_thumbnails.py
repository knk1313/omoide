import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setlog_join import thumbnails
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip

COLORS = {"0xFF0000": (255, 0, 0), "0x00FF00": (0, 255, 0), "0x0000FF": (0, 0, 255)}
RED, GREEN, BLUE = COLORS


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class EnsureThumbnailsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.video = self.tmp / "stacked.mp4"
        self._make_video([RED, GREEN, BLUE])
        self.thumbnail_dir = self.tmp / "thumbnails"

    def test_creates_one_image_per_filled_panel(self):
        video_dir = thumbnails.ensure_thumbnails(self._scan([[0, 2], [1]]), self.thumbnail_dir)
        names = sorted(p.name for p in video_dir.glob("*.jpg"))
        self.assertEqual(names, ["001-1.jpg", "001-3.jpg", "002-2.jpg"])

        size = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0",
             str(video_dir / "001-3.jpg")],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        self.assertEqual(size, "400,226")
        self.assertColor(self._pixel(video_dir / "001-3.jpg"), COLORS[BLUE])

    def test_skips_existing_images_while_video_is_unchanged(self):
        scan = self._scan([[0], [1]])
        thumbnails.ensure_thumbnails(scan, self.thumbnail_dir)
        with mock.patch.object(thumbnails.ffmpeg, "run") as run:
            thumbnails.ensure_thumbnails(scan, self.thumbnail_dir)
        run.assert_not_called()

    def test_rebuilds_when_video_changes(self):
        video_dir = thumbnails.ensure_thumbnails(self._scan([[0, 1], []]), self.thumbnail_dir)
        self._make_video([GREEN, BLUE, RED])
        thumbnails.ensure_thumbnails(self._scan([[0], []]), self.thumbnail_dir)

        # 今回は空になったパネルの画像は残らない
        self.assertEqual(sorted(p.name for p in video_dir.glob("*.jpg")), ["001-1.jpg"])
        self.assertColor(self._pixel(video_dir / "001-1.jpg"), COLORS[GREEN])

    def _make_video(self, colors: list[str]) -> None:
        inputs = []
        for color in colors:
            inputs += ["-f", "lavfi", "-i", f"color=c={color}:s=640x360:r=30:d=4"]
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", "vstack=inputs=3",
             "-pix_fmt", "yuv420p", str(self.video)],
            check=True,
        )

    def _scan(self, filled_by_clip: list[list[int]]) -> VideoScan:
        panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
        info = VideoInfo(self.video, 4.0, 30.0, 640, 1080, None)
        clips = [
            ScannedClip(Clip(i + 1, i * 2.0, (i + 1) * 2.0), [panels[p] for p in filled])
            for i, filled in enumerate(filled_by_clip)
        ]
        return VideoScan(info=info, panels=panels, clips=clips)

    def _pixel(self, path: Path) -> tuple[int, int, int]:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-vf", "crop=2:2:200:100",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True, check=True,
        ).stdout
        return tuple(raw[:3])

    def assertColor(self, actual: tuple[int, int, int], expected: tuple[int, int, int]):
        for a, e in zip(actual, expected):
            self.assertAlmostEqual(a, e, delta=30, msg=f"{actual} != {expected}")


if __name__ == "__main__":
    unittest.main()
