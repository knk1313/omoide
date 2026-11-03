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
    videos: { name: string; created_at: string | null; panel_count: number }[];
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

export type JobKind = "preview" | "export";
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
};
