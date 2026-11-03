"""プレビューと完成版の生成を、裏で 1 本ずつ順に行う。

生成中も API は普通に使え、画面は進み具合を GET /api/jobs/<ID> で取りに来る。
"""

import hashlib
import json
import secrets
import shutil
import sys
import threading
import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .join import FULL_QUALITY, PREVIEW_QUALITY, Segment, SelectionError, join_segments
from .workspace import Workspace

PREVIEW_DIR = Path(".setlog-join/previews")
OUTPUT_DIR = Path("output")

# 空き容量の見積もりに使う 1 秒あたりのバイト数。実測 (1156x632 で約 160KB/秒) より多めに見る
_BYTES_PER_SECOND = {"preview": 100_000, "export": 500_000}
# 一時ファイルと書き出し先が並んで置かれるので 2 倍にし、さらに余裕を持たせる
_SPACE_MARGIN = 200_000_000

_FAILED_MESSAGE = "動画の生成に失敗しました。もう一度お試しください"


class JobError(Exception):
    """生成を始められない。メッセージは利用者向け。"""


class NothingSelected(JobError):
    pass


class InsufficientSpace(JobError):
    pass


class JobsBusy(JobError):
    pass


@dataclass
class Job:
    id: str
    kind: str  # "preview" か "export"
    signature: str
    path: Path
    status: str = "queued"  # queued / running / done / failed
    progress: float = 0.0
    error: str | None = None

    @property
    def active(self) -> bool:
        return self.status in ("queued", "running")

    def to_json(self) -> dict:
        url = None
        if self.status == "done":
            url = f"/media/preview?v={self.id}" if self.kind == "preview" else "/download/output"
        return {
            "id": self.id, "kind": self.kind, "status": self.status,
            "progress": round(self.progress, 3), "error": self.error, "url": url,
        }


Runner = Callable[..., None]


class JobManager:
    def __init__(
        self,
        workspace: Workspace,
        preview_dir: Path = PREVIEW_DIR,
        output_dir: Path = OUTPUT_DIR,
        runner: Runner = join_segments,
        free_bytes: Callable[[Path], int] = lambda path: shutil.disk_usage(path).free,
    ):
        self._workspace = workspace
        self._preview_dir = preview_dir
        self._output_dir = output_dir
        self._runner = runner
        self._free_bytes = free_bytes
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        # 動画の生成は重いので、同時には 1 本だけ作る
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="omoide-job")

    def start(self, kind: str) -> Job:
        """生成を始める。選択と速度が同じ生成が進行中か作り終えていれば、それを返す。"""
        try:
            segments = self._workspace.selected_segments()
        except SelectionError as e:
            raise NothingSelected("採用しているパネルがありません。クリップを選んでください") from e
        speed = self._workspace.project.speed
        signature = _signature(kind, segments, speed)

        with self._lock:
            for job in reversed(self._jobs.values()):
                if job.kind == kind and job.signature == signature and (
                    job.active or (job.status == "done" and job.path.exists())
                ):
                    return job

            directory = self._preview_dir if kind == "preview" else self._output_dir
            directory.mkdir(parents=True, exist_ok=True)
            seconds = sum(s.clip.duration for s in segments) / speed
            needed = int(seconds * _BYTES_PER_SECOND[kind] * 2) + _SPACE_MARGIN
            if self._free_bytes(directory) < needed:
                raise InsufficientSpace(
                    f"Mac の空き容量が足りません (あと {needed / 1e9:.1f}GB 必要)。"
                    "不要なファイルを削除してから、もう一度お試しください"
                )

            if kind == "preview":
                path = directory / f"preview-{signature[:16]}.mp4"
            else:
                path = directory / f"omoide-{datetime.now():%Y%m%d-%H%M%S}.mp4"
            job = Job(id=secrets.token_urlsafe(8), kind=kind, signature=signature, path=path)
            self._jobs[job.id] = job
        self._executor.submit(self._run, job, segments, speed)
        return job

    def get(self, job_id: str) -> Job:
        """存在しない ID なら KeyError。"""
        return self._jobs[job_id]

    def latest_done(self, kind: str) -> Job | None:
        for job in reversed(self._jobs.values()):
            if job.kind == kind and job.status == "done" and job.path.exists():
                return job
        return None

    def clear_temporary(self) -> None:
        """プレビューとパネル単体の動画を消す。完成版 (output/) は消さない。"""
        with self._lock:
            if any(job.active for job in self._jobs.values()):
                raise JobsBusy("生成が終わってから、もう一度お試しください")
            shutil.rmtree(self._preview_dir, ignore_errors=True)
            self._workspace.clear_clips()

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, job: Job, segments: list[Segment], speed: float) -> None:
        job.status = "running"
        quality = PREVIEW_QUALITY if job.kind == "preview" else FULL_QUALITY
        # 作り途中のファイルを配信しないよう、書き終えてから置き換える
        tmp = job.path.with_suffix(".tmp.mp4")
        try:
            self._runner(segments, speed, tmp, quality=quality, progress=lambda done: setattr(job, "progress", done))
            tmp.replace(job.path)
        except Exception:
            # 原因は Mac のターミナルに残し、画面には次に取る操作だけを返す
            traceback.print_exc(file=sys.stderr)
            tmp.unlink(missing_ok=True)
            job.status, job.error = "failed", _FAILED_MESSAGE
            return
        job.progress, job.status = 1.0, "done"
        if job.kind == "preview":
            self._remove_old_previews(job)

    def _remove_old_previews(self, keep: Job) -> None:
        with self._lock:
            for job in self._jobs.values():
                if job.kind == "preview" and job is not keep and not job.active and job.path != keep.path:
                    job.path.unlink(missing_ok=True)


def _signature(kind: str, segments: list[Segment], speed: float) -> str:
    parts = [
        [str(s.info.path), s.clip.index, s.panel.position, round(s.clip.start, 3), round(s.clip.end, 3)]
        for s in segments
    ]
    payload = json.dumps({"kind": kind, "speed": speed, "parts": parts})
    return hashlib.sha256(payload.encode()).hexdigest()
