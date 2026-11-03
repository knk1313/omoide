import { Outlet, useLocation } from "react-router";
import { appConfig, steps } from "@/app.config";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { StepNavigation } from "@/components/ui/StepNavigation";
import { ToastProvider } from "@/components/ui/Toast";
import { useSession } from "@/session/Session";
import { Brand, ShellHeader, SkipLink } from "./ShellHeader";

// スマホで一つの作業を順に進めるための外枠。上にアプリ名、その下に今いる手順、続けて各画面の中身を置く。
// テンプレートの ShellHeader と StepNavigation で組み、サイドバーは使わない（docs/migration-decisions.md M-02）。
// 幅の広い画面でも、スマホの幅（max-w-app）で中央に寄せる。
export default function AppLayout() {
    const { pathname } = useLocation();
    const { status } = useSession();
    // 手順はログインした後にだけ見せる。QR コードの案内やパスワード画面では出さない
    const current = status === "ready" ? steps.findIndex((step) => step.path === pathname) : -1;
    return (
        <ToastProvider>
            <ConfirmProvider>
                <SkipLink />
                <div className="flex min-h-dvh flex-col">
                    {/* iPhone のノッチに中身が隠れないよう、ヘッダーの上に安全領域の分だけ余白を取る */}
                    <ShellHeader className="box-content pt-safe">
                        <div className="mx-auto flex w-full max-w-app items-center px-2">
                            <Brand name={appConfig.name} logo={appConfig.logo} />
                        </div>
                    </ShellHeader>
                    {/* 下の余白は各画面の BottomBar が安全領域ぶん取る。ここでも取ると、画面によって主な操作の高さがずれる */}
                    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-4 pt-4">
                        {current >= 0 && <StepNavigation steps={steps} current={current} size="sm" label="手順" />}
                        <Outlet />
                    </main>
                </div>
            </ConfirmProvider>
        </ToastProvider>
    );
}
