// すべての画面に対して行う E2E の検査（layout.spec.ts・a11y.spec.ts）の対象。画面を足したら、ここにも足す。
// テンプレート（workspace-ui-template-dads）の e2e/routes.ts を omoide の画面に置き換えた。

export type PageRoute = { name: string; path: string; h1: string; loggedIn?: boolean };

export const PAGES: PageRoute[] = [
    { name: "videos", path: "/videos", h1: "動画を取り込む" },
    { name: "clips", path: "/", h1: "使うクリップを選ぶ" },
    { name: "settings", path: "/settings", h1: "速度を選ぶ" },
    { name: "preview", path: "/preview", h1: "プレビューを確認" },
    { name: "login", path: "/login", h1: "パスワードを入力", loggedIn: false },
    { name: "not-found", path: "/no-such-page", h1: "ページが見つかりません" },
];
