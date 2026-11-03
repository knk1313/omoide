import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";

// 指定した URL でアプリ全体を描画する。操作には返り値の user を使う。
export function renderApp(path: string) {
    window.history.pushState({}, "", path);
    const user = userEvent.setup();
    const result = render(<App />);
    return { user, ...result };
}

/** 手順のナビゲーションで、今いる手順（aria-current="step"）の項目。 */
export function currentStep(): HTMLElement {
    const current = screen.getByRole("navigation", { name: "手順" }).querySelector<HTMLElement>('[aria-current="step"]');
    if (!current) throw new Error("今いる手順が示されていません");
    return current;
}
