import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, requestTimeout } from "./client";

function respond(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("api", () => {
    it("JSONを送って結果を返す", async () => {
        const fetchMock = respond(200, { status: "ok" });
        await expect(api.login("secret")).resolves.toEqual({ status: "ok" });
        const [path, init] = fetchMock.mock.calls[0];
        expect(path).toBe("/api/session/login");
        expect(init).toMatchObject({ method: "POST", credentials: "same-origin", body: JSON.stringify({ password: "secret" }) });
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
    });

    it("パネルのIDの「/」はパスの区切りのまま、ほかの文字はエンコードする", async () => {
        const fetchMock = respond(200, {});
        await api.setSelected("my video/003-2", false);
        expect(fetchMock.mock.calls[0][0]).toBe("/api/clips/my%20video/003-2");
    });

    it("エラーのdetailをそのまま利用者向けの文言にする", async () => {
        respond(401, { detail: "パスワードが違います" });
        const error = await api.login("wrong").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe("パスワードが違います");
        expect((error as ApiError).needsLogin).toBe(true);
    });

    it("期限切れを見分けられる", async () => {
        respond(410, { detail: "共有の期限が切れました" });
        const error = (await api.project().catch((e: unknown) => e)) as ApiError;
        expect(error.shareClosed).toBe(true);
        expect(error.needsLogin).toBe(false);
    });

    it("JSONでないエラーにも文言を付ける", async () => {
        respond(502, "<html>Bad Gateway</html>");
        await expect(api.clips()).rejects.toThrow("エラーが発生しました（502）");
    });

    it("つながらないときは、Wi-Fiとサーバーを確かめるよう案内する", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        const error = (await api.project().catch((e: unknown) => e)) as ApiError;
        expect(error.status).toBe(0);
        expect(error.message).toContain("Wi-Fi");
    });

    it("応答が返らないまま待たされたら打ち切り、つながらないものとして扱う", async () => {
        const before = requestTimeout.ms;
        requestTimeout.ms = 20;
        // 打ち切られるまで返らない fetch
        vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })));
        try {
            const error = (await api.project().catch((e: unknown) => e)) as ApiError;
            expect(error.status).toBe(0);
            expect(error.message).toContain("Wi-Fi");
        } finally {
            requestTimeout.ms = before;
        }
    });
});
