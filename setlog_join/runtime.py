"""単体アプリ（PyInstaller）として動いているかと、アプリに含めたファイルの場所。

開発環境では、ffmpeg・ffprobe は PATH から探し、データ（input/・output/・.setlog-join/）は今のフォルダに置く。
単体アプリでは、アプリに含めた ffmpeg・ffprobe を使い、データは実行ファイルと同じフォルダに置く。
Mac のアプリ（omoide.app）では、.app の中を書き換えないよう、設定は ~/Library/Application Support/omoide に、
データの既定は ~/Movies/omoide に置く（.app をアプリケーションのフォルダへ移しても、同じデータを使える）。
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


def app_bundle() -> Path | None:
    """Mac のアプリ（omoide.app）として動いているときの、.app のフォルダ。それ以外は None。"""
    if not (FROZEN and sys.platform == "darwin"):
        return None
    executable = Path(sys.executable).resolve()
    # omoide.app/Contents/MacOS/omoide
    bundle = executable.parent.parent.parent
    return bundle if bundle.suffix == ".app" and executable.parent.name == "MacOS" else None


def app_dir() -> Path:
    """単体アプリを置いたフォルダ（zip を展開したフォルダ）。開発環境では今のフォルダ。"""
    if not FROZEN:
        return Path.cwd()
    bundle = app_bundle()
    return bundle.parent if bundle else Path(sys.executable).resolve().parent


def settings_dir() -> Path:
    """単体アプリの設定（保存先）を書くフォルダ。"""
    if app_bundle():
        return Path.home() / "Library" / "Application Support" / "omoide"
    return app_dir()


def log_path() -> Path:
    """Mac のアプリ（.app）の出力を書くファイル。「コンソール」アプリの「ログレポート」からも見られる場所。"""
    return Path.home() / "Library" / "Logs" / "omoide" / "omoide.log"


def data_dir() -> Path:
    """データ（input/・output/・.setlog-join/）を置く既定の場所。"""
    if app_bundle():
        return Path.home() / "Movies" / "omoide"
    return app_dir()


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
