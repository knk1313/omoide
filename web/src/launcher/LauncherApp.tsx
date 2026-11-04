import { BrowserRouter } from "react-router";
import { appConfig } from "@/app.config";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { ToastProvider } from "@/components/ui/Toast";
import { Brand, ShellHeader, SkipLink } from "@/layouts/ShellHeader";
import LauncherPage from "./LauncherPage";

// Mac のブラウザーで開く「始める」画面の外枠。スマホの手順の画面とは別で、ログインや手順の表示はない。
export default function LauncherApp() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <ConfirmProvider>
                    <SkipLink />
                    <div className="flex min-h-dvh flex-col">
                        <ShellHeader className="box-content pt-safe">
                            <div className="mx-auto flex w-full max-w-2xl items-center px-2">
                                <Brand name={appConfig.name} logo={appConfig.logo} href="/launcher" />
                            </div>
                        </ShellHeader>
                        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
                            <LauncherPage />
                        </main>
                    </div>
                </ConfirmProvider>
            </ToastProvider>
        </BrowserRouter>
    );
}
