import type { ReactNode } from "react";
import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

// アプリケーションシェルのヘッダーの部品。テンプレートの src/layouts/ShellHeader.tsx から、omoide が使わない
// HamburgerButton（メニューを持たないため）を除いてコピーした（web/README.mdの「テンプレートとの違い」）。
//   - SkipLink: 「本文へスキップ」。最初の Tab で現れ、<main id="main"> に移動する。
//   - Brand: アプリのロゴとアプリ名（ホームへのリンク）。
//   - ShellHeader: 高さ 64px、白い面 + 下の罫線。

export type SkipLinkProps = { targetId?: string };

export function SkipLink({ targetId = "main" }: SkipLinkProps) {
    return (
        <a
            href={`#${targetId}`}
            className="sr-only z-50 rounded-8 bg-surface px-4 py-3 text-16 font-bold text-link focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus-visible:focus-ring"
        >
            本文へスキップ
        </a>
    );
}

export type BrandProps = {
    name: string;
    logo?: LucideIcon;
    href?: string;
    className?: string;
};

export function Brand({ name, logo, href = "/", className }: BrandProps) {
    return (
        <Link
            to={href}
            className={cn(
                "flex min-h-11 min-w-0 items-center gap-2 rounded-4 px-1 text-18 leading-130 font-bold tracking-0 text-text-strong no-underline hover:underline focus-visible:focus-ring-fill",
                className,
            )}
        >
            {logo && <Icon icon={logo} size="lg" className="text-primary" />}
            {/* 狭い画面では折り返す（1 行で切ると「申請管…」のように名前が読めなくなるため）。
                sm未満は16pxにして、文字間隔を広げたとき（WCAG 1.4.12）も3行まで高さ64pxのヘッダーに収める */}
            <span className="line-clamp-3 break-words max-sm:text-16">{name}</span>
        </Link>
    );
}

export type ShellHeaderProps = {
    children: ReactNode;
    className?: string;
};

export function ShellHeader({ children, className }: ShellHeaderProps) {
    return (
        <header className={cn("relative z-20 flex h-header shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:gap-4 md:px-4", className)}>
            {children}
        </header>
    );
}
