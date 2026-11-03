import json
import tempfile
import unittest
from pathlib import Path

from setlog_join.join import PanelRef
from setlog_join.panels import Panel
from setlog_join.probe import VideoInfo
from setlog_join.project import Project, load_project, panel_refs, save_project
from setlog_join.scan import ScannedClip, VideoScan
from setlog_join.segments import Clip


def _scan(name: str, filled_by_clip: list[list[int]]) -> VideoScan:
    panels = [Panel(position=i, x=0, y=i * 360, width=640, height=360) for i in range(3)]
    info = VideoInfo(Path(f"/videos/{name}.mov"), 2.0 * len(filled_by_clip), 30.0, 640, 1080, None)
    clips = [
        ScannedClip(Clip(i + 1, i * 2.0, (i + 1) * 2.0), [panels[p] for p in filled])
        for i, filled in enumerate(filled_by_clip)
    ]
    return VideoScan(info=info, panels=panels, clips=clips)


def _ids(refs: list[PanelRef]) -> list[str]:
    return [str(ref) for ref in refs]


class ProjectTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name) / "projects" / "project.json"
        self.september = _scan("sep", [[0, 2], [1]])

    def test_starts_with_everything_selected_at_normal_speed(self):
        project = load_project(self.path)
        self.assertEqual(project.speed, 1.0)
        self.assertEqual(_ids(project.selected_refs([self.september])), ["sep/001-1", "sep/001-3", "sep/002-2"])

    def test_restores_saved_selection_and_speed(self):
        project = load_project(self.path)
        project.speed = 1.5
        project.set_selected(PanelRef.parse("sep/001-3"), False)
        save_project(project, self.path)

        restored = load_project(self.path)
        self.assertEqual(restored.speed, 1.5)
        self.assertEqual(_ids(restored.selected_refs([self.september])), ["sep/001-1", "sep/002-2"])

    def test_reselecting_removes_the_exclusion(self):
        project = Project()
        ref = PanelRef.parse("sep/001-3")
        project.set_selected(ref, False)
        project.set_selected(ref, True)
        self.assertTrue(project.is_selected(ref))
        self.assertEqual(project.excluded, set())

    def test_adding_a_video_keeps_earlier_exclusions(self):
        project = Project()
        project.set_selected(PanelRef.parse("sep/002-2"), False)
        save_project(project, self.path)

        october = _scan("oct", [[0]])
        restored = load_project(self.path)
        self.assertEqual(
            _ids(restored.selected_refs([self.september, october])),
            ["sep/001-1", "sep/001-3", "oct/001-1"],
        )

    def test_ignores_exclusions_for_panels_that_no_longer_exist(self):
        project = Project(excluded={"gone/001-1"})
        self.assertEqual(len(project.selected_refs([self.september])), 3)

    def test_falls_back_to_defaults_for_broken_or_unknown_files(self):
        self.path.parent.mkdir(parents=True)
        for content in ("{broken", json.dumps({"version": 999, "speed": 2, "excluded": []}),
                        json.dumps({"version": 1, "speed": "fast", "excluded": []})):
            with self.subTest(content=content):
                self.path.write_text(content)
                self.assertEqual(load_project(self.path), Project())

    def test_unsupported_speed_falls_back_to_normal(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_text(json.dumps({"version": 1, "speed": 3.0, "excluded": ["sep/001-1"]}))
        project = load_project(self.path)
        self.assertEqual(project.speed, 1.0)
        self.assertEqual(project.excluded, {"sep/001-1"})

    def test_panel_ids_match_the_export_file_names(self):
        self.assertEqual(_ids(panel_refs([self.september])), ["sep/001-1", "sep/001-3", "sep/002-2"])


if __name__ == "__main__":
    unittest.main()
