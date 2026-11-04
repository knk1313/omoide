import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setlog_join import cli, runtime


class ToolTest(unittest.TestCase):
    def test_uses_the_bundled_ffmpeg_when_present(self):
        with tempfile.TemporaryDirectory() as tmp:
            bundled = Path(tmp) / "ffmpeg" / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
            bundled.parent.mkdir()
            bundled.touch()
            with mock.patch.object(runtime, "bundle_dir", return_value=Path(tmp)):
                self.assertEqual(runtime.tool("ffmpeg"), str(bundled))
                # 含めていないものは PATH の名前のまま
                self.assertEqual(runtime.tool("ffprobe"), "ffprobe")

    def test_falls_back_to_path_in_development(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(runtime, "bundle_dir", return_value=Path(tmp)):
            self.assertEqual(runtime.tool("ffmpeg"), "ffmpeg")


class FrozenMainTest(unittest.TestCase):
    def setUp(self):
        cwd = os.getcwd()
        self.addCleanup(os.chdir, cwd)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.app = Path(tmp.name)
        for patcher in (
            mock.patch.object(runtime, "FROZEN", True),
            mock.patch.object(runtime, "app_dir", return_value=self.app),
            mock.patch.object(runtime, "allow_bundled_tools"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_double_click_runs_serve_in_the_app_folder_and_waits_before_closing(self):
        with mock.patch.object(cli, "serve_command", return_value=0) as serve, mock.patch("builtins.input") as wait:
            self.assertEqual(cli.main([]), 0)
        serve.assert_called_once()
        self.assertEqual(Path.cwd().resolve(), self.app.resolve())
        wait.assert_called_once()

    def test_commands_with_arguments_do_not_wait(self):
        with mock.patch.object(cli, "clean_command", return_value=0) as clean, mock.patch("builtins.input") as wait:
            self.assertEqual(cli.main(["clean", "--yes"]), 0)
        clean.assert_called_once()
        wait.assert_not_called()


if __name__ == "__main__":
    unittest.main()
