import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "./Button";

type State = { failed: boolean };

// 画面のコードで予期しない例外が起きたら、真っ白にせず、再読み込みできる案内に切り替える
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
            <div role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertTriangle className="h-10 w-10 text-faint" aria-hidden />
                <h1 className="text-lg font-semibold text-ink">問題が起きました</h1>
                <p className="text-sm leading-relaxed text-muted">画面を読み込み直してください。選んだ内容は Mac に保存されています。</p>
                <Button className="mt-2 h-12 px-8" onClick={() => window.location.reload()}>
                    読み込み直す
                </Button>
            </div>
        );
    }
}
