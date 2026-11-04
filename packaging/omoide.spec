# PyInstaller の設定。packaging/build.py から呼ぶ（直接は使わない）。
# 1 つのフォルダ（onedir）に、Python 本体・omoide のコード・ライブラリ・画面（web/dist）・ffmpeg と ffprobe をまとめる。
# onefile にしないのは、起動のたびに一時フォルダへ展開せずに済み、起動が速く、ウイルス対策ソフトにも止められにくいため。
# macOS では、それを omoide.app（アプリのバンドル）にまとめる。ターミナルを出さずに起動し、Dock にアイコンが出る。
# ruff: noqa
import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent
FFMPEG = Path(SPECPATH) / "build" / "ffmpeg"
MAC = sys.platform == "darwin"

analysis = Analysis(
    [str(ROOT / "main.py")],
    pathex=[str(ROOT)],
    # 画面は、コードから見た相対の位置（web/dist）に置く。setlog_join/server.py の WEB_DIST がそのまま使える
    datas=[(str(ROOT / "web" / "dist"), "web/dist")],
    binaries=[(str(p), "ffmpeg") for p in sorted(FFMPEG.iterdir()) if p.name.split(".")[0] in ("ffmpeg", "ffprobe")],
    # uvicorn は、使う部品を文字列で指定して読み込むので、PyInstaller が見つけられるよう明示する
    hiddenimports=collect_submodules("uvicorn") + (["AppKit", "PyObjCTools.AppHelper"] if MAC else []),
    excludes=["tkinter", "unittest", "pydoc", "test"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
exe = EXE(
    pyz,
    analysis.scripts,
    # 文字コードを UTF-8 に固定する（Windows で出力をファイルやパイプに流したとき、日本語や QR コードの記号で落ちないように）
    [("X utf8_mode=1", None, "OPTION")],
    exclude_binaries=True,
    name="omoide",
    # Windows・Linux は、ターミナルから serve などのコマンドも使えるよう、コンソールのアプリのままにする。
    # macOS は .app にするのでコンソールを出さない（中の実行ファイルをターミナルから呼べば、コマンドも使える）
    console=not MAC,
    upx=False,
)
collected = COLLECT(exe, analysis.binaries, analysis.datas, strip=False, upx=False, name="omoide")
if MAC:
    version = os.environ.get("OMOIDE_VERSION", "0.0.0")
    BUNDLE(
        collected,
        name="omoide.app",
        icon=str(Path(SPECPATH) / "build" / "omoide.icns"),
        bundle_identifier="io.github.knk1313.omoide",
        version=version,
        info_plist={
            "CFBundleName": "omoide",
            "CFBundleDisplayName": "omoide",
            "CFBundleShortVersionString": version,
            "CFBundleDevelopmentRegion": "ja",
            "LSApplicationCategoryType": "public.app-category.video",
            "NSHighResolutionCapable": True,
        },
    )
