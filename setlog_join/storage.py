"""データの保存先（動画・完成版・作業用ファイル）。

- 開発環境: 今いるフォルダの input/・output/・.setlog-join/ に置く。変えられない
- 単体アプリ: 実行ファイルと同じフォルダの omoide-settings.json に保存先を書く。書いていなければ、同じフォルダの
  input/・output/・.setlog-join/ に置く

画面で保存先を変えると、すぐには移さず「次の起動で移す」予定（pending）として書いておく。
次に起動したとき、使い始める前にファイルを新しい場所へ移す（使っている最中のファイルを動かさないため）。
"""

import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from . import runtime

SETTINGS_NAME = "omoide-settings.json"
SETTINGS_VERSION = 1
# フォルダを Git で残すための空ファイル。数えず、消さず、移さない
KEEP = frozenset({".gitkeep"})

# 画面に出す名前
LABELS = {"input": "動画", "output": "完成版", "work": "作業用ファイル"}


class StorageError(ValueError):
    """保存先として使えない。メッセージは利用者向け（次に取る操作を書く）。"""


@dataclass(frozen=True)
class Storage:
    input: Path
    output: Path
    # 作業用ファイル（キャッシュ・サムネイル・単体再生用のクリップ・プレビュー・選んだ内容）
    work: Path

    @property
    def cache(self) -> Path:
        return self.work / "cache"

    @property
    def thumbnails(self) -> Path:
        return self.work / "thumbnails"

    @property
    def clips(self) -> Path:
        return self.work / "clips"

    @property
    def previews(self) -> Path:
        return self.work / "previews"

    @property
    def project(self) -> Path:
        return self.work / "projects" / "project.json"

    def folders(self) -> dict[str, Path]:
        return {"input": self.input, "output": self.output, "work": self.work}

    def to_json(self) -> dict[str, str]:
        return {key: str(path) for key, path in self.folders().items()}


def default_storage(base: Path) -> Storage:
    return Storage(input=base / "input", output=base / "output", work=base / ".setlog-join")


def settings_path() -> Path | None:
    """保存先を書くファイル。開発環境では使わない（None）。"""
    return runtime.app_dir() / SETTINGS_NAME if runtime.FROZEN else None


def editable() -> bool:
    """画面から保存先を変えられるか（単体アプリだけ）。"""
    return settings_path() is not None


def _read(path: Path | None) -> dict:
    if path is None or not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"version": SETTINGS_VERSION, **data}, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _parse(value: object, fallback: Storage) -> Storage:
    if not isinstance(value, dict):
        return fallback
    try:
        return Storage(**{key: Path(value[key]) for key in ("input", "output", "work")})
    except (KeyError, TypeError):
        return fallback


def current() -> Storage:
    """今使っている保存先。"""
    base = runtime.app_dir() if runtime.FROZEN else Path.cwd()
    return _parse(_read(settings_path()).get("storage"), default_storage(base))


def pending() -> Storage | None:
    """次の起動で移す予定の保存先。"""
    value = _read(settings_path()).get("pending")
    return _parse(value, current()) if value else None


def presets() -> list[dict[str, str]]:
    """画面に出す、よく使う場所。選ぶと 3 つの保存先をその下にまとめて置く。"""
    home = Path.home()
    movies = home / ("Movies" if sys.platform == "darwin" else "Videos")
    items = [
        ("アプリのフォルダ", runtime.app_dir()),
        ("ムービー" if sys.platform == "darwin" else "ビデオ", movies / "omoide"),
        ("書類" if sys.platform == "darwin" else "ドキュメント", home / "Documents" / "omoide"),
    ]
    return [{"label": label, **default_storage(base).to_json()} for label, base in items]


def usage(folder: Path) -> dict[str, int]:
    """フォルダの中のファイルの数と大きさ（.gitkeep は数えない）。"""
    count = size = 0
    if folder.is_dir():
        for path in folder.rglob("*"):
            if path.is_file() and not path.is_symlink() and path.name not in KEEP:
                count += 1
                size += path.stat().st_size
    return {"count": count, "bytes": size}


def _inside(path: Path, other: Path) -> bool:
    return path == other or other in path.parents


def _nearest_existing(path: Path) -> Path:
    while not path.exists() and path != path.parent:
        path = path.parent
    return path


def validate(new: dict[str, str], now: Storage) -> Storage:
    """画面で入力した保存先を確かめる。使えなければ StorageError。"""
    folders: dict[str, Path] = {}
    for key, label in LABELS.items():
        raw = (new.get(key) or "").strip()
        if not raw:
            raise StorageError(f"{label}の保存先を入力してください")
        path = Path(raw).expanduser()
        if not path.is_absolute():
            raise StorageError(f"{label}の保存先は、/ から始まる場所（フルパス）で入力してください")
        folders[key] = Path(os.path.normpath(path))

    keys = list(folders)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if _inside(folders[a], folders[b]) or _inside(folders[b], folders[a]):
                raise StorageError(f"{LABELS[a]}と{LABELS[b]}は、別々のフォルダにしてください（同じフォルダや、片方の中には置けません）")

    if runtime.FROZEN and any(_inside(p, runtime.bundle_dir()) for p in folders.values()):
        raise StorageError("アプリの部品のフォルダ（_internal）の中には置けません。別のフォルダを選んでください")

    old = now.folders()
    needed = 0
    for key, path in folders.items():
        if path == old[key]:
            continue
        label = LABELS[key]
        if path.exists() and not path.is_dir():
            raise StorageError(f"{label}の保存先「{path}」はファイルです。フォルダを選んでください")
        if path.is_dir() and any(p.name not in KEEP for p in path.iterdir()):
            raise StorageError(f"{label}の保存先「{path}」は空ではありません。空のフォルダか、まだないフォルダを選んでください")
        parent = _nearest_existing(path)
        if not os.access(parent, os.W_OK):
            raise StorageError(f"{label}の保存先「{path}」には書き込めません。書き込めるフォルダを選んでください")
        needed += usage(old[key])["bytes"]

    target = _nearest_existing(next(iter(folders.values())))
    if needed and shutil.disk_usage(target).free < needed:
        raise StorageError("移す先の空き容量が足りません。空きのある場所を選んでください")
    return Storage(**folders)


def save_pending(new: Storage) -> None:
    path = settings_path()
    if path is None:
        raise StorageError("開発環境では、保存先を変えられません")
    data = _read(path)
    data["storage"] = current().to_json()
    if new == current():
        data.pop("pending", None)
    else:
        data["pending"] = new.to_json()
    _write(path, data)


def cancel_pending() -> None:
    path = settings_path()
    if path is None:
        return
    data = _read(path)
    data.pop("pending", None)
    data.setdefault("storage", current().to_json())
    _write(path, data)


def _move_contents(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    if not src.is_dir():
        return
    for child in src.iterdir():
        if child.name in KEEP:
            continue
        shutil.move(str(child), str(dst / child.name))
    # 元のフォルダは、空になって .gitkeep もなければ消す
    if not any(src.iterdir()):
        src.rmdir()


def apply_pending(report=print) -> Storage:
    """次の起動で移す予定があれば、ファイルを新しい場所へ移してから、その保存先を使い始める。"""
    target = pending()
    now = current()
    path = settings_path()
    if target is None or path is None:
        return now
    for key, src in now.folders().items():
        dst = target.folders()[key]
        if dst == src:
            continue
        report(f"{LABELS[key]}を移しています: {src} → {dst}")
        _move_contents(src, dst)
    _write(path, {"storage": target.to_json()})
    report("保存先を変えました。")
    return target


def contents(storage: Storage) -> list[Path]:
    """「データを消す」で消すもの。動画と完成版のフォルダの中身（.gitkeep を除く）と、作業用ファイルのフォルダ全体。"""
    paths: list[Path] = []
    for folder in (storage.input, storage.output):
        if folder.is_dir():
            paths += sorted(p for p in folder.iterdir() if p.name not in KEEP)
    if storage.work.is_dir():
        paths.append(storage.work)
    return paths

