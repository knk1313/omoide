import type { Job, JobKind, PanelClip, Project, Speed, Video } from "./types";

/** API がエラーを返した。status で場面を見分け、detail をそのまま利用者に見せてよい。 */
export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, detail: string) {
        super(detail);
        this.name = "ApiError";
        this.status = status;
    }

    /** ログインが要る（401）。ログイン画面へ移る。 */
    get needsLogin(): boolean {
        return this.status === 401;
    }

    /** 共有の期限が切れた（410）。Mac で serve を起動し直すまで、この端末からはもう使えない。 */
    get shareClosed(): boolean {
        return this.status === 410;
    }
}

const NETWORK_ERROR = "Mac につながりません。Mac と同じ Wi-Fi に接続しているか、Mac でサーバーが動いているかを確かめてください";

/**
 * 動画を送り、解析のジョブを返す。fetch では送った量が分からないので、XMLHttpRequest で進み具合（0〜1）を知らせる。
 */
export function uploadVideo(file: File, onProgress: (sent: number) => void): Promise<Job> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/videos");
        // 日本語などを含む名前も送れるよう、URL エンコードする
        xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
            let body: unknown = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                // JSON でない応答は、下で文言を付ける
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(body as Job);
                return;
            }
            const detail =
                body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
                    ? body.detail
                    : `エラーが発生しました（${xhr.status}）`;
            reject(new ApiError(xhr.status, detail));
        };
        xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR));
        xhr.send(file);
    });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(path, {
            method,
            // Cookie（入場用とセッション）は同じオリジンなので自動で付く
            credentials: "same-origin",
            headers: body === undefined ? undefined : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, NETWORK_ERROR);
    }
    if (!response.ok) {
        throw new ApiError(response.status, await errorDetail(response));
    }
    return (await response.json()) as T;
}

async function errorDetail(response: Response): Promise<string> {
    try {
        const data: unknown = await response.json();
        if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
            return data.detail;
        }
    } catch {
        // JSON でない応答（プロキシのエラーページなど）は、下の文言にする
    }
    return `エラーが発生しました（${response.status}）`;
}

export const api = {
    /** ログインしていれば成功し、していなければ 401（共有 URL を開いていなければ 404）。 */
    health: () => request<{ status: "ok" }>("GET", "/api/health"),
    login: (password: string) => request<{ status: "ok" }>("POST", "/api/session/login", { password }),
    logout: () => request<{ status: "ok" }>("POST", "/api/session/logout"),
    project: () => request<Project>("GET", "/api/project"),
    clips: () => request<PanelClip[]>("GET", "/api/clips"),
    setSelected: (id: string, selected: boolean) =>
        // ID の「/」は API のパスの区切りとしてそのまま渡す（docs/api.md）
        request<PanelClip>("PATCH", `/api/clips/${id.split("/").map(encodeURIComponent).join("/")}`, { selected }),
    /** まとめて採用・除外する。panel でユーザーを絞り、only なら対象以外を除外する。 */
    selectAll: (selected: boolean, options: { panel?: number; only?: boolean } = {}) =>
        request<Project>("POST", "/api/clips/select-all", { selected, ...options }),
    setSpeed: (speed: Speed) => request<Project>("PATCH", "/api/settings", { speed }),
    setVideoDate: (name: string, date: string | null) =>
        request<Video>("PATCH", `/api/videos/${encodeURIComponent(name)}`, { date }),
    startJob: (kind: Exclude<JobKind, "analyze">) => request<Job>("POST", kind === "preview" ? "/api/preview" : "/api/export"),
    job: (id: string) => request<Job>("GET", `/api/jobs/${encodeURIComponent(id)}`),
    clearTemporary: () => request<{ status: "ok" }>("DELETE", "/api/temporary"),
};
