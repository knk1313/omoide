import asyncio
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from setlog_join.jobs import AnalysisError, analyze_video
from setlog_join.uploads import MAX_UPLOAD_BYTES, UploadError, save_upload, upload_path


async def _chunks(*parts: bytes):
    for part in parts:
        yield part


class UploadPathTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)

    def test_keeps_a_safe_name(self):
        self.assertEqual(upload_path("IMG_0123.MOV", self.folder).name, "IMG_0123.mov")
        self.assertEqual(upload_path("9月の旅行.mp4", self.folder).name, "9月の旅行.mp4")

    def test_removes_path_parts_and_separators(self):
        self.assertEqual(upload_path("../../etc/x.mp4", self.folder), self.folder / "x.mp4")
        self.assertEqual(upload_path("a b/c.mp4", self.folder).name, "c.mp4")
        self.assertEqual(upload_path("a b;c.mp4", self.folder).name, "a_b_c.mp4")
        self.assertEqual(upload_path("....mp4", self.folder).name, "video.mp4")

    def test_does_not_reuse_a_name_taken_by_another_video(self):
        (self.folder / "trip.mov").write_bytes(b"x")
        # 拡張子が違っても、パネルの ID は名前で決まるので重ねない
        self.assertEqual(upload_path("trip.mp4", self.folder).name, "trip-2.mp4")
        (self.folder / "trip-2.mp4").write_bytes(b"x")
        self.assertEqual(upload_path("trip.MOV", self.folder).name, "trip-3.mov")

    def test_rejects_other_files(self):
        for name in ("photo.jpg", "movie", ""):
            with self.subTest(name=name), self.assertRaises(UploadError) as ctx:
                upload_path(name, self.folder)
            self.assertEqual(ctx.exception.status, 415)


class SaveUploadTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dest = Path(tmp.name) / "input" / "trip.mp4"

    def save(self, size, *parts):
        asyncio.run(save_upload(_chunks(*parts), size, self.dest))

    def test_writes_the_file_when_complete(self):
        self.save(6, b"abc", b"def")
        self.assertEqual(self.dest.read_bytes(), b"abcdef")
        self.assertEqual(list(self.dest.parent.glob("*.part")), [])

    def test_leaves_nothing_when_the_upload_is_cut_short(self):
        with self.assertRaises(UploadError):
            self.save(10, b"abc")
        self.assertFalse(self.dest.exists())
        self.assertEqual(list(self.dest.parent.glob("*")), [])

    def test_rejects_more_data_than_announced(self):
        with self.assertRaises(UploadError):
            self.save(2, b"abc")
        self.assertEqual(list(self.dest.parent.glob("*")), [])

    def test_rejects_unknown_or_too_large_sizes(self):
        for size, status in ((None, 411), (MAX_UPLOAD_BYTES + 1, 413)):
            with self.subTest(size=size), self.assertRaises(UploadError) as ctx:
                self.save(size, b"")
            self.assertEqual(ctx.exception.status, status)


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class AnalyzeVideoTest(unittest.TestCase):
    def test_explains_files_that_are_not_videos(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fake.mp4"
            path.write_bytes(b"not a video")
            with self.assertRaises(AnalysisError) as ctx:
                analyze_video(path)
        self.assertIn("動画として読み取れませんでした", str(ctx.exception))

    def test_explains_videos_that_are_not_setlog_exports(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "plain.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2",
                            "-pix_fmt", "yuv420p", str(path)], check=True)
            with self.assertRaises(AnalysisError) as ctx:
                analyze_video(path)
        self.assertIn("Setlogの書き出し動画として読み取れませんでした", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
