// サーバーの API（docs/api.md）の型。

export type Speed = 0.5 | 1 | 1.5 | 2;

export type Project = {
    speed: Speed;
    /** 結合した動画の大きさ（つなぐ順で最初のパネル）。採用が 0 件なら null。 */
    frame: { width: number; height: number } | null;
    total_count: number;
    selected_count: number;
    /** 採用したパネルを選んだ速度でつないだときの長さ（秒）。 */
    estimated_seconds: number;
    videos: Video[];
};

export type Video = {
    name: string;
    created_at: string | null;
    /** 動画のメタデータから読んだ撮影日（`2026-09-19`）。日付を入力するときの初期値。 */
    metadata_date: string | null;
    /** 利用者が入力した撮影日（`2026-09-19`）。入力していなければ null。 */
    date: string | null;
    panel_count: number;
};

export type PanelClip = {
    /** `<動画名>/<クリップ番号>-<パネル番号>`。 */
    id: string;
    video: string;
    clip: number;
    /** 上から 1・2・3。 */
    panel: number;
    /** 「上」「中」「下」。 */
    label: string;
    /** パネルの大きさ。サムネイルと再生枠の縦横比に使う。 */
    width: number;
    height: number;
    start: number;
    duration: number;
    selected: boolean;
    thumbnail_url: string;
    video_url: string;
};

export type JobKind = "preview" | "export" | "analyze";
export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job = {
    id: string;
    kind: JobKind;
    status: JobStatus;
    /** 0〜1。 */
    progress: number;
    /** 失敗したときの、利用者が次に取る操作。 */
    error: string | null;
    /** 作り終えたときの再生先またはダウンロード先。 */
    url: string | null;
    /** 取り込んだ動画の解析を終えたときの、その動画。 */
    result: Video | null;
};

/** 保存先の種類。input = 取り込んだ動画、output = 完成版、work = 作業用ファイル（キャッシュ・サムネイル・プレビューなど）。 */
export type StorageKind = "input" | "output" | "work";

export type StorageFolders = Record<StorageKind, string>;

export type StorageStatus = {
    /** 画面から保存先を変えられるか（単体アプリだけ。開発環境では false）。 */
    editable: boolean;
    /** 今使っている保存先。 */
    current: StorageFolders;
    /** 次に起動したときに移す予定の保存先。 */
    pending: StorageFolders | null;
    /** よく使う場所（3 つの保存先をその下にまとめる）。 */
    presets: (StorageFolders & { label: string })[];
    /** 今の保存先にあるファイルの数と大きさ。 */
    usage: Record<StorageKind, { count: number; bytes: number }>;
};

/** Mac のブラウザーの「始める」画面（launcher）の様子。 */
export type LauncherStatus = {
    state: "idle" | "running";
    /** スマホで開く共有の URL（共有中だけ）。 */
    url: string | null;
    /** 共有を終える時刻（ISO 8601、共有中だけ）。 */
    ends_at: string | null;
    /** 読み込んだ動画の数（共有中だけ）。 */
    videos: number | null;
    /** 共有が止まった理由など、画面に出すお知らせ。 */
    notice: string | null;
    storage: StorageFolders;
};

/** 共有の期限の選択肢。 */
export type ShareExpiry = "1h" | "2h" | "4h";
