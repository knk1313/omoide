import os
import tempfile
import unittest
from pathlib import Path

from setlog_join.webbuild import build_problem


class BuildProblemTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.web = Path(tmp.name)
        (self.web / "src" / "pages").mkdir(parents=True)
        self.source = self.web / "src" / "pages" / "ClipsPage.tsx"
        self.source.write_text("export {}")
        self.set_mtime(self.source, 1000)

    def set_mtime(self, path: Path, when: float) -> None:
        os.utime(path, (when, when))

    def build(self, when: float) -> None:
        (self.web / "dist").mkdir(exist_ok=True)
        built = self.web / "dist" / "index.html"
        built.write_text("<!doctype html>")
        self.set_mtime(built, when)

    def test_reports_missing_build(self):
        self.assertIn("まだビルドされていません", build_problem(self.web))

    def test_accepts_a_build_newer_than_the_sources(self):
        self.build(2000)
        self.assertIsNone(build_problem(self.web))

    def test_reports_sources_changed_after_the_build(self):
        self.build(2000)
        self.set_mtime(self.source, 3000)
        problem = build_problem(self.web)
        self.assertIn("web/src/pages/ClipsPage.tsx", problem)
        self.assertIn("npm run build", problem)

    def test_ignores_changes_to_tests(self):
        self.build(2000)
        test_file = self.web / "src" / "pages" / "ClipsPage.test.tsx"
        test_file.write_text("test")
        self.set_mtime(test_file, 3000)
        (self.web / "src" / "test").mkdir()
        helper = self.web / "src" / "test" / "fakeServer.ts"
        helper.write_text("export {}")
        self.set_mtime(helper, 3000)
        self.assertIsNone(build_problem(self.web))

    def test_is_quiet_when_sources_are_absent(self):
        # 配布したパッケージのように、ビルドだけがある場合
        self.build(2000)
        (self.source).unlink()
        (self.web / "src" / "pages").rmdir()
        (self.web / "src").rmdir()
        self.assertIsNone(build_problem(self.web))


if __name__ == "__main__":
    unittest.main()
