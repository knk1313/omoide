import argparse
import getpass
import shutil
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path

from .auth import MAX_PASSWORD_LENGTH, ShareAuth, parse_duration
from .cache import load_or_scan
from .clean import WORK_DIR, clean_targets, format_size, remove
from .export import export_video
from .inputs import find_videos
from .join import SPEEDS, PanelRef, SelectionError, join_segments, resolve_segments
from .network import port_available, resolve_host
from .probe import VideoInfo
from .project import load_project
from .scan import VideoScan
from .thumbnails import THUMBNAIL_DIR, ensure_thumbnails


MIN_PASSWORD_LENGTH = 4


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
             "(例: collection_export/001-1,collection_export/002-3)。"
             "省略すると project.json で除外していない、中身のあるパネルをすべて使う",
    )
    join.add_argument(
        "--speed", type=float, default=None, choices=SPEEDS,
        help="全体の再生速度。省略すると project.json に保存した速度 (無ければ 1) を使う",
    )
    join.add_argument("--output", type=Path, default=Path("output"), help="書き出し先のフォルダ (既定: output)")

    serve = sub.add_parser("serve", help="同じ Wi-Fi のスマホから操作するためのサーバーを起動する")
    serve.add_argument("--input", type=Path, default=Path("input"), help="入力フォルダ (既定: input)")
    serve.add_argument(
        "--host", default=None,
        help="待ち受けるアドレス。省略すると、この Mac の LAN のプライベートアドレスを使う",
    )
    serve.add_argument("--port", type=int, default=8080, help="待ち受けるポート (既定: 8080)")
    serve.add_argument(
        "--expires", default="2h", help="共有を終えるまでの時間。2h・30m・90s のように指定する (既定: 2h)",
    )

    clean = sub.add_parser(
        "clean", help="入力動画と、そこから作った生成物をまとめて消す（serve を止めてから実行する）",
    )
    clean.add_argument("--input", type=Path, default=Path("input"), help="入力フォルダ (既定: input)")
    clean.add_argument("--output", type=Path, default=Path("output"), help="書き出し先のフォルダ (既定: output)")
    clean.add_argument("--yes", action="store_true", help="確認せずに消す")

    args = parser.parse_args(argv)
    if args.command == "scan":
        return scan_command(args.input, args.export)
    if args.command == "join":
        return join_command(args.input, args.select, args.speed, args.output)
    if args.command == "serve":
        return serve_command(args.input, args.host, args.port, args.expires)
    if args.command == "clean":
        return clean_command(args.input, args.output, args.yes)
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


def join_command(folder: Path, select: str | None, speed: float | None, output_dir: Path) -> int:
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

    project = load_project()
    if refs is None:
        refs = project.selected_refs(scans)
    if speed is None:
        speed = project.speed

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


def clean_command(input_dir: Path, output_dir: Path, yes: bool, work_dir: Path = WORK_DIR) -> int:
    targets = clean_targets(input_dir, output_dir, work_dir)
    if not targets:
        print("消すものはありません。")
        return 0

    print("次を消します。元に戻せません。")
    for target in targets:
        suffix = "/" if target.path.is_dir() else ""
        print(f"  {target.path}{suffix}  ({format_size(target.size)})")
    print(f"合計 {format_size(sum(t.size for t in targets))}。選んだクリップ・速度・撮影日（project.json）も消えます。")
    print("serve を動かしている場合は、先に止めてください。")

    if not yes:
        try:
            answer = input("消しますか？ [y/N] ")
        except EOFError:
            answer = ""
        if answer.strip().lower() not in ("y", "yes"):
            print("やめました。何も消していません。")
            return 1

    remove(targets)
    print(f"{len(targets)} 件を消しました。")
    return 0


def serve_command(folder: Path, host: str | None, port: int, expires: str) -> int:
    # サーバーの依存は scan / join では使わないので、ここで読み込む
    import uvicorn

    from .server import create_app
    from .webbuild import build_problem
    from .workspace import Workspace

    try:
        host = resolve_host(host)
        lifetime = parse_duration(expires)
    except ValueError as e:
        return _fail(str(e))
    if not port_available(host, port):
        return _fail(f"ポート {port} は使用中です。--port で別の番号を指定してください。")

    # 解析を待たずに席を外せるよう、パスワードは先に聞く
    password = _ask_password()
    if password is None:
        return _fail("パスワードが設定されなかったため、終了します。")

    if not _tools_available():
        return 1
    # スマホから動画を取り込めるので、入力フォルダが空でも起動する
    folder.mkdir(parents=True, exist_ok=True)
    scans = []
    for info in find_videos(folder):
        try:
            scan = load_or_scan(info)
        except ValueError as e:
            # 1 本読めなくても、ほかの動画で使えるようにする
            print(f"{info.path.name} は読み飛ばします: {e}", file=sys.stderr)
            continue
        ensure_thumbnails(scan)
        scans.append(scan)
    panels = sum(s.candidate_count for s in scans)
    if not scans:
        print("動画はまだありません。スマホの画面からアップロードできます。")
    print(f"動画 {len(scans)} 本 / 中身のあるパネル {panels} 件を読み込みました。")

    problem = build_problem()
    if problem:
        print(f"\n注意: {problem}", file=sys.stderr)

    auth = ShareAuth(password, lifetime)
    url = f"http://{host}:{port}/p/{auth.token}"
    ends_at = datetime.now() + timedelta(seconds=lifetime)
    print(f"\nURL: {url}")
    print(f"期限: {ends_at:%H:%M} まで")
    _print_qr(url)
    # uvicorn が動き出すと戻らないので、案内を先に出し切る
    print("同じ Wi-Fi に接続したスマホで QR コードを読み取ってください。終了するには Ctrl+C を押してください。", flush=True)

    # スマホから取り込んだ動画も、入力フォルダに置く（次に起動したときも読み込まれる）
    app = create_app(Workspace(scans), auth, upload_dir=folder)
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    expiry = threading.Timer(lifetime, lambda: setattr(server, "should_exit", True))
    expiry.daemon = True
    expiry.start()
    try:
        server.run()
    except KeyboardInterrupt:
        # uvicorn は Ctrl+C で止まった後に KeyboardInterrupt を送出し直す。利用者の通常の終了なので、そのまま終える
        pass
    finally:
        expiry.cancel()
        auth.end()
    print("共有を終了しました。この URL にはもうアクセスできません。")
    return 0


def _ask_password() -> str | None:
    """パスワードをターミナルで対話入力する。コマンド引数で受け取らず、シェルの履歴に残さない。"""
    for _ in range(3):
        try:
            password = getpass.getpass("スマホで入力するパスワード: ")
            if len(password) < MIN_PASSWORD_LENGTH:
                print(f"{MIN_PASSWORD_LENGTH} 文字以上にしてください。")
                continue
            if len(password) > MAX_PASSWORD_LENGTH:
                print(f"{MAX_PASSWORD_LENGTH} 文字以内にしてください。")
                continue
            if getpass.getpass("もう一度入力してください: ") != password:
                print("一致しませんでした。")
                continue
        except (EOFError, KeyboardInterrupt):
            print()
            return None
        return password
    return None


def _print_qr(url: str) -> None:
    import qrcode

    qr = qrcode.QRCode(border=2)
    qr.add_data(url)
    # 端末なら白黒の色を明示して、背景色のテーマによらず読み取れるようにする
    qr.print_ascii(tty=sys.stdout.isatty())


def _tools_available() -> bool:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            _fail(f"{tool} が見つかりません。`brew install ffmpeg` でインストールしてください。")
            return False
    return True


def _load_videos(folder: Path) -> list[VideoInfo] | None:
    """入力を確かめて動画の一覧を返す。使えないときはエラーを表示して None を返す。"""
    if not _tools_available():
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
