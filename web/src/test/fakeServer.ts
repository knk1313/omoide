import { vi } from "vitest";
import type { PanelClip, Project } from "@/api/types";

type Reply = { status: number; body?: unknown } | Error;
type Handler = Reply | ((body: unknown) => Reply);

/**
 * fetch を差し替え、`"METHOD /path"` ごとに決めた応答を返す。呼ばれた要求は calls に残る。
 * Error を渡すと、Mac につながらないときと同じく fetch 自体が失敗する。
 */
export function fakeServer(routes: Record<string, Handler>) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, path, body });
        const handler = routes[`${method} ${path}`];
        if (handler === undefined) {
            return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
        }
        const reply = typeof handler === "function" ? handler(body) : handler;
        if (reply instanceof Error) throw reply;
        return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls };
}

function panel(video: string, clip: number, panel: number, selected = true): PanelClip {
    const id = `${video}/${String(clip).padStart(3, "0")}-${panel}`;
    return {
        id, video, clip, panel, label: ["上", "中", "下"][panel - 1], start: (clip - 1) * 2, duration: 2, selected,
        thumbnail_url: `/media/thumbnails/${id}`, video_url: `/media/clips/${id}`,
    };
}

/** 2 本の動画から 3 件のパネル。sep の 2 件目だけ除外している。 */
export const sampleClips: PanelClip[] = [panel("sep", 1, 2), panel("sep", 2, 3, false), panel("oct", 1, 1)];

export const sampleProject: Project = {
    speed: 1,
    total_count: 3,
    selected_count: 2,
    estimated_seconds: 4,
    videos: [
        { name: "sep", created_at: "2026-09-19T05:21:54+00:00", panel_count: 2 },
        { name: "oct", created_at: null, panel_count: 1 },
    ],
};

/** ログイン済みで、sampleProject と sampleClips を返すサーバー。 */
export const loggedIn = {
    "GET /api/health": { status: 200, body: { status: "ok" } },
    "GET /api/project": { status: 200, body: sampleProject },
    "GET /api/clips": { status: 200, body: sampleClips },
    "POST /api/preview": { status: 202, body: { id: "job-1", kind: "preview", status: "queued", progress: 0, error: null, url: null } },
};
export const notLoggedIn = { "GET /api/health": { status: 401, body: { detail: "ログインしてください" } } };
