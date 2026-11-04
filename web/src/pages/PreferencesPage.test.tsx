import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/context/ThemePreference";
import { expectNoA11yViolations } from "@/test/axe";
import { fakeServer, loggedIn, notLoggedIn, sampleProject, sampleStorage } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";

async function openPreferences() {
    fakeServer(loggedIn);
    const app = renderApp("/preferences");
    await screen.findByRole("heading", { name: "設定" });
    return app;
}

describe("設定画面", () => {
    it("ヘッダーの「設定」から開ける", async () => {
        fakeServer(loggedIn);
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("link", { name: "設定" }));
        expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("aria-current", "page");
        // 手順の画面ではないので、手順の表示は出さない
        expect(screen.queryByRole("navigation", { name: "手順" })).not.toBeInTheDocument();
    });

    it("ログインする前は「設定」を出さない", async () => {
        fakeServer(notLoggedIn);
        renderApp("/login");
        await screen.findByRole("heading", { name: "パスワードを入力" });
        expect(screen.queryByRole("link", { name: "設定" })).not.toBeInTheDocument();
    });

    it("配色を選ぶと、すぐに切り替わり、このブラウザーに保存する", async () => {
        const { user } = await openPreferences();
        expect(screen.getByRole("radio", { name: "スマホの設定に合わせる" })).toBeChecked();

        await user.click(screen.getByRole("radio", { name: /ダーク/ }));
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

        await user.click(screen.getByRole("radio", { name: /ライト/ }));
        expect(document.documentElement.dataset.theme).toBe("light");

        // 「スマホの設定に合わせる」に戻すと、保存した値を消す
        await user.click(screen.getByRole("radio", { name: "スマホの設定に合わせる" }));
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it("前の画面に戻れる", async () => {
        fakeServer(loggedIn);
        const { user } = renderApp("/settings");
        await screen.findByRole("heading", { name: "速度を選ぶ" });
        await user.click(screen.getByRole("link", { name: "設定" }));
        await user.click(await screen.findByRole("button", { name: "前の画面に戻る" }));
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = await openPreferences();
        await expectNoA11yViolations(container);
    });
});

describe("設定画面の保存先", () => {
    it("今の保存先と、それぞれのファイルの数と大きさを示す", async () => {
        await openPreferences();
        const input = await screen.findByLabelText(/^動画/);
        expect(input).toHaveValue("/Users/me/omoide/input");
        expect(input).toHaveAccessibleDescription(/今は2件・29MB/);
        // 変えていないうちは、保存先を変えるボタンを押せない
        expect(screen.getByRole("button", { name: "保存先を変える" })).toBeDisabled();
    });

    it("よく使う場所を選び、確かめてから、次の起動で移す予定として保存する", async () => {
        const pending = {
            ...sampleStorage,
            pending: { input: "/Users/me/Movies/omoide/input", output: "/Users/me/Movies/omoide/output", work: "/Users/me/Movies/omoide/.setlog-join" },
        };
        const server = fakeServer({ ...loggedIn, "PUT /api/storage": { status: 200, body: pending } });
        const { user } = renderApp("/preferences");
        await user.click(await screen.findByRole("button", { name: "ムービー" }));
        expect(screen.getByLabelText(/^完成版/)).toHaveValue("/Users/me/Movies/omoide/output");

        await user.click(screen.getByRole("button", { name: "保存先を変える" }));
        const dialog = screen.getByRole("dialog", { name: "保存先を変えますか" });
        expect(dialog).toHaveTextContent("次にMacでomoideを起動したときに");
        await user.click(within(dialog).getByRole("button", { name: "変える" }));

        expect(await screen.findByRole("heading", { name: "次の起動で、保存先を変えます" })).toBeInTheDocument();
        expect(server.calls).toContainEqual({ method: "PUT", path: "/api/storage", body: pending.pending });
    });

    it("使えない保存先なら、サーバーの理由を入力欄の上に出す", async () => {
        fakeServer({ ...loggedIn, "PUT /api/storage": { status: 422, body: { detail: "動画の保存先「/x」は空ではありません" } } });
        const { user } = renderApp("/preferences");
        const input = await screen.findByLabelText(/^動画/);
        await user.clear(input);
        await user.type(input, "/x");
        await user.click(screen.getByRole("button", { name: "保存先を変える" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "変える" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("空ではありません");
        expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("開発環境では、保存先を示すだけで変えられない", async () => {
        fakeServer({ ...loggedIn, "GET /api/storage": { status: 200, body: { ...sampleStorage, editable: false, presets: [] } } });
        renderApp("/preferences");
        expect(await screen.findByText(/開発環境では/)).toBeInTheDocument();
        expect(screen.getByText("/Users/me/omoide/input")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "保存先を変える" })).not.toBeInTheDocument();
    });
});

describe("設定画面のデータを消す", () => {
    it("消すものを示して確かめてから、すべて消す", async () => {
        const server = fakeServer({ ...loggedIn, "DELETE /api/data": { status: 200, body: sampleProject } });
        const { user } = renderApp("/preferences");
        await user.click(await screen.findByRole("button", { name: "すべてのデータを消す" }));
        const dialog = screen.getByRole("dialog", { name: "すべてのデータを消しますか" });
        expect(dialog).toHaveTextContent("取り込んだ動画2件、完成版1件");
        expect(dialog).toHaveTextContent("元に戻せません");
        await user.click(within(dialog).getByRole("button", { name: "消す" }));
        expect(await screen.findByText("すべてのデータを消しました")).toBeInTheDocument();
        expect(server.calls.some((c) => c.method === "DELETE" && c.path === "/api/data")).toBe(true);
    });

    it("キャンセルしたら消さない", async () => {
        const server = fakeServer(loggedIn);
        const { user } = renderApp("/preferences");
        await user.click(await screen.findByRole("button", { name: "すべてのデータを消す" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
        expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    });

    it("作成中で消せなければ、理由を知らせる", async () => {
        fakeServer({ ...loggedIn, "DELETE /api/data": { status: 409, body: { detail: "作成が終わってから、もう一度お試しください" } } });
        const { user } = renderApp("/preferences");
        await user.click(await screen.findByRole("button", { name: "すべてのデータを消す" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "消す" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("作成が終わってから");
    });

    it("消すデータがなければ押せず、その理由を示す", async () => {
        const none = { count: 0, bytes: 0 };
        fakeServer({ ...loggedIn, "GET /api/storage": { status: 200, body: { ...sampleStorage, usage: { input: none, output: none, work: none } } } });
        renderApp("/preferences");
        expect(await screen.findByText("消すデータはありません。")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "すべてのデータを消す" })).toBeDisabled();
    });
});
