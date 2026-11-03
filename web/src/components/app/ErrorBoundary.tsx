import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorPage } from "@/components/ui/ErrorPage";

type State = { failed: boolean };

// 画面のコードで予期しない例外が起きたら、真っ白にせず、再読み込みできる案内（テンプレートの ErrorPage）に切り替える
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // 開発中に原因を追えるよう、ブラウザのコンソールに残す
        console.error(error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <main className="mx-auto w-full max-w-app">
                <ErrorPage
                    title="問題が起きました"
                    description="画面を読み込み直してください。選んだ内容はMacに保存されています。"
                    actions={<Button onClick={() => window.location.reload()}>読み込み直す</Button>}
                />
            </main>
        );
    }
}
