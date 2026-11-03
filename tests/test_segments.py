import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

from setlog_join.probe import probe
from setlog_join.segments import detect_clips, split_video

FPS = 30


def _diffs_with_cuts(cut_frames: list[int], frame_count: int) -> np.ndarray:
    rng = np.random.default_rng(0)
    diffs = rng.uniform(0, 2, frame_count)
    diffs[0] = 0
    diffs[cut_frames] = 50
    return diffs


class DetectClipsTest(unittest.TestCase):
    def test_finds_cuts_that_drift_from_two_seconds(self):
        cuts = [62, 118, 181, 240]  # 2.07s, 1.87s, 2.10s, 1.97s
        clips = detect_clips(_diffs_with_cuts(cuts, 300), FPS)
        self.assertEqual([round(c.start * FPS) for c in clips], [0, *cuts])
        self.assertEqual(round(clips[-1].end * FPS), 300)

    def test_short_video_is_one_clip(self):
        clips = detect_clips(_diffs_with_cuts([], 45), FPS)
        self.assertEqual(len(clips), 1)
        self.assertAlmostEqual(clips[0].end, 1.5)


@unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg が必要")
class SplitVideoTest(unittest.TestCase):
    def test_splits_generated_video(self):
        lengths = [2.1, 1.9, 2.0, 2.2]
        colors = ["red", "blue", "green", "white"]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.mp4"
            inputs = []
            for color, length in zip(colors, lengths):
                inputs += ["-f", "lavfi", "-i", f"color=c={color}:s=320x240:r={FPS}:d={length}"]
            n = len(colors)
            filter_ = "".join(f"[{i}:v]" for i in range(n)) + f"concat=n={n}:v=1:a=0"
            subprocess.run(
                ["ffmpeg", "-v", "error", *inputs, "-filter_complex", filter_, "-pix_fmt", "yuv420p", str(path)],
                check=True,
            )
            clips = split_video(probe(path))

        self.assertEqual(len(clips), 4)
        for clip, length in zip(clips, lengths):
            self.assertAlmostEqual(clip.duration, length, delta=1 / FPS)


if __name__ == "__main__":
    unittest.main()
