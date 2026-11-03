import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from setlog_join.export import export_panel_clip
from setlog_join.panels import Panel, detect_panels, is_empty
from setlog_join.probe import probe
from setlog_join.segments import Clip

# 実際の書き出し (1280x2274) と同じ配置の黒背景に、角丸カードを 3 段描く
WIDTH, HEIGHT = 1280, 2274
CARDS = [(90, 767), (799, 1475), (1507, 2184)]
LEFT, RIGHT, RADIUS = 39, 1241, 70
EMPTY_GRAY = 20


def _layout(fill) -> np.ndarray:
    frame = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH]
    for position, (y0, y1) in enumerate(CARDS):
        cx = np.clip(xs, LEFT + RADIUS, RIGHT - 1 - RADIUS)
        cy = np.clip(ys, y0 + RADIUS, y1 - 1 - RADIUS)
        inside = (xs >= LEFT) & (xs < RIGHT) & (ys >= y0) & (ys < y1) & ((xs - cx) ** 2 + (ys - cy) ** 2 <= RADIUS**2)
        frame[inside] = fill(position, ys[inside], xs[inside])
    return frame


def _empty_card(_position, ys, _xs):
    return np.full(ys.shape, EMPTY_GRAY, dtype=np.uint8)


class DetectPanelsTest(unittest.TestCase):
    def test_crops_inside_rounded_cards(self):
        frame = _layout(_empty_card)
        panels = detect_panels(frame)
        self.assertEqual(len(panels), 3)
        for panel, (y0, y1) in zip(panels, CARDS):
            region = panel.region(frame)
            self.assertTrue((region > 0).all(), "背景や角丸の黒が入っている")
            self.assertTrue(y0 < panel.y and panel.y + panel.height < y1)
            self.assertEqual((panel.x % 2, panel.y % 2, panel.width % 2, panel.height % 2), (0, 0, 0, 0))
            # 切り落としすぎていないこと
            self.assertGreater(panel.width, (RIGHT - LEFT) * 0.95)
            self.assertGreater(panel.height, (y1 - y0) * 0.93)

    def test_fails_when_not_three_cards(self):
        frame = _layout(_empty_card)
        frame[CARDS[2][0]:] = 0
        with self.assertRaises(ValueError):
            detect_panels(frame)


class IsEmptyTest(unittest.TestCase):
    def test_distinguishes_empty_and_filled_cards(self):
        rng = np.random.default_rng(0)

        def fill(position, ys, xs):
            if position == 1:
                return rng.integers(0, 256, ys.shape, dtype=np.uint8)
            card = np.full(ys.shape, EMPTY_GRAY, dtype=np.uint8)
            # 時刻と zZ の文字
            text = (abs(xs - WIDTH // 2) < 80) & (abs(ys - (CARDS[position][0] + 330)) < 30)
            card[text] = 255
            return card

        frame = _layout(fill)
        panels = detect_panels(frame)
        self.assertEqual([is_empty(frame, p) for p in panels], [True, False, True])


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class ExportPanelClipTest(unittest.TestCase):
    def test_exports_cropped_clip(self):
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "stacked.mp4"
            inputs = []
            for r, g, b in colors:
                inputs += ["-f", "lavfi", "-i", f"color=c=0x{r:02x}{g:02x}{b:02x}:s=640x360:r=30:d=2"]
            subprocess.run(
                ["ffmpeg", "-v", "error", *inputs, "-filter_complex", "vstack=inputs=3",
                 "-pix_fmt", "yuv420p", str(src)],
                check=True,
            )
            info = probe(src)
            panel = Panel(position=2, x=20, y=740, width=600, height=320)
            out = Path(tmp) / "out.mp4"
            export_panel_clip(info, Clip(index=1, start=0.5, end=1.5), panel, out)

            result = probe(out)
            self.assertEqual((result.width, result.height), (600, 320))
            self.assertAlmostEqual(result.duration, 1.0, delta=0.05)
            pixel = subprocess.run(
                ["ffmpeg", "-v", "error", "-i", str(out), "-frames:v", "1", "-vf", "scale=1:1",
                 "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                capture_output=True, check=True,
            ).stdout
            for actual, want in zip(pixel, colors[2]):
                self.assertAlmostEqual(actual, want, delta=20)


if __name__ == "__main__":
    unittest.main()
