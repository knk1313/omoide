import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setlog_join import runtime, storage
from setlog_join.storage import Storage, StorageError, default_storage


class AppModeTestCase(unittest.TestCase):
    """単体アプリとして動いている状態（実行ファイルのフォルダ = 一時フォルダ）で試す。"""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name).resolve()
        self.app = self.root / "omoide"
        self.app.mkdir()
        for patcher in (
            mock.patch.object(runtime, "FROZEN", True),
            mock.patch.object(runtime, "app_dir", return_value=self.app),
            mock.patch.object(runtime, "bundle_dir", return_value=self.app / "_internal"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def request(self, base: Path) -> dict[str, str]:
        return default_storage(base).to_json()


class CurrentTest(AppModeTestCase):
    def test_defaults_to_the_app_folder(self):
        self.assertEqual(storage.current(), default_storage(self.app))
        self.assertTrue(storage.editable())

    def test_development_uses_the_current_folder_and_cannot_be_changed(self):
        with mock.patch.object(runtime, "FROZEN", False):
            self.assertEqual(storage.current(), default_storage(Path.cwd()))
            self.assertFalse(storage.editable())
            with self.assertRaises(StorageError):
                storage.save_pending(default_storage(self.root / "other"))

    def test_ignores_a_broken_settings_file(self):
        (self.app / storage.SETTINGS_NAME).write_text("{broken", encoding="utf-8")
        self.assertEqual(storage.current(), default_storage(self.app))


class ValidateTest(AppModeTestCase):
    def test_accepts_new_or_empty_folders(self):
        (self.root / "empty").mkdir()
        new = storage.validate(
            {"input": str(self.root / "empty"), "output": str(self.root / "new" / "out"), "work": str(self.root / "new" / "work")},
            storage.current(),
        )
        self.assertEqual(new.input, self.root / "empty")

    def test_expands_the_home_folder(self):
        new = storage.validate(
            {"input": "~/omoide-test/in", "output": "~/omoide-test/out", "work": "~/omoide-test/work"}, storage.current()
        )
        self.assertEqual(new.input, Path.home() / "omoide-test" / "in")

    def test_rejects_problems_with_a_reason(self):
        busy = self.root / "busy"
        busy.mkdir()
        (busy / "something.txt").write_text("x")
        (self.root / "file").write_text("x")
        now = storage.current()
        cases = {
            "入力してください": {"input": "", "output": "/a", "work": "/b"},
            "フルパス": {"input": "relative/in", "output": str(self.root / "o"), "work": str(self.root / "w")},
            "別々のフォルダ": {"input": str(self.root / "x"), "output": str(self.root / "x" / "out"), "work": str(self.root / "w")},
            "空ではありません": {"input": str(busy), "output": str(self.root / "o"), "work": str(self.root / "w")},
            "ファイルです": {"input": str(self.root / "file"), "output": str(self.root / "o"), "work": str(self.root / "w")},
            "_internal": {"input": str(self.app / "_internal" / "in"), "output": str(self.root / "o"), "work": str(self.root / "w")},
        }
        for reason, request in cases.items():
            with self.subTest(reason=reason), self.assertRaisesRegex(StorageError, reason):
                storage.validate(request, now)

    def test_unchanged_folders_may_contain_files(self):
        now = storage.current()
        now.input.mkdir()
        (now.input / "video.mov").write_bytes(b"v")
        request = {**now.to_json(), "output": str(self.root / "out")}
        self.assertEqual(storage.validate(request, now).output, self.root / "out")


class PendingTest(AppModeTestCase):
    def test_moves_files_on_the_next_start_and_then_uses_the_new_place(self):
        now = storage.current()
        now.input.mkdir()
        (now.input / ".gitkeep").touch()
        (now.input / "video.mov").write_bytes(b"video")
        now.cache.mkdir(parents=True)
        (now.cache / "scan.json").write_text("{}")
        target = default_storage(self.root / "Movies" / "omoide")

        storage.save_pending(target)
        # 保存しただけでは、まだ移さない
        self.assertEqual(storage.current(), now)
        self.assertEqual(storage.pending(), target)
        self.assertTrue((now.input / "video.mov").exists())

        messages: list[str] = []
        self.assertEqual(storage.apply_pending(report=messages.append), target)
        self.assertEqual((target.input / "video.mov").read_bytes(), b"video")
        self.assertTrue((target.cache / "scan.json").exists())
        self.assertFalse((now.input / "video.mov").exists())
        # .gitkeep は移さず、元のフォルダに残す
        self.assertTrue((now.input / ".gitkeep").exists())
        self.assertFalse(now.work.exists())
        self.assertEqual(storage.current(), target)
        self.assertIsNone(storage.pending())
        self.assertIn("保存先を変えました。", messages)
        saved = json.loads((self.app / storage.SETTINGS_NAME).read_text(encoding="utf-8"))
        self.assertEqual(saved["storage"]["input"], str(target.input))

    def test_cancel_keeps_the_current_place(self):
        storage.save_pending(default_storage(self.root / "elsewhere"))
        storage.cancel_pending()
        self.assertIsNone(storage.pending())
        self.assertEqual(storage.apply_pending(report=lambda _: None), default_storage(self.app))

    def test_choosing_the_current_place_clears_the_plan(self):
        storage.save_pending(default_storage(self.root / "elsewhere"))
        storage.save_pending(storage.current())
        self.assertIsNone(storage.pending())


class ContentsTest(AppModeTestCase):
    def test_lists_videos_outputs_and_the_work_folder_but_keeps_gitkeep(self):
        store = Storage(input=self.root / "in", output=self.root / "out", work=self.root / "work")
        for folder in (store.input, store.output, store.work):
            folder.mkdir()
            (folder / ".gitkeep").touch()
        (store.input / "a.mov").write_bytes(b"12345")
        (store.output / "b.mp4").write_bytes(b"123")
        names = [p.name for p in storage.contents(store)]
        self.assertEqual(names, ["a.mov", "b.mp4", "work"])
        self.assertEqual(storage.usage(store.input), {"count": 1, "bytes": 5})

    def test_presets_put_all_three_folders_under_one_place(self):
        presets = storage.presets()
        self.assertEqual(presets[0]["label"], "アプリのフォルダ")
        self.assertEqual(presets[0]["input"], str(self.app / "input"))
        for preset in presets:
            self.assertEqual(os.path.dirname(preset["input"]), os.path.dirname(preset["work"]))


if __name__ == "__main__":
    unittest.main()


class AppBundleStorageTest(unittest.TestCase):
    """Mac のアプリ（omoide.app）: 設定とデータを .app の外に置き、.app の中は保存先に選べない。"""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name).resolve()
        self.bundle = self.root / "Applications" / "omoide.app"
        (self.bundle / "Contents" / "Frameworks").mkdir(parents=True)
        self.home = self.root / "home"
        for patcher in (
            mock.patch.object(runtime, "FROZEN", True),
            mock.patch.object(runtime, "app_bundle", return_value=self.bundle),
            mock.patch.object(runtime, "bundle_dir", return_value=self.bundle / "Contents" / "Frameworks"),
            mock.patch.object(Path, "home", return_value=self.home),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_defaults_to_the_movies_folder(self):
        self.assertEqual(storage.current(), default_storage(self.home / "Movies" / "omoide"))
        self.assertEqual(storage.settings_path(), self.home / "Library" / "Application Support" / "omoide" / storage.SETTINGS_NAME)

    def test_saves_settings_outside_the_bundle(self):
        storage.save_pending(default_storage(self.home / "Documents" / "omoide"))
        self.assertTrue(storage.settings_path().is_file())
        self.assertEqual(storage.pending(), default_storage(self.home / "Documents" / "omoide"))
        self.assertEqual(list(self.bundle.rglob("*.json")), [])

    def test_presets_do_not_offer_the_app_folder(self):
        self.assertNotIn("アプリのフォルダ", [p["label"] for p in storage.presets()])

    def test_rejects_folders_inside_the_bundle(self):
        inside = self.bundle / "Contents" / "Resources" / "data"
        with self.assertRaisesRegex(StorageError, "omoide.app"):
            storage.validate(
                {"input": str(inside / "input"), "output": str(inside / "output"), "work": str(inside / "work")},
                storage.current(),
            )
