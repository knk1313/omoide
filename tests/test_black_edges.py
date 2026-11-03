import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from setlog_join.panels import MAX_BLACK_EDGE_FRAMES, Panel, black_edges
from setlog_join.probe import probe
from setlog_join.scan import scan_video

# 元の解像度 640x1080 に 640x360 のパネルが 3 段。縮小フレームは 64x36
PANELS = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]


def _small_frames(count: int, black: dict[int, list[int]]) -> np.ndarray:
    """black[位置] のフレームだけ、そのパネルを真っ黒にした縮小フレーム。"""
    frames = np.full((count, 36, 64), 120, dtype=np.uint8)
    for position, indexes in black.items():
        for i in indexes:
            frames[i, position * 12:(position + 1) * 12, :] = 0
    return frames


class BlackEdgesTest(unittest.TestCase):
    def edges(self, frames: np.ndarray, position: int, start: int = 0, end: int | None = None):
        return black_edges(frames, PANELS[position], 640, 1080, start, end or len(frames))

    def test_counts_black_frames_at_tail_and_head(self):
        frames = _small_frames(60, {1: [59], 2: [0, 1]})
        self.assertEqual(self.edges(frames, 0), (0, 0))
        self.assertEqual(self.edges(frames, 1), (0, 1))
        self.assertEqual(self.edges(frames, 2), (2, 0))

    def test_ignores_black_frames_in_the_middle(self):
        frames = _small_frames(60, {0: [30, 31]})
        self.assertEqual(self.edges(frames, 0), (0, 0))

    def test_looks_only_inside_the_clip(self):
        # 前のクリップの最後のフレームが黒くても、このクリップには関係しない
        frames = _small_frames(120, {0: [59, 119]})
        self.assertEqual(self.edges(frames, 0, 60, 120), (0, 1))

    def test_does_not_trim_dark_footage_beyond_the_limit(self):
        frames = _small_frames(60, {0: list(range(60))})
        limit = MAX_BLACK_EDGE_FRAMES
        self.assertEqual(self.edges(frames, 0), (limit, limit))


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class ScanVideoBlackEdgeTest(unittest.TestCase):
    def test_trims_the_black_last_frame_of_one_panel(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "layout.mp4"
            # 黒背景に余白付きのカードを 3 段。中のカードだけ、最後のフレーム (59) が真っ黒
            inputs, chains = [], []
            for i in range(3):
                inputs += ["-f", "lavfi", "-i", "testsrc2=s=600x340:r=30:d=2"]
                black = ",drawbox=c=black:t=fill:enable='eq(n,59)'" if i == 1 else ""
                chains.append(f"[{i}:v]pad=640:380:20:20:black{black}[p{i}]")
            graph = ";".join(chains) + ";[p0][p1][p2]vstack=inputs=3"
            subprocess.run(
                ["ffmpeg", "-v", "error", *inputs, "-filter_complex", graph, "-pix_fmt", "yuv420p", str(path)],
                check=True,
            )
            info = probe(path)
            scan = scan_video(info)

        self.assertEqual(len(scan.clips), 1)
        scanned = scan.clips[0]
        self.assertEqual(len(scanned.filled), 3)
        self.assertEqual(scanned.black_edges, {1: (0, 1)})
        middle = scan.panel_clip(scanned, scan.panels[1])
        self.assertAlmostEqual(middle.end, 59 / 30)
        self.assertEqual(scan.panel_clip(scanned, scan.panels[0]), scanned.clip)


if __name__ == "__main__":
    unittest.main()
