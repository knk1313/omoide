"""共有 URL のトークン、パスワード、セッションを管理する。

家庭内 LAN での誤アクセスを防ぐためのもので、HTTP の盗聴は防げない。
"""

import hashlib
import secrets
import time
from collections.abc import Callable

TOKEN_BYTES = 16
SESSION_BYTES = 32
MAX_PASSWORD_LENGTH = 256
# 続けてこの回数だけ失敗したら、しばらくログインを受け付けない
MAX_FAILURES = 5
LOCKOUT_SECONDS = 30.0

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


class LoginLocked(Exception):
    def __init__(self, retry_after: float):
        super().__init__(f"{retry_after:.0f} 秒後に再試行してください")
        self.retry_after = retry_after


class ShareAuth:
    """1 回の serve の間だけ有効な、共有 URL とログインの状態。"""

    def __init__(self, password: str, lifetime_seconds: float, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self.token = secrets.token_urlsafe(TOKEN_BYTES)
        self.expires_at = clock() + lifetime_seconds
        # パスワードは平文で持たず、ソルト付きのハッシュだけを持つ
        self._salt = secrets.token_bytes(16)
        self._password_hash = self._hash(password)
        self._sessions: set[str] = set()
        self._failures = 0
        self._locked_until = 0.0

    @property
    def expired(self) -> bool:
        return self._clock() >= self.expires_at

    @property
    def remaining_seconds(self) -> float:
        return max(0.0, self.expires_at - self._clock())

    def token_matches(self, value: str | None) -> bool:
        return value is not None and secrets.compare_digest(value, self.token)

    def login(self, password: str) -> str:
        """パスワードが合えば新しいセッション ID を返し、違えば ValueError。続けて失敗すると LoginLocked。"""
        now = self._clock()
        if now < self._locked_until:
            raise LoginLocked(self._locked_until - now)
        if len(password) <= MAX_PASSWORD_LENGTH and secrets.compare_digest(self._hash(password), self._password_hash):
            self._failures = 0
            # ログインのたびに新しい ID を発行する (セッション固定攻撃への対策)
            session = secrets.token_urlsafe(SESSION_BYTES)
            self._sessions.add(session)
            return session
        self._failures += 1
        if self._failures >= MAX_FAILURES:
            # 失敗が続くほど待ち時間を倍にしていく
            self._locked_until = now + LOCKOUT_SECONDS * 2 ** (self._failures - MAX_FAILURES)
        raise ValueError("パスワードが違います")

    def session_valid(self, session: str | None) -> bool:
        if session is None or self.expired:
            return False
        return any(secrets.compare_digest(session, s) for s in self._sessions)

    def logout(self, session: str | None) -> None:
        self._sessions.discard(session)

    def end(self) -> None:
        """共有を終える。以降はどのセッションも使えない。"""
        self._sessions.clear()
        self.expires_at = self._clock()

    def _hash(self, password: str) -> bytes:
        return hashlib.scrypt(password.encode(), salt=self._salt, **_SCRYPT)


def parse_duration(text: str) -> float:
    """`2h`・`30m`・`90s` を秒にする。"""
    units = {"h": 3600, "m": 60, "s": 1}
    text = text.strip().lower()
    if len(text) < 2 or text[-1] not in units or not text[:-1].isdigit():
        raise ValueError(f"期限は 2h・30m・90s のように指定してください: {text}")
    seconds = int(text[:-1]) * units[text[-1]]
    if not 0 < seconds <= 24 * 3600:
        raise ValueError("期限は 1 秒から 24 時間までにしてください")
    return float(seconds)
