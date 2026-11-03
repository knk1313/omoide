"""入力動画と、そこから作った生成物（書き出し・キャッシュ・サムネイル・プレビュー・project.json）をまとめて消す。"""

import shutil
from dataclasses import dataclass
from pathlib import Path

WORK_DIR = Path(".setlog-join")
# フォルダを Git で残すための空ファイル。消さない
KEEP = frozenset({".gitkeep"})


@dataclass(frozen=True)
class Target:
    path: Path
    size: int


def _size(path: Path) -> int:
    if path.is_symlink() or path.is_file():
        return path.lstat().st_size
    return sum(p.lstat().st_size for p in path.rglob("*") if p.is_file() and not p.is_symlink())


def clean_targets(input_dir: Path, output_dir: Path, work_dir: Path = WORK_DIR) -> list[Target]:
    """消す対象。input/ と output/ の中身（.gitkeep を除く）と、作業用フォルダそのもの。"""
    paths: list[Path] = []
    for folder in (input_dir, output_dir):
        if folder.is_dir():
            paths += sorted(p for p in folder.iterdir() if p.name not in KEEP)
    if work_dir.is_dir():
        paths.append(work_dir)
    return [Target(p, _size(p)) for p in paths]


def remove(targets: list[Target]) -> None:
    for target in targets:
        if target.path.is_dir() and not target.path.is_symlink():
            shutil.rmtree(target.path)
        else:
            target.path.unlink(missing_ok=True)


def format_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"
