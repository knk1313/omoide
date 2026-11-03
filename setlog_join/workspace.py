"""serve の間、解析結果と利用者の選択をまとめて持ち、API から読み書きする。

API ではパネルを ID で指定させ、ファイルのパスはここで ID から組み立てる。利用者にパスを指定させない。
"""

import hashlib
from datetime import date
import json
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path

from .cache import CACHE_VERSION, file_stamp, video_key
from .export import export_panel_clip
from .join import SPEEDS, PanelRef, Segment, SelectionError, resolve_segments
from .panels import Panel
from .project import PROJECT_PATH, Project, is_date, load_project, save_project
from .scan import ScannedClip, VideoScan
from .segments import Clip
from .thumbnails import THUMBNAIL_DIR, ensure_thumbnails

CLIP_DIR = Path(".setlog-join/clips")


@dataclass(frozen=True)
class PanelEntry:
    ref: PanelRef
    scan: VideoScan
    scanned: ScannedClip
    panel: Panel

    @property
    def id(self) -> str:
        return str(self.ref)

    @property
    def clip(self) -> Clip:
        """黒いフレームを除いた、このパネルで使う区間。"""
        return self.scan.panel_clip(self.scanned, self.panel)


class Workspace:
    def __init__(
        self,
        scans: list[VideoScan],
        project_path: Path = PROJECT_PATH,
        thumbnail_dir: Path = THUMBNAIL_DIR,
        clip_dir: Path = CLIP_DIR,
    ):
        self._project_path = project_path
        self._thumbnail_dir = thumbnail_dir
        self._clip_dir = clip_dir
        self.project = load_project(project_path)
        self.scans: list[VideoScan] = []
        self.entries: dict[str, PanelEntry] = {}
        # API はスレッドプールで並行に呼ばれるので、選択の更新と動画の生成をそれぞれ直列にする
        self._project_lock = threading.Lock()
        self._media_lock = threading.Lock()
        self._arrange(scans)

    def _arrange(self, scans: list[VideoScan]) -> None:
        """動画を撮影日の順に並べ、パネルを時系列の順 (動画 → クリップ → パネル) に並べ直す。"""
        ordered = sorted(scans, key=self._order_key)
        entries: dict[str, PanelEntry] = {}
        for scan in ordered:
            for scanned in scan.clips:
                for panel in scanned.filled:
                    entry = PanelEntry(PanelRef(scan.info.path.stem, scanned.clip.index, panel.position + 1),
                                       scan, scanned, panel)
                    entries[entry.id] = entry
        # 読み取り中の API に作りかけを見せないよう、作り終えてから差し替える
        self.scans, self.entries = ordered, entries

    def _order_key(self, scan: VideoScan) -> tuple[str, str, str]:
        name = scan.info.path.stem
        created = scan.info.created_at.isoformat() if scan.info.created_at else ""
        return (self.video_date(scan) or "9999-99-99", created, name)

    def video_date(self, scan: VideoScan) -> str | None:
        """撮影日。利用者が入力した日付を優先し、無ければ動画のメタデータの日付（端末のタイムゾーン）。"""
        return self.project.video_dates.get(scan.info.path.stem) or metadata_date(scan)

    def add_scan(self, scan: VideoScan) -> None:
        """serve の途中で取り込んだ動画を加える。同じ名前の動画があれば置き換える。"""
        with self._project_lock:
            others = [s for s in self.scans if s.info.path.stem != scan.info.path.stem]
            self._arrange([*others, scan])

    def remove_video(self, name: str) -> None:
        """取り込んだ動画を消す。元の動画ファイル・サムネイル・パネル単体の動画と、その動画の除外と撮影日の記録も消す。

        存在しない動画名なら KeyError。
        """
        with self._project_lock:
            scan = self.find_video(name)
            self._arrange([s for s in self.scans if s is not scan])
            self.project.excluded = {ref for ref in self.project.excluded if not ref.startswith(f"{name}/")}
            self.project.video_dates.pop(name, None)
            save_project(self.project, self._project_path)
        key = video_key(scan.info)
        shutil.rmtree(self._thumbnail_dir / key, ignore_errors=True)
        with self._media_lock:
            for folder in self._clip_dir.glob(f"{key}-*"):
                shutil.rmtree(folder, ignore_errors=True)
        scan.info.path.unlink(missing_ok=True)

    def find_video(self, name: str) -> VideoScan:
        """存在しない動画名なら KeyError。"""
        for scan in self.scans:
            if scan.info.path.stem == name:
                return scan
        raise KeyError(name)

    def set_video_date(self, name: str, value: str | None, today: date | None = None) -> None:
        """撮影日を入力する。None なら入力を消し、メタデータの日付に戻す。

        形が正しくない・明日以降なら ValueError、ほかの動画の撮影日と同じなら DateConflict。
        """
        scan = self.find_video(name)
        with self._project_lock:
            if value is not None:
                check_video_date(value, name, self.project.video_dates, today or date.today())
            if value is None:
                self.project.video_dates.pop(scan.info.path.stem, None)
            else:
                self.project.video_dates[scan.info.path.stem] = value
            save_project(self.project, self._project_path)
            self._arrange(self.scans)

    def find_same_file(self, path: Path) -> str | None:
        """取り込み済みの動画に、中身が同じファイルがあればその名前。"""
        target = file_fingerprint(path)
        for scan in self.scans:
            other = scan.info.path
            if other.resolve() != path.resolve() and other.is_file() and file_fingerprint(other) == target:
                return other.stem
        return None

    def video_json(self, scan: VideoScan) -> dict:
        return {
            "name": scan.info.path.stem,
            "created_at": scan.info.created_at.isoformat() if scan.info.created_at else None,
            # メタデータから読んだ撮影日。日付を入力するときの初期値に使う
            "metadata_date": metadata_date(scan),
            # 利用者が入力した撮影日。入力していなければ None
            "date": self.project.video_dates.get(scan.info.path.stem),
            "panel_count": scan.candidate_count,
        }

    def get(self, panel_id: str) -> PanelEntry:
        """存在しない ID なら KeyError。"""
        return self.entries[panel_id]

    def is_selected(self, entry: PanelEntry) -> bool:
        return self.project.is_selected(entry.ref)

    def set_selected(self, panel_id: str, selected: bool) -> None:
        entry = self.get(panel_id)
        with self._project_lock:
            self.project.set_selected(entry.ref, selected)
            save_project(self.project, self._project_path)

    def select_all(self, selected: bool, panel: int | None = None, only: bool = False) -> None:
        """まとめて採用・除外する。

        panel を渡すと、そのユーザー（上から 1・2・3）のパネルだけを対象にする。
        only=True なら、対象を採用し、それ以外を除外する（「ユーザー1だけ使う」）。
        """
        with self._project_lock:
            for entry in self.entries.values():
                target = panel is None or entry.ref.panel == panel
                if target:
                    self.project.set_selected(entry.ref, selected)
                elif only:
                    self.project.set_selected(entry.ref, False)
            save_project(self.project, self._project_path)

    def set_speed(self, speed: float) -> None:
        if speed not in SPEEDS:
            raise ValueError(f"速度は{', '.join(f'{s:g}' for s in SPEEDS)}のどれかにしてください")
        with self._project_lock:
            self.project.speed = speed
            save_project(self.project, self._project_path)

    def summary(self) -> dict:
        selected = [e for e in self.entries.values() if self.is_selected(e)]
        seconds = sum(e.clip.duration for e in selected)
        try:
            # 結合した動画の大きさは、つなぐ順で最初のパネルの大きさで決まる
            first = self.selected_segments()[0].panel
            frame = {"width": first.width, "height": first.height}
        except SelectionError:
            frame = None
        return {
            "speed": self.project.speed,
            "frame": frame,
            "total_count": len(self.entries),
            "selected_count": len(selected),
            "estimated_seconds": round(seconds / self.project.speed, 2),
            "videos": [self.video_json(scan) for scan in self.scans],
        }

    def selected_segments(self) -> list[Segment]:
        """採用したパネルを、つなぐ順 (人ごと、各人の中では時系列) に並べる。無ければ SelectionError。"""
        return resolve_segments(self.scans, self.project.selected_refs(self.scans))

    def clear_clips(self) -> None:
        """パネル単体の動画を消す。次に要求されたときに作り直す。"""
        with self._media_lock:
            shutil.rmtree(self._clip_dir, ignore_errors=True)

    def ensure_thumbnails(self, scan: VideoScan) -> None:
        ensure_thumbnails(scan, self._thumbnail_dir)

    def thumbnail_path(self, entry: PanelEntry) -> Path:
        return self._thumbnail_dir / video_key(entry.scan.info) / f"{entry.ref.clip:03d}-{entry.ref.panel}.jpg"

    def clip_path(self, entry: PanelEntry) -> Path:
        """パネル単体の動画。無ければ作る。"""
        path = self._clip_dir / _media_key(entry) / f"{entry.ref.clip:03d}-{entry.ref.panel}.mp4"
        with self._media_lock:
            if not path.exists():
                tmp = path.with_suffix(".tmp.mp4")
                export_panel_clip(entry.scan.info, entry.clip, entry.panel, tmp)
                # 作り途中のファイルを配信しないよう、書き終えてから置き換える
                tmp.replace(path)
        return path


def metadata_date(scan: VideoScan) -> str | None:
    """動画のメタデータの作成日時を、この Mac のタイムゾーンの日付にする。"""
    created = scan.info.created_at
    return created.astimezone().date().isoformat() if created else None


def _media_key(entry: PanelEntry) -> str:
    # 動画の差し替えや解析ロジックの変更で区間が変わったら、別のフォルダに作り直す
    stamp = json.dumps({**file_stamp(entry.scan.info), "cache": CACHE_VERSION}, sort_keys=True)
    return f"{video_key(entry.scan.info)}-{hashlib.sha256(stamp.encode()).hexdigest()[:8]}"


class DateConflict(ValueError):
    """入力した撮影日が、ほかの動画の撮影日と同じ。"""


def format_day(value: date) -> str:
    return f"{value.year}年{value.month}月{value.day}日"


def check_video_date(value: str, name: str, entered: dict[str, str], today: date) -> None:
    """撮影日として受け付けられるかを確かめる。だめなら、次に取る操作を書いた ValueError（重複は DateConflict）。"""
    if not is_date(value):
        raise ValueError("日付は2026-09-19の形で入力してください")
    if date.fromisoformat(value) > today:
        raise ValueError(f"明日以降の日付は入力できません。{format_day(today)}までの、撮影した日を入力してください")
    for other, other_date in entered.items():
        if other != name and other_date == value:
            raise DateConflict(
                f"{format_day(date.fromisoformat(value))}は「{other}」の撮影日になっています。別の日付を入力するか、先に「{other}」の日付を直してください"
            )


_FINGERPRINT_CHUNK = 1024 * 1024


def file_fingerprint(path: Path) -> tuple[int, str]:
    """ファイルの大きさと、先頭・末尾 1 MiB のハッシュ。同じ動画をもう一度送ったことを、全体を読まずに見分ける。"""
    size = path.stat().st_size
    digest = hashlib.sha256()
    with path.open("rb") as f:
        digest.update(f.read(_FINGERPRINT_CHUNK))
        if size > _FINGERPRINT_CHUNK:
            f.seek(max(size - _FINGERPRINT_CHUNK, _FINGERPRINT_CHUNK))
            digest.update(f.read())
    return size, digest.hexdigest()
