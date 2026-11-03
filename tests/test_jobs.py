import tempfile
import threading
import time
import unittest
from pathlib import Path

from setlog_join.jobs import InsufficientSpace, JobManager, JobsBusy, NothingSelected
from setlog_join.join import FULL_QUALITY, PREVIEW_QUALITY
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip
from setlog_join.workspace import Workspace


class FakeRunner:
    """join_segments の代わり。release() するまで止まり、呼ばれた引数を記録する。"""

    def __init__(self, fail: bool = False):
        self.calls = []
        self.gate = threading.Event()
        self.fail = fail

    def __call__(self, segments, speed, out, quality, progress):
        self.calls.append((len(segments), speed, quality))
        progress(0.5)
        self.gate.wait(5)
        if self.fail:
            raise RuntimeError("ffmpeg failed")
        out.write_bytes(b"mp4")
        progress(1.0)

    def release(self):
        self.gate.set()


def _wait(job, timeout=5):
    end = time.time() + timeout
    while job.active and time.time() < end:
        time.sleep(0.01)
    return job


class JobManagerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        video = self.tmp / "sep.mov"
        video.write_bytes(b"video")
        panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
        scan = VideoScan(
            info=VideoInfo(video, 4.0, 30.0, 640, 1080, None),
            panels=panels,
            clips=[ScannedClip(Clip(1, 0.0, 2.0), [panels[0], panels[2]]), ScannedClip(Clip(2, 2.0, 4.0), [panels[1]])],
        )
        self.workspace = Workspace([scan], self.tmp / "project.json", self.tmp / "thumbnails", self.tmp / "clips")
        self.runner = FakeRunner()
        self.free = 10**12
        self.jobs = self._manager(self.runner)

    def _manager(self, runner):
        manager = JobManager(self.workspace, self.tmp / "previews", self.tmp / "output", runner,
                             free_bytes=lambda path: self.free)
        self.addCleanup(manager.shutdown)
        return manager

    def test_preview_runs_in_the_background_and_reports_progress(self):
        job = self.jobs.start("preview")
        self.assertIn(job.status, ("queued", "running"))
        self.runner.release()
        _wait(job)
        self.assertEqual((job.status, job.progress), ("done", 1.0))
        self.assertEqual(job.path.read_bytes(), b"mp4")
        self.assertEqual(self.runner.calls, [(3, 1.0, PREVIEW_QUALITY)])
        self.assertEqual(job.to_json()["url"], f"/media/preview?v={job.id}")
        self.assertIs(self.jobs.latest_done("preview"), job)

    def test_export_uses_full_quality_and_the_output_folder(self):
        self.runner.release()
        job = _wait(self.jobs.start("export"))
        self.assertEqual(job.path.parent, self.tmp / "output")
        self.assertEqual(self.runner.calls[0][2], FULL_QUALITY)
        self.assertEqual(job.to_json()["url"], "/download/output")

    def test_reuses_the_job_while_selection_and_speed_are_unchanged(self):
        first = self.jobs.start("preview")
        self.assertIs(self.jobs.start("preview"), first)  # 進行中
        self.runner.release()
        _wait(first)
        self.assertIs(self.jobs.start("preview"), first)  # 作り終えている
        self.assertEqual(len(self.runner.calls), 1)

    def test_makes_a_new_preview_when_selection_or_speed_changes(self):
        self.runner.release()
        first = _wait(self.jobs.start("preview"))
        self.workspace.set_speed(2.0)
        second = _wait(self.jobs.start("preview"))
        self.workspace.set_selected("sep/001-3", False)
        third = _wait(self.jobs.start("preview"))
        self.assertEqual(len({first.id, second.id, third.id}), 3)
        self.assertEqual(self.runner.calls[1][1], 2.0)
        self.assertEqual(self.runner.calls[2][0], 2)
        # 古いプレビューは消し、最新だけを残す
        self.assertEqual([p.name for p in (self.tmp / "previews").glob("*.mp4")], [third.path.name])

    def test_failure_is_reported_and_can_be_retried(self):
        failing = FakeRunner(fail=True)
        failing.release()
        jobs = self._manager(failing)
        job = _wait(jobs.start("preview"))
        self.assertEqual(job.status, "failed")
        self.assertIn("もう一度", job.error)
        self.assertNotIn("ffmpeg", job.error)
        self.assertEqual(list((self.tmp / "previews").glob("*")), [])
        retried = jobs.start("preview")
        self.assertNotEqual(retried.id, job.id)

    def test_refuses_when_nothing_is_selected(self):
        self.workspace.select_all(False)
        with self.assertRaises(NothingSelected):
            self.jobs.start("preview")

    def test_refuses_when_disk_is_almost_full(self):
        self.free = 1_000
        with self.assertRaises(InsufficientSpace) as ctx:
            self.jobs.start("export")
        self.assertIn("空き容量", str(ctx.exception))
        self.assertEqual(self.runner.calls, [])

    def test_clear_temporary_waits_for_running_jobs(self):
        job = self.jobs.start("preview")
        with self.assertRaises(JobsBusy):
            self.jobs.clear_temporary()
        self.runner.release()
        _wait(job)
        self.jobs.clear_temporary()
        self.assertFalse((self.tmp / "previews").exists())
        self.assertIsNone(self.jobs.latest_done("preview"))

    def test_unknown_job_is_key_error(self):
        with self.assertRaises(KeyError):
            self.jobs.get("nope")


if __name__ == "__main__":
    unittest.main()
