"""ffmpeg の呼び出しをまとめる。"""

import subprocess

import numpy as np


def run(*args: str) -> bytes:
    result = subprocess.run(["ffmpeg", "-v", "error", *args], capture_output=True, check=True)
    return result.stdout


def gray_frames(*args: str, width: int, height: int) -> np.ndarray:
    """入力オプションと映像フィルタを受け取り、グレースケールのフレーム列 (n, height, width) を返す。"""
    raw = run(*args, "-f", "rawvideo", "-pix_fmt", "gray", "-")
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, height, width)
