import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

from .export import export_video
from .inputs import find_videos
from .join import SPEEDS, PanelRef, SelectionError, join_segments, resolve_segments
from .probe import VideoInfo
from .cache import load_or_scan
from .scan import VideoScan
from .thumbnails import THUMBNAIL_DIR, ensure_thumbnails


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="setlog-join")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="入力動画をクリップと 3 人分のパネルに分割して一覧を表示する")
    scan.add_argument("--input", type=Path, default=Path("input"), help="入力フォルダ (既定: input)")
    scan.add_argument(
        "--export", type=Path, nargs="?", const=Path("output"), default=None,
        help="切り出したパネル動画を書き出す (既定: output)",
    )

    join = sub.add_parser("join", help="選んだパネルを人ごとにつなぎ、1 本の動画として書き出す")
    join.add_argument("--input", type=Path, default=Path("input"), help="入力フォルダ (既定: input)")
    join.add_argument(
        "--select", default=None,
        help="使うパネルを `<動画名>/<クリップ番号>-<パネル番号>` のカンマ区切りで指定する "
             "(例: collection_export/001-1,collection_export/002-3)。省略すると中身のあるパネルをすべて使う",
    )
    join.add_argument(
        "--speed", type=float, default=1.0, choices=SPEEDS, help="全体の再生速度 (既定: 1)",
    )
    join.add_argument("--output", type=Path, default=Path("output"), help="書き出し先のフォルダ (既定: output)")

    args = parser.parse_args(argv)
    if args.command == "scan":
        return scan_command(args.input, args.export)
    if args.command == "join":
        return join_command(args.input, args.select, args.speed, args.output)
    return 1


def scan_command(folder: Path, export_dir: Path | None) -> int:
    videos = _load_videos(folder)
    if videos is None:
        return 1

    scans = []
    for info in videos:
        try:
            scan = load_or_scan(info)
        except ValueError as e:
            return _fail(f"{info.path.name}: {e}")
        ensure_thumbnails(scan)
        _print_scan(scan)
        if export_dir is not None:
            export_video(scan, export_dir)
        scans.append(scan)

    total_clips = sum(len(s.clips) for s in scans)
    total_candidates = sum(s.candidate_count for s in scans)
    total_seconds = sum(s.info.duration for s in scans)
    print(f"\n合計: 動画 {len(scans)} 本 / {total_clips} クリップ / 中身のあるパネル {total_candidates} 件 / {total_seconds:.1f}s")
    print(f"サムネイル: {THUMBNAIL_DIR}/")
    if export_dir is not None:
        print(f"切り出したパネル動画: {export_dir}/")
    return 0


def join_command(folder: Path, select: str | None, speed: float, output_dir: Path) -> int:
    try:
        refs = [PanelRef.parse(text) for text in select.split(",")] if select is not None else None
    except SelectionError as e:
        return _fail(str(e))

    videos = _load_videos(folder)
    if videos is None:
        return 1

    scans = []
    for info in videos:
        try:
            scans.append(load_or_scan(info))
        except ValueError as e:
            return _fail(f"{info.path.name}: {e}")

    try:
        segments = resolve_segments(scans, refs)
    except SelectionError as e:
        return _fail("書き出せませんでした。\n" + "\n".join(f"  {p}" for p in e.problems))

    out_path = output_dir / f"omoide-{datetime.now():%Y%m%d-%H%M%S}.mp4"
    print(f"{len(segments)} 件のパネルを {speed:g}x でつないでいます…")
    join_segments(segments, speed, out_path)
    seconds = sum(s.clip.duration for s in segments) / speed
    print(f"書き出しました: {out_path}  (約 {seconds:.1f}s)")
    return 0


def _load_videos(folder: Path) -> list[VideoInfo] | None:
    """入力を確かめて動画の一覧を返す。使えないときはエラーを表示して None を返す。"""
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            _fail(f"{tool} が見つかりません。`brew install ffmpeg` でインストールしてください。")
            return None
    if not folder.is_dir():
        _fail(f"入力フォルダがありません: {folder}")
        return None
    videos = find_videos(folder)
    if not videos:
        _fail(f"{folder} に MP4 / MOV の動画がありません。")
        return None
    return videos


def _print_scan(scan: VideoScan) -> None:
    info = scan.info
    created = info.created_at.strftime("%Y-%m-%d %H:%M") if info.created_at else "日時不明"
    print(
        f"\n{info.path.name}  {created}  {info.width}x{info.height}  "
        f"{info.fps:g}fps  {info.duration:.1f}s  {len(scan.clips)} クリップ"
    )
    print("  パネル: " + "  ".join(f"{p.label} {p.width}x{p.height}+{p.x}+{p.y}" for p in scan.panels))
    for scanned in scan.clips:
        clip = scanned.clip
        marks = "  ".join(f"{p.label}{'○' if p in scanned.filled else '－'}" for p in scan.panels)
        print(f"  {clip.index:3d}  {clip.start:7.2f} – {clip.end:7.2f}  ({clip.duration:.2f}s)  {marks}")


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1
