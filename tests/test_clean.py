import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from setlog_join.clean import clean_targets, format_size
from setlog_join.cli import clean_command


class CleanTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.input = root / "input"
        self.output = root / "output"
        self.work = root / ".setlog-join"
        for folder in (self.input, self.output):
            folder.mkdir()
            (folder / ".gitkeep").touch()
        (self.input / "20260919.mov").write_bytes(b"x" * 10)
        (self.input / "backup").mkdir()
        (self.input / "backup" / "old.mov").write_bytes(b"x" * 5)
        (self.output / "omoide-20261104.mp4").write_bytes(b"x" * 3)
        (self.work / "projects").mkdir(parents=True)
        (self.work / "projects" / "project.json").write_text("{}")

    def run_clean(self, yes=False, answer="y"):
        out = io.StringIO()
        with redirect_stdout(out), mock.patch("builtins.input", return_value=answer):
            code = clean_command(self.input, self.output, yes, self.work)
        return code, out.getvalue()

    def test_lists_inputs_outputs_and_work_dir_but_keeps_gitkeep(self):
        names = [t.path.name for t in clean_targets(self.input, self.output, self.work)]
        self.assertEqual(names, ["20260919.mov", "backup", "omoide-20261104.mp4", ".setlog-join"])
        sizes = {t.path.name: t.size for t in clean_targets(self.input, self.output, self.work)}
        self.assertEqual(sizes["backup"], 5)

    def test_removes_everything_after_confirmation(self):
        code, out = self.run_clean(answer="y")
        self.assertEqual(code, 0)
        self.assertIn("4 件を消しました", out)
        self.assertEqual([p.name for p in self.input.iterdir()], [".gitkeep"])
        self.assertEqual([p.name for p in self.output.iterdir()], [".gitkeep"])
        self.assertFalse(self.work.exists())

    def test_keeps_everything_when_not_confirmed(self):
        code, out = self.run_clean(answer="")
        self.assertEqual(code, 1)
        self.assertIn("何も消していません", out)
        self.assertTrue((self.input / "20260919.mov").exists())
        self.assertTrue(self.work.exists())

    def test_yes_skips_the_question(self):
        with redirect_stdout(io.StringIO()), mock.patch("builtins.input", side_effect=AssertionError("聞かない")):
            code = clean_command(self.input, self.output, True, self.work)
        self.assertEqual(code, 0)
        self.assertFalse(self.work.exists())

    def test_nothing_to_remove(self):
        self.run_clean(yes=True)
        code, out = self.run_clean(yes=True)
        self.assertEqual(code, 0)
        self.assertIn("消すものはありません", out)

    def test_format_size(self):
        self.assertEqual(format_size(512), "512 B")
        self.assertEqual(format_size(23_566_247), "22.5 MB")


if __name__ == "__main__":
    unittest.main()
