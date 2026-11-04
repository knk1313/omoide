"""単体アプリ（OS ごとのフォルダ）を作り、zip にする。CI（.github/workflows/release.yml）と手元の両方で使う。

前提: 画面をビルドしてある（web/dist）、requirements-build.txt を入れてある、packaging/fetch_ffmpeg.py を実行してある。
使い方: python packaging/build.py
できるもの: packaging/dist/omoide-<OS>-<CPU>.zip（中は omoide/ フォルダ 1 つ）
"""

import platform
import shutil
import subprocess
import sys
import tempfile
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

■ Mac で初めて開く前に（1 回だけ）
Apple の確認（公証）を受けていないアプリなので、ダウンロードしたままだと「壊れているため開けません」などと出て開けない。
「ターミナル」を開き、次の 1 行を入力して Enter を押す（omoide フォルダを「ダウンロード」に展開した場合）。
フォルダを別の場所に置いたときは、最後の ~/Downloads/omoide の代わりに、omoide フォルダをターミナルへドラッグ＆ドロップする。

    xattr -dr com.apple.quarantine ~/Downloads/omoide

これで、ダウンロードしたファイルに付く印が外れ、ダブルクリックで開ける。

■ Windows で「Windows によって PC が保護されました」と出たとき
「詳細情報」→「実行」を押す。ファイアウォールの確認が出たら「プライベート ネットワーク」を許可する。

取り込んだ動画と作った動画は、このフォルダの input・output に置かれる。
詳しくは https://github.com/knk1313/omoide を参照。
"""


def fix_signatures(app: Path) -> None:
    """macOS: 含めた Python.framework を署名し直し、中の部品の署名がすべて正しいことを確かめる。

    PyInstaller は Python 本体を Python.framework の中から取り出して入れるが、元の署名はフレームワークの
    ほかのファイル（_CodeSignature）も対象にしているため、そのままだと署名が壊れた状態になる。ダウンロードした
    アプリの署名が壊れていると、macOS は「壊れているため開けません」と出して開かせない。
    Apple の確認（公証）は受けていないので、署名はアドホック（-）にする。
    """
    for framework in app.rglob("*.framework"):
        for version in (framework / "Versions").iterdir():
            if version.is_dir() and not version.is_symlink():
                subprocess.run(["codesign", "--force", "--sign", "-", str(version)], check=True, capture_output=True)
    invalid = [str(p.relative_to(app)) for p in macho_files(app) if not signature_valid(p)]
    if invalid:
        sys.exit("署名が正しくない部品があります:\n" + "\n".join(invalid))


def macho_files(app: Path) -> list[Path]:
    """Mach-O（実行ファイル・ライブラリ）のファイル。先頭の 4 バイトで見分ける。"""
    magics = {b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xce\xfa\xed\xfe"}
    found = []
    for path in app.rglob("*"):
        if path.is_file() and not path.is_symlink():
            with path.open("rb") as f:
                if f.read(4) in magics:
                    found.append(path)
    return found


def signature_valid(path: Path) -> bool:
    return subprocess.run(["codesign", "--verify", "--strict", str(path)], capture_output=True).returncode == 0


def verify_zip(archive: Path) -> None:
    """作った zip を、利用者と同じ方法で展開し直し、リンクがすべて行き先を持つかを確かめる（macOS・Linux）。

    macOS は Finder のアーカイブユーティリティと同じ ditto、Linux は unzip で展開する。Windows はリンクを使わないので確かめない。
    macOS では、展開した後の部品の署名も確かめる。
    """
    system = platform.system()
    if system == "Windows":
        return
    with tempfile.TemporaryDirectory() as tmp:
        command = ["ditto", "-x", "-k", str(archive), tmp] if system == "Darwin" else ["unzip", "-q", str(archive), "-d", tmp]
        subprocess.run(command, check=True)
        extracted = Path(tmp) / "omoide"
        broken = [str(p.relative_to(extracted)) for p in extracted.rglob("*") if p.is_symlink() and not p.exists()]
        if broken:
            sys.exit("zip を展開すると、行き先のないリンクがあります:\n" + "\n".join(broken))
        if system == "Darwin":
            invalid = [str(p.relative_to(extracted)) for p in macho_files(extracted) if not signature_valid(p)]
            if invalid:
                sys.exit("zip を展開すると、署名が正しくない部品があります:\n" + "\n".join(invalid))


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
    if platform.system() == "Darwin":
        fix_signatures(app)
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
            name = Path("omoide") / path.relative_to(app)
            # リンクは、フォルダを指していてもリンクのまま入れる（先に is_dir で判定すると、空のフォルダになってしまう。
            # Python.framework の Versions/Current と Resources がこれに当たり、v0.1.1 では壊れていた）
            if path.is_symlink():
                info = zipfile.ZipInfo(str(name))
                info.create_system = 3  # Unix（リンクの印を読む展開ソフトのため）
                info.external_attr = 0o120777 << 16
                zf.writestr(info, str(path.readlink()))
                continue
            info = zipfile.ZipInfo.from_file(path, name)
            if path.is_dir():
                zf.writestr(info, "")
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
                with path.open("rb") as f:
                    zf.writestr(info, f.read())
    verify_zip(archive)
    print(f"できた: {archive}（{archive.stat().st_size / 1e6:.0f}MB）")


if __name__ == "__main__":
    main()
