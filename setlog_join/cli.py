import argparse
import shutil
import sys
from pathlib import Path

from .export import export_video
from .inputs import find_videos
from .scan import VideoScan, scan_video


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="setlog-join")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="入力動画をクリップと 3 人分のパネルに分割して一覧を表示する")
    scan.add_argument("--input", type=Path, default=Path("input"), help="入力フォルダ (既定: input)")
    scan.add_argument(
        "--export", type=Path, nargs="?", const=Path("output"), default=None,
        help="切り出したパネル動画を書き出す (既定: output)",
    )

    args = parser.parse_args(argv)
    if args.command == "scan":
        return scan_command(args.input, args.export)
    return 1


def scan_command(folder: Path, export_dir: Path | None) -> int:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            return _fail(f"{tool} が見つかりません。`brew install ffmpeg` でインストールしてください。")
    if not folder.is_dir():
        return _fail(f"入力フォルダがありません: {folder}")

    videos = find_videos(folder)
    if not videos:
        return _fail(f"{folder} に MP4 / MOV の動画がありません。")

    scans = []
    for info in videos:
        try:
            scan = scan_video(info)
        except ValueError as e:
            return _fail(f"{info.path.name}: {e}")
        _print_scan(scan)
        if export_dir is not None:
            export_video(scan, export_dir)
        scans.append(scan)

    total_clips = sum(len(s.clips) for s in scans)
    total_candidates = sum(s.candidate_count for s in scans)
    total_seconds = sum(s.info.duration for s in scans)
    print(f"\n合計: 動画 {len(scans)} 本 / {total_clips} クリップ / 中身のあるパネル {total_candidates} 件 / {total_seconds:.1f}s")
    if export_dir is not None:
        print(f"切り出したパネル動画: {export_dir}/")
    return 0


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
