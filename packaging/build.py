"""単体アプリ（OS ごとのフォルダ）を作り、zip にする。CI（.github/workflows/release.yml）と手元の両方で使う。

前提: 画面をビルドしてある（web/dist）、requirements-build.txt を入れてある、packaging/fetch_ffmpeg.py を実行してある。
使い方: python packaging/build.py
できるもの: packaging/dist/omoide-<OS>-<CPU>.zip（中は omoide/ フォルダ 1 つ）
"""

import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIST = HERE / "dist"
WORK = HERE / "build" / "pyinstaller"


def target() -> str:
    system = {"Darwin": "macos", "Windows": "windows", "Linux": "linux"}[platform.system()]
    machine = {"x86_64": "x64", "AMD64": "x64", "arm64": "arm64", "aarch64": "arm64"}[platform.machine()]
    return f"{system}-{machine}"


def notices() -> str:
    ffmpeg_source = (HERE / "build" / "ffmpeg" / "SOURCE.txt").read_text(encoding="utf-8")
    ffmpeg_license = HERE / "build" / "ffmpeg" / "LICENSE.txt"
    return "\n".join([
        "omoide に含まれる他のソフトウェア",
        "",
        "■ omoide",
        "MIT License（LICENSE.txt）。ソース: https://github.com/knk1313/omoide",
        "",
        "■ FFmpeg（ffmpeg/ffmpeg、ffmpeg/ffprobe）",
        "GNU General Public License（GPL）で配布されているビルドを、そのまま含めている。omoide は別のプログラムとして呼び出す。",
        "FFmpeg は FFmpeg の開発者の著作物で、omoide の作者のものではない。https://ffmpeg.org/legal.html",
        ffmpeg_source,
        "GPL の全文: https://www.gnu.org/licenses/gpl-3.0.html"
        + ("（ビルドに付いていた LICENSE.txt も ffmpeg/ に含めている）" if ffmpeg_license.is_file() else ""),
        "",
        "■ Python とライブラリ",
        "Python（PSF License）、FastAPI・Starlette・Pydantic・uvicorn（MIT／BSD）、NumPy（BSD）、qrcode（BSD）などを含む。",
        "各ライブラリのライセンスは、それぞれの配布元（PyPI）を参照。",
        "",
    ])


HOW_TO_START = """omoide の起動のしかた

1. このフォルダの「omoide」（Windows は「omoide.exe」）をダブルクリックする
2. 開いた窓で、スマホで入力するパスワードを決めて入力する
3. 表示された QR コードを、同じ Wi-Fi につないだスマホのカメラで読み取る

■ Mac で「開けません」と出たとき
署名していないアプリのため、最初の 1 回だけ止められる。
「システム設定」→「プライバシーとセキュリティ」の下の方にある「このまま開く」を押し、もう一度「開く」を押す。

■ Windows で「Windows によって PC が保護されました」と出たとき
「詳細情報」→「実行」を押す。ファイアウォールの確認が出たら「プライベート ネットワーク」を許可する。

取り込んだ動画と作った動画は、このフォルダの input・output に置かれる。
詳しくは https://github.com/knk1313/omoide を参照。
"""


def main() -> None:
    if not (ROOT / "web" / "dist" / "index.html").is_file():
        sys.exit("画面がビルドされていません。cd web && npm ci && npm run build を実行してください")
    if not any((HERE / "build" / "ffmpeg").glob("ffmpeg*")):
        sys.exit("ffmpeg がありません。python packaging/fetch_ffmpeg.py を実行してください")

    shutil.rmtree(DIST, ignore_errors=True)
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--distpath", str(DIST), "--workpath", str(WORK),
         str(HERE / "omoide.spec")],
        check=True,
    )
    app = DIST / "omoide"
    shutil.copy2(ROOT / "LICENSE", app / "LICENSE.txt")
    (app / "THIRD_PARTY_NOTICES.txt").write_text(notices(), encoding="utf-8")
    (app / "起動のしかた.txt").write_text(HOW_TO_START, encoding="utf-8")
    for folder in ("input", "output"):
        (app / folder).mkdir(exist_ok=True)
    license_txt = HERE / "build" / "ffmpeg" / "LICENSE.txt"
    if license_txt.is_file():
        shutil.copy2(license_txt, app / "_internal" / "ffmpeg" / "LICENSE.txt")

    archive = DIST / f"omoide-{target()}.zip"
    # 実行の権限を保つため、zipfile で権限ごと書く（shutil.make_archive は Windows で作ると権限が落ちる）
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(app.rglob("*")):
            info = zipfile.ZipInfo.from_file(path, Path("omoide") / path.relative_to(app))
            if path.is_dir():
                zf.writestr(info, "")
            elif path.is_symlink():
                info.external_attr = (0o120777 << 16)
                zf.writestr(info, str(path.readlink()))
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
                with path.open("rb") as f:
                    zf.writestr(info, f.read())
    print(f"できた: {archive}（{archive.stat().st_size / 1e6:.0f}MB）")


if __name__ == "__main__":
    main()
