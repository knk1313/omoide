"""画面 (web/) のビルドが、ソースより古くないかを確かめる。

serve はビルド済みの web/dist を配信するので、ソースを変えてもビルドし直さないと古い画面が出る。
"""

from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
# ビルドの結果に効くファイルとフォルダ
_SOURCES = ("src", "public", "index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.app.json")


def build_problem(web_dir: Path = WEB_DIR) -> str | None:
    """ビルドが無い・古いときは、利用者向けの案内を返す。問題が無ければ None。"""
    built = web_dir / "dist" / "index.html"
    if not built.is_file():
        return "画面がまだビルドされていません。`cd web && npm run build` を実行してください。"
    newest = _newest_source(web_dir)
    # ソースが無い（配布したパッケージなど）ときは比べようがないので、何も言わない
    if newest is None or newest[0] <= built.stat().st_mtime:
        return None
    changed = newest[1].relative_to(web_dir)
    return (
        f"画面のソース（web/{changed} など）が、ビルドより新しくなっています。"
        "古い画面が表示されるので、`cd web && npm run build` を実行してから起動し直してください。"
    )


def _newest_source(web_dir: Path) -> tuple[float, Path] | None:
    newest: tuple[float, Path] | None = None
    for name in _SOURCES:
        root = web_dir / name
        paths = [p for p in root.rglob("*") if p.is_file()] if root.is_dir() else [root] if root.is_file() else []
        for path in paths:
            # テストはビルドの結果に効かないので比べない
            if ".test." in path.name or "test" in path.relative_to(web_dir).parts[:-1]:
                continue
            mtime = path.stat().st_mtime
            if newest is None or mtime > newest[0]:
                newest = (mtime, path)
    return newest
