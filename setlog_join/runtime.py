"""単体アプリ（PyInstaller）として動いているかと、アプリに含めたファイルの場所。

開発環境では、ffmpeg・ffprobe は PATH から探し、データ（input/・output/・.setlog-join/）は今のフォルダに置く。
単体アプリでは、アプリに含めた ffmpeg・ffprobe を使い、データは実行ファイルと同じフォルダに置く。
"""

import subprocess
import sys
from pathlib import Path

FROZEN = bool(getattr(sys, "frozen", False))


def bundle_dir() -> Path:
    """アプリに含めたファイルの置き場所。開発環境ではリポジトリのルート。"""
    if FROZEN:
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def app_dir() -> Path:
    """利用者のデータを置く場所。単体アプリでは実行ファイルと同じフォルダ（zip を展開したフォルダ）。"""
    return Path(sys.executable).resolve().parent if FROZEN else Path.cwd()


def tool(name: str) -> str:
    """ffmpeg・ffprobe の実行ファイル。アプリに含めたものがあればそれを、無ければ PATH の名前を返す。"""
    bundled = bundle_dir() / "ffmpeg" / (f"{name}.exe" if sys.platform == "win32" else name)
    return str(bundled) if bundled.is_file() else name


def allow_bundled_tools() -> None:
    """macOS で、ダウンロードしたアプリに付く「隔離」の印を、アプリに含めた ffmpeg・ffprobe から外す。

    利用者が「このまま開く」で許可するのは起動した実行ファイルだけで、中から呼ぶ ffmpeg は別に止められるため。
    外せなくても起動は続ける（その場合は ffmpeg を呼んだときにエラーになる）。
    """
    if not (FROZEN and sys.platform == "darwin"):
        return
    folder = bundle_dir() / "ffmpeg"
    if folder.is_dir():
        subprocess.run(["xattr", "-dr", "com.apple.quarantine", str(folder)], capture_output=True, check=False)
