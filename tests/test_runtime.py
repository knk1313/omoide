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


class AppBundleTest(unittest.TestCase):
    """Mac のアプリ（omoide.app）として動いているときの、データと設定の置き場所。"""

    def frozen(self, executable: str, platform: str = "darwin"):
        for patcher in (
            mock.patch.object(runtime, "FROZEN", True),
            mock.patch.object(runtime.sys, "executable", executable),
            mock.patch.object(runtime.sys, "platform", platform),
            mock.patch.object(Path, "home", return_value=Path("/Users/someone")),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_app_keeps_data_and_settings_outside_the_bundle(self):
        self.frozen("/Applications/omoide.app/Contents/MacOS/omoide")
        self.assertEqual(runtime.app_bundle(), Path("/Applications/omoide.app"))
        self.assertEqual(runtime.app_dir(), Path("/Applications"))
        self.assertEqual(runtime.data_dir(), Path("/Users/someone/Movies/omoide"))
        self.assertEqual(runtime.settings_dir(), Path("/Users/someone/Library/Application Support/omoide"))

    def test_plain_folder_keeps_data_next_to_the_executable(self):
        self.frozen("/Users/someone/Downloads/omoide/omoide", platform="linux")
        self.assertIsNone(runtime.app_bundle())
        self.assertEqual(runtime.data_dir(), Path("/Users/someone/Downloads/omoide"))
        self.assertEqual(runtime.settings_dir(), Path("/Users/someone/Downloads/omoide"))


class LaunchCommandTest(unittest.TestCase):
    def test_launch_command_opens_the_launcher_with_the_storage(self):
        with mock.patch("setlog_join.launcher.launch", return_value=0) as launch, mock.patch.object(cli, "_tools_available", return_value=True):
            self.assertEqual(cli.main(["launch", "--no-browser"]), 0)
        store, _tools = launch.call_args.args
        self.assertEqual(store, cli.apply_pending())
        self.assertEqual(launch.call_args.kwargs, {"open_browser": False})


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

    def test_double_click_opens_the_launcher_in_the_app_folder(self):
        with mock.patch.object(cli, "_run", return_value=0) as run, mock.patch("builtins.input") as wait:
            self.assertEqual(cli.main([]), 0)
        run.assert_called_once_with(["launch"])
        self.assertEqual(Path.cwd().resolve(), self.app.resolve())
        # うまく起動して終わったときは、窓を閉じるのを待たない
        wait.assert_not_called()

    def test_waits_before_closing_when_it_could_not_start(self):
        with mock.patch.object(cli, "_run", return_value=1), mock.patch("builtins.input") as wait:
            self.assertEqual(cli.main([]), 1)
        wait.assert_called_once()

    def test_app_bundle_reports_a_failure_in_a_dialog(self):
        # .app にはターミナルの窓がないので、Enter を待たずにダイアログで知らせる
        with (
            mock.patch.object(runtime, "app_bundle", return_value=self.app / "omoide.app"),
            mock.patch.object(cli, "_log_to_file") as log,
            mock.patch.object(cli, "_run", side_effect=RuntimeError("ポートを開けません")),
            mock.patch("setlog_join.macapp.alert") as alert,
            mock.patch("builtins.input") as wait,
            mock.patch("traceback.print_exc"),
        ):
            self.assertEqual(cli.main([]), 1)
        title, message = alert.call_args.args
        self.assertEqual(title, "omoideを起動できませんでした")
        self.assertIn("ポートを開けません", message)
        wait.assert_not_called()
        log.assert_called_once_with(runtime.log_path())

    def test_ignores_the_process_serial_number_from_old_finders(self):
        with mock.patch.object(cli, "_run", return_value=0) as run, mock.patch("builtins.input"):
            self.assertEqual(cli.main(["-psn_0_12345"]), 0)
        run.assert_called_once_with(["launch"])

    def test_commands_with_arguments_do_not_wait(self):
        with mock.patch.object(cli, "clean_command", return_value=0) as clean, mock.patch("builtins.input") as wait:
            self.assertEqual(cli.main(["clean", "--yes"]), 0)
        clean.assert_called_once()
        wait.assert_not_called()


if __name__ == "__main__":
    unittest.main()
