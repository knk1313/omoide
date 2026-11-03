import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setlog_join import cache
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip


def _fake_scan(info: VideoInfo) -> VideoScan:
    panels = [Panel(position=i, x=60, y=112 + i * 708, width=1160, height=634) for i in range(3)]
    return VideoScan(
        info=info,
        panels=panels,
        clips=[
            ScannedClip(Clip(1, 0.0, 2.066666666666667), [panels[0]]),
            ScannedClip(Clip(2, 2.066666666666667, 4.0), [panels[1], panels[2]]),
        ],
    )


class LoadOrScanTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.video = Path(tmp.name) / "setlog.mov"
        self.video.write_bytes(b"video")
        self.cache_dir = Path(tmp.name) / "cache"
        self.info = VideoInfo(self.video, 4.0, 30.0, 1280, 2274, None)
        patcher = mock.patch.object(cache, "scan_video", side_effect=_fake_scan)
        self.scan_video = patcher.start()
        self.addCleanup(patcher.stop)

    def test_reuses_saved_result(self):
        first = cache.load_or_scan(self.info, self.cache_dir)
        second = cache.load_or_scan(self.info, self.cache_dir)
        self.assertEqual(self.scan_video.call_count, 1)
        self.assertEqual(second, first)

    def test_rescans_when_video_changes(self):
        cache.load_or_scan(self.info, self.cache_dir)
        self.video.write_bytes(b"replaced video")
        cache.load_or_scan(self.info, self.cache_dir)
        self.assertEqual(self.scan_video.call_count, 2)

    def test_rescans_when_only_mtime_changes(self):
        cache.load_or_scan(self.info, self.cache_dir)
        stat = self.video.stat()
        os.utime(self.video, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
        cache.load_or_scan(self.info, self.cache_dir)
        self.assertEqual(self.scan_video.call_count, 2)

    def test_rescans_when_version_changes(self):
        cache.load_or_scan(self.info, self.cache_dir)
        with mock.patch.object(cache, "CACHE_VERSION", cache.CACHE_VERSION + 1):
            cache.load_or_scan(self.info, self.cache_dir)
        self.assertEqual(self.scan_video.call_count, 2)

    def test_rescans_when_cache_is_broken(self):
        cache.load_or_scan(self.info, self.cache_dir)
        for path in self.cache_dir.iterdir():
            path.write_text("{broken")
        result = cache.load_or_scan(self.info, self.cache_dir)
        self.assertEqual(self.scan_video.call_count, 2)
        self.assertEqual(result, _fake_scan(self.info))


if __name__ == "__main__":
    unittest.main()
