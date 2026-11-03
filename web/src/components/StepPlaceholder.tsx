import type { ReactNode } from "react";
import Card from "./Card";

// まだ作っていない画面の仮置き。各画面の issue で中身に置き換える。
export default function StepPlaceholder({ title, issue, children }: { title: string; issue: number; children?: ReactNode }) {
    return (
        <div className="flex flex-1 flex-col gap-4 pt-2">
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
            <Card className="p-4 text-sm text-muted">この画面は #{issue} で作ります。</Card>
            {children && <div className="mt-auto flex flex-col gap-2">{children}</div>}
        </div>
    );
}
