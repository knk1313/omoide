import unittest

from setlog_join.auth import LOCKOUT_SECONDS, MAX_FAILURES, MAX_PASSWORD_LENGTH, LoginLocked, ShareAuth, parse_duration


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class ShareAuthTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.auth = ShareAuth("correct horse", 3600, clock=self.clock)

    def test_token_is_long_and_random(self):
        other = ShareAuth("correct horse", 3600, clock=self.clock)
        self.assertGreaterEqual(len(self.auth.token), 20)
        self.assertNotEqual(self.auth.token, other.token)
        self.assertTrue(self.auth.token_matches(self.auth.token))
        self.assertFalse(self.auth.token_matches("wrong"))
        self.assertFalse(self.auth.token_matches(None))

    def test_does_not_keep_the_password_in_plain_text(self):
        self.assertNotIn("correct horse", repr(vars(self.auth)))

    def test_login_issues_a_new_session_each_time(self):
        first = self.auth.login("correct horse")
        second = self.auth.login("correct horse")
        self.assertNotEqual(first, second)
        self.assertTrue(self.auth.session_valid(first))
        self.assertTrue(self.auth.session_valid(second))
        self.assertFalse(self.auth.session_valid("forged"))
        self.assertFalse(self.auth.session_valid(None))

    def test_rejects_wrong_and_overlong_passwords(self):
        for password in ("wrong", "", "x" * (MAX_PASSWORD_LENGTH + 1)):
            with self.subTest(password=password[:10]), self.assertRaises(ValueError):
                self.auth.login(password)

    def test_logout_invalidates_only_that_session(self):
        first = self.auth.login("correct horse")
        second = self.auth.login("correct horse")
        self.auth.logout(first)
        self.assertFalse(self.auth.session_valid(first))
        self.assertTrue(self.auth.session_valid(second))

    def test_locks_after_repeated_failures_and_doubles_the_wait(self):
        self._fail(MAX_FAILURES)
        with self.assertRaises(LoginLocked) as ctx:
            self.auth.login("correct horse")
        self.assertAlmostEqual(ctx.exception.retry_after, LOCKOUT_SECONDS)

        self.clock.now += LOCKOUT_SECONDS
        self._fail(1)
        with self.assertRaises(LoginLocked) as ctx:
            self.auth.login("correct horse")
        self.assertAlmostEqual(ctx.exception.retry_after, LOCKOUT_SECONDS * 2)

    def test_success_resets_the_failure_count(self):
        self._fail(MAX_FAILURES - 1)
        self.auth.login("correct horse")
        self._fail(MAX_FAILURES - 1)
        self.auth.login("correct horse")

    def test_everything_ends_at_expiry(self):
        session = self.auth.login("correct horse")
        self.clock.now += 3599
        self.assertFalse(self.auth.expired)
        self.assertTrue(self.auth.session_valid(session))
        self.clock.now += 1
        self.assertTrue(self.auth.expired)
        self.assertFalse(self.auth.session_valid(session))

    def test_end_invalidates_sessions_immediately(self):
        session = self.auth.login("correct horse")
        self.auth.end()
        self.assertTrue(self.auth.expired)
        self.assertFalse(self.auth.session_valid(session))

    def _fail(self, times: int) -> None:
        for _ in range(times):
            with self.assertRaises(ValueError):
                self.auth.login("wrong")


class ParseDurationTest(unittest.TestCase):
    def test_parses_units(self):
        self.assertEqual(parse_duration("2h"), 7200)
        self.assertEqual(parse_duration("30m"), 1800)
        self.assertEqual(parse_duration(" 90S "), 90)

    def test_rejects_invalid_values(self):
        for text in ("", "2", "h", "2d", "-1h", "1.5h", "0m", "25h"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_duration(text)


if __name__ == "__main__":
    unittest.main()
