import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// 空状態（一覧に項目がない、検索結果がない、など）。アイコン・見出し・補足・次の行動を中央に置く。
// 一覧の表示領域（カードや表の中）に入れて使う。見出しレベルはページの構造に合わせて as で指定する。

export type EmptyStateProps = {
    icon?: LucideIcon;
    title: ReactNode;
    as?: "h2" | "h3";
    description?: ReactNode;
    /** 次の行動（Button / ButtonLink など）。 */
    action?: ReactNode;
    className?: string;
};

export function EmptyState({ icon: LeadIcon, title, as: Heading = "h2", description, action, className }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-16 leading-170 tracking-2 text-text", className)}>
            {LeadIcon && <LeadIcon aria-hidden="true" focusable="false" className="mb-2 size-icon-xl text-text-subtle" />}
            <Heading className="m-0 text-std-20B-150 text-text-strong">{title}</Heading>
            {description && <p className="m-0 max-w-prose text-text-muted">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
