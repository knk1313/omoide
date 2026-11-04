import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LauncherStatus } from "@/api/types";
import { expectNoA11yViolations } from "@/test/axe";
import { fakeServer } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";
import { statusPolling } from "./LauncherPage";

const storage = { input: "/Users/me/omoide/input", output: "/Users/me/omoide/output", work: "/Users/me/omoide/.setlog-join" };
const idle: LauncherStatus = { state: "idle", url: null, ends_at: null, videos: null, notice: null, storage };
const running: LauncherStatus = {
    state: "running",
    url: "http://192.168.1.20:8080/p/abc",
    ends_at: "2026-11-04T16:30:00+09:00",
    videos: 3,
    notice: null,
    storage,
};

beforeEach(() => {
    statusPolling.intervalMs = 20;
});
afterEach(() => {
    statusPolling.intervalMs = 3000;
});

async function openLauncher(routes: Parameters<typeof fakeServer>[0]) {
    const server = fakeServer(routes);
    const app = renderApp("/launcher");
    return { server, ...app };
}

describe("Mac のブラウザーの「始める」画面", () => {
    it("パスワードと期限を決めて共有を始めると、QR コードと URL を出す", async () => {
        const { server, user } = await openLauncher({
            "GET /launcher/api/status": { status: 200, body: idle },
            "POST /launcher/api/start": { status: 200, body: running },
        });
        // 見出しは読み込み中から出るので、読み込んだ中身（保存先）が出るまで待つ
        expect(await screen.findByText("/Users/me/omoide/input")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "omoideを始める" })).toBeInTheDocument();
        // スマホの手順やログインの画面ではない
        expect(screen.queryByRole("navigation", { name: "手順" })).not.toBeInTheDocument();

        await user.type(screen.getByLabelText(/^パスワード※必須/), "secret");
        await user.type(screen.getByLabelText(/^パスワード（確認）/), "secret");
        await user.click(screen.getByRole("radio", { name: "4時間" }));
        await user.click(screen.getByRole("button", { name: "共有を始める" }));

        expect(await screen.findByRole("heading", { level: 1, name: "スマホでQRコードを読み取ってください" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "共有のURLのQRコード" })).toHaveAttribute("src", expect.stringContaining("/launcher/api/qr.svg"));
        expect(screen.getByText("http://192.168.1.20:8080/p/abc")).toBeInTheDocument();
        expect(screen.getByText("3本")).toBeInTheDocument();
        expect(server.calls).toContainEqual({ method: "POST", path: "/launcher/api/start", body: { password: "secret", expires: "4h" } });
    });

    it("短いパスワードや確認の食い違いは、送らずに入力欄の下に理由を出す", async () => {
        const { server, user } = await openLauncher({ "GET /launcher/api/status": { status: 200, body: idle } });
        const password = await screen.findByLabelText(/^パスワード※必須/);
        await user.type(password, "abc");
        await user.click(screen.getByRole("button", { name: "共有を始める" }));
        expect(password).toHaveAttribute("aria-invalid", "true");
        expect(password).toHaveAccessibleDescription(/4文字以上にしてください/);

        await user.type(password, "d");
        await user.type(screen.getByLabelText(/^パスワード（確認）/), "abce");
        await user.click(screen.getByRole("button", { name: "共有を始める" }));
        expect(screen.getByLabelText(/^パスワード（確認）/)).toHaveAccessibleDescription(/同じものを入力してください/);
        expect(server.calls.some((c) => c.method === "POST")).toBe(false);
    });

    it("始められないときは、Mac 側の理由を出す", async () => {
        const { user } = await openLauncher({
            "GET /launcher/api/status": { status: 200, body: idle },
            "POST /launcher/api/start": { status: 409, body: { detail: "ポート8080は使用中です" } },
        });
        await user.type(await screen.findByLabelText(/^パスワード※必須/), "secret");
        await user.type(screen.getByLabelText(/^パスワード（確認）/), "secret");
        await user.click(screen.getByRole("button", { name: "共有を始める" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("ポート8080は使用中です");
    });

    it("共有を止めると、始める画面に戻り、その旨を出す", async () => {
        let stopped = false;
        const afterStop = { ...idle, notice: "共有を止めました" };
        const { user } = await openLauncher({
            "GET /launcher/api/status": () => ({ status: 200, body: stopped ? afterStop : running }),
            "POST /launcher/api/stop": () => {
                stopped = true;
                return { status: 200, body: afterStop };
            },
        });
        await user.click(await screen.findByRole("button", { name: "共有を止める" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "止める" }));
        expect(await screen.findByRole("heading", { level: 1, name: "omoideを始める" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "共有を止めました" })).toBeInTheDocument();
    });

    it("期限が来て止まったら、読み直して始める画面に戻る", async () => {
        let expired = false;
        await openLauncher({
            "GET /launcher/api/status": () => ({ status: 200, body: expired ? { ...idle, notice: "期限が来たので、共有を終えました" } : running }),
        });
        await screen.findByRole("heading", { name: "スマホでQRコードを読み取ってください" });
        expired = true;
        expect(await screen.findByRole("heading", { name: "期限が来たので、共有を終えました" })).toBeInTheDocument();
    });

    it("omoide を終了すると、タブを閉じてよいと案内する", async () => {
        const { server, user } = await openLauncher({
            "GET /launcher/api/status": { status: 200, body: running },
            "POST /launcher/api/quit": { status: 200, body: { status: "ok" } },
        });
        await user.click(await screen.findByRole("button", { name: "omoideを終了する" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "終了する" }));
        expect(await screen.findByRole("heading", { name: "omoideを終了しました" })).toBeInTheDocument();
        await waitFor(() => expect(server.calls.some((c) => c.path === "/launcher/api/quit")).toBe(true));
    });

    it("Mac の外から開いたなどで使えないときは、理由を出す", async () => {
        await openLauncher({ "GET /launcher/api/status": { status: 403, body: { detail: "omoideを起動し直して、開いた画面から操作してください" } } });
        expect(await screen.findByRole("alert")).toHaveTextContent("起動し直して");
    });

    it("アクセシビリティ違反がない（始める前と共有中）", async () => {
        const { container } = await openLauncher({ "GET /launcher/api/status": { status: 200, body: idle } });
        await screen.findByRole("button", { name: "共有を始める" });
        await expectNoA11yViolations(container);
    });

    it("アクセシビリティ違反がない（共有中）", async () => {
        const { container } = await openLauncher({ "GET /launcher/api/status": { status: 200, body: running } });
        await screen.findByRole("button", { name: "共有を止める" });
        await expectNoA11yViolations(container);
    });
});
