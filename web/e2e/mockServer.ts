import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import type { Job, PanelClip, Project, Speed, Video } from "../src/api/types";

// E2E 用の、Mac 側サーバー（docs/api.md）の代わり。page.route で API と動画の要求に応える。
// 状態（ログイン・採用・速度・撮影日・ジョブ）を持つので、画面の操作の結果が次の画面に反映される。

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const CLIP = fixture("clip.mp4");
const THUMBS = [fixture("thumb1.jpg"), fixture("thumb2.jpg"), fixture("thumb3.jpg")];

export const PASSWORD = "omoide";

export type MockOptions = {
    /** ログイン済みで始める。 */
    loggedIn?: boolean;
    /** 動画を取り込んでいない状態で始める。 */
    empty?: boolean;
    /** 次の要求を失敗させる（"METHOD /path" → [status, detail]）。1 回だけ効く。 */
    failOnce?: Record<string, [number, string]>;
    /** ジョブを作り終えるまでの、進み具合を取りに来る回数。 */
    jobSteps?: number;
};

function panel(video: string, clip: number, panelNo: number, selected = true): PanelClip {
    const id = `${video}/${String(clip).padStart(3, "0")}-${panelNo}`;
    return {
        id, video, clip, panel: panelNo, label: `ユーザー${panelNo}`, width: 1160, height: 634,
        start: (clip - 1) * 2, duration: 2, selected,
        thumbnail_url: `/media/thumbnails/${id}`, video_url: `/media/clips/${id}`,
    };
}

function sampleClips(): PanelClip[] {
    const clips: PanelClip[] = [];
    for (let clip = 1; clip <= 3; clip += 1) {
        for (let p = 1; p <= 3; p += 1) clips.push(panel("20260919", clip, p, !(clip === 2 && p === 3)));
    }
    clips.push(panel("20261012", 1, 1), panel("20261012", 1, 2));
    return clips;
}

function sampleVideos(): Video[] {
    return [
        { name: "20260919", created_at: "2026-09-19T05:21:54+00:00", metadata_date: "2026-09-19", date: "2026-09-20", panel_count: 9 },
        { name: "20261012", created_at: null, metadata_date: null, date: null, panel_count: 2 },
    ];
}

export async function mockServer(page: Page, options: MockOptions = {}) {
    let loggedIn = options.loggedIn ?? true;
    let speed: Speed = 1;
    let clips = options.empty ? [] : sampleClips();
    let videos = options.empty ? [] : sampleVideos();
    const failOnce = { ...options.failOnce };
    const jobs = new Map<string, Job & { polls: number }>();
    const calls: { method: string; path: string; body: unknown }[] = [];
    let jobSeq = 0;

    const project = (): Project => {
        const selected = clips.filter((c) => c.selected);
        return {
            speed,
            frame: selected.length > 0 ? { width: 1160, height: 634 } : null,
            total_count: clips.length,
            selected_count: selected.length,
            estimated_seconds: selected.reduce((sum, c) => sum + c.duration, 0) / speed,
            videos,
        };
    };

    function newJob(kind: Job["kind"], result: Video | null = null): Job {
        jobSeq += 1;
        const job = { id: `${kind}-${jobSeq}`, kind, status: "queued" as const, progress: 0, error: null, url: null, result: null, polls: 0, pending: result };
        jobs.set(job.id, job);
        return strip(job);
    }

    function strip(job: Job & { polls: number; pending?: Video | null }): Job {
        const { polls: _polls, pending: _pending, ...rest } = job;
        void _polls;
        void _pending;
        return rest;
    }

    const json = (route: Route, status: number, body: unknown) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    await page.route(/\/(api|media|download)\//, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const path = url.pathname;
        const key = `${method} ${path}`;
        let body: unknown = null;
        try {
            body = request.postDataJSON();
        } catch {
            // 動画の送信は JSON ではない
        }
        calls.push({ method, path, body: method === "POST" && path === "/api/videos" ? "(file)" : body });

        if (failOnce[key]) {
            const [status, detail] = failOnce[key];
            delete failOnce[key];
            return json(route, status, { detail });
        }

        if (path.startsWith("/media/thumbnails/")) {
            const panelNo = Number(path.at(-1)) || 1;
            return route.fulfill({ status: 200, contentType: "image/jpeg", body: THUMBS[(panelNo - 1) % 3] });
        }
        if (path.startsWith("/media/") || path.startsWith("/download/")) {
            return route.fulfill({ status: 200, contentType: "video/mp4", body: CLIP });
        }

        if (key === "GET /api/health") return loggedIn ? json(route, 200, { status: "ok" }) : json(route, 401, { detail: "ログインしてください" });
        if (key === "POST /api/session/login") {
            if ((body as { password?: string })?.password !== PASSWORD) return json(route, 401, { detail: "パスワードが違います" });
            loggedIn = true;
            return json(route, 200, { status: "ok" });
        }
        if (!loggedIn) return json(route, 401, { detail: "ログインしてください" });

        if (key === "GET /api/project") return json(route, 200, project());
        if (key === "GET /api/clips") return json(route, 200, clips);
        if (key === "PATCH /api/settings") {
            speed = (body as { speed: Speed }).speed;
            return json(route, 200, project());
        }
        if (key === "POST /api/clips/select-all") {
            const { selected, panel: only, only: exclusive } = body as { selected: boolean; panel?: number; only?: boolean };
            clips = clips.map((c) => (only === undefined || c.panel === only ? { ...c, selected } : exclusive ? { ...c, selected: false } : c));
            return json(route, 200, project());
        }
        if (method === "PATCH" && path.startsWith("/api/clips/")) {
            const id = decodeURIComponent(path.slice("/api/clips/".length));
            clips = clips.map((c) => (c.id === id ? { ...c, selected: (body as { selected: boolean }).selected } : c));
            return json(route, 200, clips.find((c) => c.id === id));
        }
        if (method === "DELETE" && path.startsWith("/api/videos/")) {
            const name = decodeURIComponent(path.slice("/api/videos/".length));
            if (!videos.some((v) => v.name === name)) return json(route, 404, { detail: "動画がありません" });
            videos = videos.filter((v) => v.name !== name);
            clips = clips.filter((c) => c.video !== name);
            return json(route, 200, project());
        }
        if (method === "PATCH" && path.startsWith("/api/videos/")) {
            const name = decodeURIComponent(path.slice("/api/videos/".length));
            // サーバーと同じく、ほかの動画と同じ撮影日は 409 で断る
            const date = (body as { date: string | null }).date;
            const other = videos.find((v) => v.name !== name && date !== null && v.date === date);
            if (other) return json(route, 409, { detail: `その日付は「${other.name}」の撮影日になっています` });
            videos = videos.map((v) => (v.name === name ? { ...v, date: (body as { date: string | null }).date } : v));
            return json(route, 200, videos.find((v) => v.name === name));
        }
        if (key === "POST /api/videos") {
            const name = decodeURIComponent(request.headers()["x-file-name"] ?? "video.mp4").replace(/\.[^.]+$/, "");
            const video: Video = { name, created_at: "2026-11-01T03:00:00+00:00", metadata_date: "2026-11-01", date: null, panel_count: 3 };
            return json(route, 202, newJob("analyze", video));
        }
        if (key === "POST /api/preview" || key === "POST /api/export") {
            if (clips.every((c) => !c.selected)) return json(route, 422, { detail: "採用しているパネルがありません。クリップを選んでください" });
            return json(route, 202, newJob(key === "POST /api/preview" ? "preview" : "export"));
        }
        if (method === "GET" && path.startsWith("/api/jobs/")) {
            const job = jobs.get(decodeURIComponent(path.slice("/api/jobs/".length))) as (Job & { polls: number; pending?: Video | null }) | undefined;
            if (!job) return json(route, 404, { detail: "ジョブがありません" });
            job.polls += 1;
            const steps = options.jobSteps ?? 2;
            if (job.polls >= steps) {
                job.status = "done";
                job.progress = 1;
                if (job.kind === "analyze" && job.pending) {
                    const video = job.pending;
                    videos = [...videos, video];
                    clips = [...clips, panel(video.name, 1, 1), panel(video.name, 1, 2), panel(video.name, 1, 3)];
                    job.result = video;
                    job.pending = null;
                } else if (job.kind !== "analyze") {
                    job.url = job.kind === "preview" ? `/media/preview?v=${job.id}` : "/download/output";
                }
            } else {
                job.status = "running";
                job.progress = job.polls / steps;
            }
            return json(route, 200, strip(job));
        }
        return json(route, 404, { detail: "Not Found" });
    });

    return { calls };
}
