import unittest

from setlog_join.server import download_name


class DownloadNameTest(unittest.TestCase):
    def test_uses_the_name_and_adds_the_extension(self):
        self.assertEqual(download_name("9月の旅行", "omoide-1"), "9月の旅行.mp4")
        self.assertEqual(download_name("trip.MP4", "omoide-1"), "trip.mp4")

    def test_removes_path_separators_and_control_characters(self):
        self.assertEqual(download_name("../../etc/passwd", "x"), "etcpasswd.mp4")
        self.assertEqual(download_name("a\\b\nc:d", "x"), "abcd.mp4")

    def test_falls_back_when_empty(self):
        for name in (None, "", "   ", "...", "/"):
            with self.subTest(name=name):
                self.assertEqual(download_name(name, "omoide-20261103-120000"), "omoide-20261103-120000.mp4")

    def test_limits_the_length(self):
        self.assertEqual(len(download_name("あ" * 200, "x")), 80 + len(".mp4"))


if __name__ == "__main__":
    unittest.main()
