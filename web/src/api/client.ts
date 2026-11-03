import type { Job, JobKind, PanelClip, Project, Speed } from "./types";

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
    startJob: (kind: JobKind) => request<Job>("POST", kind === "preview" ? "/api/preview" : "/api/export"),
    job: (id: string) => request<Job>("GET", `/api/jobs/${encodeURIComponent(id)}`),
    clearTemporary: () => request<{ status: "ok" }>("DELETE", "/api/temporary"),
};
