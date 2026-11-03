import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from setlog_join.ffmpeg import gray_frames
from setlog_join.join import PREVIEW_QUALITY, PanelRef, Quality, Segment, SelectionError, join_segments, resolve_segments
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo, probe
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip


def _panels(width: int = 640, height: int = 360) -> list[Panel]:
    return [Panel(position=i, x=0, y=i * height, width=width, height=height) for i in range(3)]


def _scan(name: str, filled_by_clip: list[list[int]]) -> VideoScan:
    """filled_by_clip[i] はクリップ i+1 で中身のあるパネルの位置 (0〜2)。"""
    panels = _panels()
    info = VideoInfo(Path(f"/videos/{name}.mov"), 2.0 * len(filled_by_clip), 30.0, 640, 1080, None)
    clips = [
        ScannedClip(Clip(i + 1, i * 2.0, (i + 1) * 2.0), [panels[p] for p in filled])
        for i, filled in enumerate(filled_by_clip)
    ]
    return VideoScan(info=info, panels=panels, clips=clips)


def _ids(segments: list[Segment]) -> list[str]:
    return [f"{s.info.path.stem}/{s.clip.index:03d}-{s.panel.position + 1}" for s in segments]


class PanelRefTest(unittest.TestCase):
    def test_parses_export_file_name(self):
        ref = PanelRef.parse(" collection_export/002-3 ")
        self.assertEqual(ref, PanelRef("collection_export", 2, 3))
        self.assertEqual(str(ref), "collection_export/002-3")

    def test_rejects_malformed(self):
        for text in ("collection_export", "collection_export/002", "/002-3", "a/b-c"):
            with self.subTest(text=text), self.assertRaises(SelectionError):
                PanelRef.parse(text)


class ResolveSegmentsTest(unittest.TestCase):
    def setUp(self):
        self.scans = [_scan("sep", [[0, 2], [1]]), _scan("oct", [[2], [0]])]

    def test_defaults_to_all_filled_panels_grouped_by_person(self):
        segments = resolve_segments(self.scans, None)
        self.assertEqual(
            _ids(segments),
            ["sep/001-1", "oct/002-1", "sep/002-2", "sep/001-3", "oct/001-3"],
        )

    def test_orders_selection_by_person_then_time(self):
        refs = [PanelRef.parse(t) for t in ("oct/001-3", "sep/001-3", "oct/002-1", "sep/001-3")]
        self.assertEqual(_ids(resolve_segments(self.scans, refs)), ["oct/002-1", "sep/001-3", "oct/001-3"])

    def test_reports_every_unusable_selection(self):
        refs = [PanelRef.parse(t) for t in ("nov/001-1", "sep/009-1", "sep/001-4", "sep/001-2", "sep/001-1")]
        with self.assertRaises(SelectionError) as ctx:
            resolve_segments(self.scans, refs)
        self.assertEqual(len(ctx.exception.problems), 4)

    def test_fails_without_filled_panels(self):
        with self.assertRaises(SelectionError):
            resolve_segments([_scan("empty", [[], []])], None)


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class JoinSegmentsTest(unittest.TestCase):
    def test_joins_with_speed_and_fits_different_sizes(self):
        with tempfile.TemporaryDirectory() as tmp:
            # 1 本目は 640x360 のパネルが 3 段、2 本目は正方形 360x360 のパネルが 3 段
            first = self._stacked(Path(tmp) / "first.mp4", "640x360", ["red", "green", "blue"])
            second = self._stacked(Path(tmp) / "second.mp4", "360x360", ["white", "white", "yellow"])
            segments = [
                Segment(first, Clip(1, 0.0, 1.0), _panels()[0]),
                Segment(second, Clip(1, 0.0, 1.0), _panels(360, 360)[2]),
            ]
            out = Path(tmp) / "out" / "joined.mp4"
            join_segments(segments, 2.0, out)

            result = probe(out)
            self.assertEqual((result.width, result.height), (640, 360))
            self.assertAlmostEqual(result.duration, 1.0, delta=0.1)
            self.assertColor(self._pixel(out, 0.2, 320, 180), (255, 0, 0))
            self.assertColor(self._pixel(out, 0.8, 320, 180), (255, 255, 0))
            # 正方形のパネルは左右を黒で埋める
            self.assertColor(self._pixel(out, 0.8, 20, 180), (0, 0, 0))

    def test_preview_quality_shrinks_and_reports_progress(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = self._stacked(Path(tmp) / "first.mp4", "640x360", ["red", "green", "blue"])
            segments = [Segment(first, Clip(1, 0.0, 1.0), _panels()[0]), Segment(first, Clip(2, 1.0, 2.0), _panels()[1])]
            out = Path(tmp) / "preview.mp4"
            seen = []
            join_segments(segments, 1.0, out, quality=PREVIEW_QUALITY, progress=seen.append)
            result = probe(out)
            data = out.read_bytes()
        # 幅 960 が上限なので、640x360 のパネルはそのままの大きさ
        self.assertEqual((result.width, result.height), (640, 360))
        self.assertEqual(seen, sorted(seen))
        self.assertEqual(seen[-1], 1.0)
        self.assertEqual(len(seen), 3)
        # つないだ後の動画も、目次が先頭にある
        self.assertLess(data.find(b"moov"), data.find(b"mdat"))

    def test_shrinking_leaves_no_black_edges(self):
        # 縦横比を保つ縮め方では丸めで 1px 足りず、端に黒い線が入っていた
        with tempfile.TemporaryDirectory() as tmp:
            src = self._stacked(Path(tmp) / "wide.mp4", "1160x634", ["white", "white", "white"])
            panel = Panel(position=0, x=0, y=0, width=1160, height=634)
            out = Path(tmp) / "small.mp4"
            join_segments([Segment(src, Clip(1, 0.0, 1.0), panel)], 1.0, out,
                          quality=Quality(max_width=480, encoder_args=()))
            frame = gray_frames("-i", str(out), "-frames:v", "1", width=480, height=262)[0]
        self.assertGreater(frame[:, -1].min(), 200)
        self.assertGreater(frame[-1, :].min(), 200)

    def test_rejects_unknown_speed(self):
        with self.assertRaises(ValueError):
            join_segments([], 3.0, Path("unused.mp4"))

    def _stacked(self, path: Path, size: str, colors: list[str]) -> VideoInfo:
        inputs = []
        for color in colors:
            inputs += ["-f", "lavfi", "-i", f"color=c={color}:s={size}:r=30:d=2"]
        subprocess.run(
            ["ffmpeg", "-v", "error", *inputs, "-filter_complex", "vstack=inputs=3",
             "-pix_fmt", "yuv420p", str(path)],
            check=True,
        )
        return probe(path)

    def _pixel(self, path: Path, seconds: float, x: int, y: int) -> tuple[int, int, int]:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(seconds), "-i", str(path), "-frames:v", "1",
             "-vf", f"crop=2:2:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True, check=True,
        ).stdout
        return tuple(raw[:3])

    def assertColor(self, actual: tuple[int, int, int], expected: tuple[int, int, int]):
        for a, e in zip(actual, expected):
            self.assertAlmostEqual(a, e, delta=25, msg=f"{actual} != {expected}")


if __name__ == "__main__":
    unittest.main()
