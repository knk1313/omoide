import { Outlet, useLocation } from "react-router";
import { appConfig, steps } from "@/app.config";
import { ToastProvider } from "./Toast";
import { ConfirmProvider } from "./ConfirmDialog";

// スマホで一つの作業を順に進めるための外枠。上にアプリ名と今いる段階、下に各画面の中身を置く。
// 幅の広い画面でも、スマホの幅（max-w-md）で中央に寄せる。
export default function AppLayout() {
    const { pathname } = useLocation();
    const current = steps.findIndex((step) => step.path === pathname);
    const Logo = appConfig.logo;

    return (
        <ToastProvider>
            <ConfirmProvider>
                <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
                    {/* iPhone のノッチやホームバーに中身が隠れないよう、端末の安全領域だけ余白を取る */}
                    <header className="sticky top-0 z-10 bg-canvas/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
                        <div className="flex items-center gap-2 text-ink">
                            <Logo className="h-5 w-5 text-brand" aria-hidden />
                            <span className="text-base font-semibold">{appConfig.name}</span>
                        </div>
                        {current >= 0 && (
                            <ol className="mt-3 flex gap-2" aria-label="手順">
                                {steps.map((step, i) => (
                                    <li
                                        key={step.path}
                                        aria-current={i === current ? "step" : undefined}
                                        className={`flex-1 rounded-full py-1 text-center text-xs font-medium ${
                                            i === current
                                                ? "bg-brand text-on-brand"
                                                : i < current
                                                  ? "bg-nav-active text-nav-ink"
                                                  : "bg-surface-2 text-muted"
                                        }`}
                                    >
                                        {i + 1}. {step.label}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </header>
                    <main className="flex flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
                        <Outlet />
                    </main>
                </div>
            </ConfirmProvider>
        </ToastProvider>
    );
}
