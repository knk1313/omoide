import { vi } from "vitest";

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

export const loggedIn = { "GET /api/health": { status: 200, body: { status: "ok" } } };
export const notLoggedIn = { "GET /api/health": { status: 401, body: { detail: "ログインしてください" } } };
