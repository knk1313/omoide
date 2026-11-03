import { expectNoA11yViolations } from "@/test/axe";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeServer, loggedIn, notLoggedIn } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";

const PASSWORD_FIELD = { name: "パスワード" } as const;

describe("パスワード画面", () => {
    it("ログインしていなければ、どの手順の画面からもパスワード画面へ移る", async () => {
        fakeServer(notLoggedIn);
        renderApp("/settings");
        expect(await screen.findByRole("heading", { name: "パスワードを入力" })).toBeInTheDocument();
        expect(screen.getByText(/Mac と同じ Wi-Fi に接続して/)).toBeInTheDocument();
        expect(window.location.pathname).toBe("/login");
    });

    it("正しいパスワードなら、開こうとしていた画面へ進む", async () => {
        const server = fakeServer({ ...loggedIn, ...notLoggedIn, "POST /api/session/login": { status: 200, body: { status: "ok" } } });
        const { user } = renderApp("/settings");
        await user.type(await screen.findByLabelText(PASSWORD_FIELD.name), "correct horse");
        await user.click(screen.getByRole("button", { name: "接続する" }));

        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
        expect(server.calls).toContainEqual({ method: "POST", path: "/api/session/login", body: { password: "correct horse" } });
    });

    it("Enter でも送信できる", async () => {
        fakeServer({ ...loggedIn, ...notLoggedIn, "POST /api/session/login": { status: 200 } });
        const { user } = renderApp("/login");
        await user.type(await screen.findByLabelText(PASSWORD_FIELD.name), "correct horse{Enter}");
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });

    it("違うパスワードなら、サーバーの文言を表示して入力欄を空にする", async () => {
        fakeServer({ ...notLoggedIn, "POST /api/session/login": { status: 401, body: { detail: "パスワードが違います" } } });
        const { user } = renderApp("/login");
        const field = await screen.findByLabelText(PASSWORD_FIELD.name);
        await user.type(field, "wrong");
        await user.click(screen.getByRole("button", { name: "接続する" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("パスワードが違います");
        expect(field).toHaveValue("");
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("heading", { name: "パスワードを入力" })).toBeInTheDocument();
    });

    it("試行が続いて待たされているときは、その案内を表示する", async () => {
        fakeServer({
            ...notLoggedIn,
            "POST /api/session/login": { status: 429, body: { detail: "ログインの試行が続いたため、しばらく待ってください" } },
        });
        const { user } = renderApp("/login");
        await user.type(await screen.findByLabelText(PASSWORD_FIELD.name), "x");
        await user.click(screen.getByRole("button", { name: "接続する" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("しばらく待ってください");
    });

    it("空のままでは送信できない", async () => {
        const server = fakeServer(notLoggedIn);
        const { user } = renderApp("/login");
        const button = await screen.findByRole("button", { name: "接続する" });
        expect(button).toBeDisabled();
        await user.click(button);
        expect(server.calls.filter((c) => c.path === "/api/session/login")).toEqual([]);
    });

    it("パスワードを表示して確かめられる", async () => {
        fakeServer(notLoggedIn);
        const { user } = renderApp("/login");
        const field = await screen.findByLabelText(PASSWORD_FIELD.name);
        expect(field).toHaveAttribute("type", "password");
        await user.click(screen.getByRole("button", { name: "パスワードを表示" }));
        expect(field).toHaveAttribute("type", "text");
        await user.click(screen.getByRole("button", { name: "パスワードを隠す" }));
        expect(field).toHaveAttribute("type", "password");
    });

    it("アクセシビリティ違反がない（エラーを出した状態も）", async () => {
        fakeServer({ ...notLoggedIn, "POST /api/session/login": { status: 401, body: { detail: "パスワードが違います" } } });
        const { user, container } = renderApp("/login");
        await expectNoA11yViolations(await screen.findByRole("main"));
        await user.type(await screen.findByLabelText("パスワード"), "x{Enter}");
        await screen.findByRole("alert");
        await expectNoA11yViolations(container);
    });

    it("ログイン済みならパスワード画面を飛ばす", async () => {
        fakeServer(loggedIn);
        renderApp("/login");
        expect(await screen.findByRole("heading", { name: "使うクリップを選ぶ" })).toBeInTheDocument();
    });
});

describe("ログインより前に進めないとき", () => {
    it("共有 URL を開いていなければ、QR コードを読み取るよう案内する", async () => {
        fakeServer({ "GET /api/health": { status: 404 } });
        renderApp("/");
        expect(await screen.findByRole("heading", { name: "QR コードを読み取ってください" })).toBeInTheDocument();
        // ログインする前は、手順を見せない
        expect(screen.queryByRole("navigation", { name: "手順" })).not.toBeInTheDocument();
    });

    it("期限が切れていれば、Mac で起動し直すよう案内する", async () => {
        fakeServer({ "GET /api/health": { status: 410, body: { detail: "共有の期限が切れました" } } });
        renderApp("/login");
        expect(await screen.findByRole("heading", { name: "共有の期限が切れました" })).toBeInTheDocument();
        expect(screen.getByText(/もう一度 serve を起動/)).toBeInTheDocument();
    });

    it("ログインの途中で期限が切れたら、その案内に切り替える", async () => {
        fakeServer({ ...notLoggedIn, "POST /api/session/login": { status: 410, body: { detail: "共有の期限が切れました" } } });
        const { user } = renderApp("/login");
        await user.type(await screen.findByLabelText(PASSWORD_FIELD.name), "correct horse");
        await user.click(screen.getByRole("button", { name: "接続する" }));
        expect(await screen.findByRole("heading", { name: "共有の期限が切れました" })).toBeInTheDocument();
    });

    it("Mac につながらなければ、Wi-Fi を確かめて再試行できる", async () => {
        fakeServer({ "GET /api/health": new TypeError("Failed to fetch") });
        renderApp("/");
        expect(await screen.findByRole("heading", { name: "Mac につながりません" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "もう一度試す" })).toBeInTheDocument();
    });
});
