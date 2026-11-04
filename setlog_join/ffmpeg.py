"""ffmpeg の呼び出しをまとめる。"""

import subprocess

import numpy as np

from .runtime import tool


def run(*args: str) -> bytes:
    result = subprocess.run([tool("ffmpeg"), "-v", "error", *args], capture_output=True, check=True)
    return result.stdout


def gray_frames(*input_args: str, width: int, height: int) -> np.ndarray:
    """入力オプションを受け取り、width x height に縮小したグレースケールのフレーム列 (n, height, width) を返す。"""
    # accurate_rnd が無いと、x86_64 の高速な変換で黒が 0 ではなく 7 前後になり、
    # 黒・背景・空カードを輝度で見分けるしきい値が CPU によって効かなくなる
    scale = f"scale={width}:{height}:flags=bicubic+accurate_rnd,format=gray"
    raw = run(*input_args, "-vf", scale, "-f", "rawvideo", "-")
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, height, width)
