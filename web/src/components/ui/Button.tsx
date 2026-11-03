import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Link, type LinkProps } from "react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

// DADS ボタン（https://design.digital.go.jp/dads/components/button/）。
//   variant: solid-fill（プライマリー / 重要度 高）、outline（セカンダリー / 中）、text（ターシャリー / 低）
//   size: lg 136×56、md 96×48、sm 80×36、xs 72×28（sm / xs は上下にタップ領域を足して 44px を確保）
//   tone: primary（キーカラー）、error（削除など取り消せない操作）
// 1 画面にプライマリーは原則 1 つ。確定は右端、キャンセルは左端に置く（ButtonGroup 参照）。
// disabled は原則使わない（Tab で到達できない）。使う場合は近くに理由を表示する。

export type ButtonVariant = "solid-fill" | "outline" | "text";
export type ButtonSize = "lg" | "md" | "sm" | "xs";
export type ButtonTone = "primary" | "error";

export type ButtonStyleProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    tone?: ButtonTone;
    /** 親の幅いっぱいに広げる（モバイルの縦積みなど）。 */
    block?: boolean;
};

const BASE =
    "inline-flex max-w-full items-center justify-center gap-1 whitespace-normal break-words text-center font-bold leading-none tracking-2 no-underline underline-offset-3 transition-colors";

const SIZE: Record<ButtonSize, string> = {
    lg: "min-h-14 min-w-34 rounded-8 px-4 py-3 text-16",
    md: "min-h-12 min-w-24 rounded-8 px-4 py-2 text-16",
    sm: "tap-area min-h-9 min-w-20 rounded-6 px-3 py-0.5 text-16",
    xs: "tap-area min-h-7 min-w-18 rounded-4 px-2 py-0.5 text-14",
};

const VARIANT: Record<ButtonTone, Record<ButtonVariant, string>> = {
    primary: {
        "solid-fill":
            "border-4 border-double border-transparent bg-primary text-text-on-primary hover:bg-primary-hover hover:underline hover:decoration-1 active:bg-primary-active active:underline focus-visible:focus-ring disabled:bg-disabled disabled:text-on-disabled disabled:no-underline",
        outline:
            "border border-current bg-surface text-primary hover:bg-primary-outline-hover hover:text-primary-hover hover:underline hover:decoration-1 active:bg-primary-outline-active active:text-primary-active active:underline focus-visible:focus-ring disabled:bg-surface disabled:text-disabled disabled:no-underline",
        text: "border-0 bg-transparent text-primary underline decoration-1 hover:bg-primary-surface hover:text-primary-hover hover:underline-thick active:bg-primary-surface-hover active:text-primary-active focus-visible:focus-ring-fill disabled:bg-transparent disabled:text-disabled",
    },
    error: {
        "solid-fill":
            "border-4 border-double border-transparent bg-error text-text-on-primary hover:bg-error-hover hover:underline hover:decoration-1 active:bg-error-active active:underline focus-visible:focus-ring disabled:bg-disabled disabled:text-on-disabled disabled:no-underline",
        outline:
            "border border-current bg-surface text-error hover:bg-error-outline-hover hover:text-error-hover hover:underline hover:decoration-1 active:text-error-active active:underline focus-visible:focus-ring disabled:bg-surface disabled:text-disabled disabled:no-underline",
        text: "border-0 bg-transparent text-error underline decoration-1 hover:bg-error-surface hover:text-error-hover hover:underline-thick active:text-error-active focus-visible:focus-ring-fill disabled:bg-transparent disabled:text-disabled",
    },
};

/** ボタンの見た目のクラス名。リンクをボタン風に見せるときなどに使う。 */
export function buttonClassName({ variant = "solid-fill", size = "md", tone = "primary", block = false }: ButtonStyleProps, className?: string): string {
    return cn(BASE, SIZE[size], VARIANT[tone][variant], block ? "flex w-full" : "w-fit", className);
}

type ButtonContentProps = {
    children: ReactNode;
    leadIcon?: LucideIcon;
    tailIcon?: LucideIcon;
    loading?: boolean;
    size: ButtonSize;
};

function ButtonContent({ children, leadIcon, tailIcon, loading, size }: ButtonContentProps) {
    const iconSize = size === "xs" ? "sm" : "md";
    return (
        <>
            {loading ? <Spinner size={iconSize} inheritColor label="処理中" /> : leadIcon && <Icon icon={leadIcon} size={iconSize} />}
            <span>{children}</span>
            {tailIcon && !loading && <Icon icon={tailIcon} size={iconSize} />}
        </>
    );
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
    ButtonStyleProps & {
        children: ReactNode;
        /** ラベルの前に置くアイコン（リードアイコン）。装飾なので代替テキストは付かない。 */
        leadIcon?: LucideIcon;
        /** ラベルの後ろに置くアイコン（テールアイコン）。 */
        tailIcon?: LucideIcon;
        /** 処理中。スピナーを表示し aria-busy を付け、押下を無効にする（Tab では到達できる）。 */
        loading?: boolean;
        ref?: Ref<HTMLButtonElement>;
    };

export function Button({
    variant = "solid-fill",
    size = "md",
    tone = "primary",
    block = false,
    leadIcon,
    tailIcon,
    loading = false,
    className,
    type = "button",
    disabled,
    onClick,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={buttonClassName({ variant, size, tone, block }, className)}
            disabled={disabled}
            aria-busy={loading || undefined}
            aria-disabled={loading && !disabled ? true : undefined}
            onClick={(e) => {
                if (loading) {
                    e.preventDefault();
                    return;
                }
                onClick?.(e);
            }}
            {...props}
        >
            <ButtonContent leadIcon={leadIcon} tailIcon={tailIcon} loading={loading} size={size}>
                {children}
            </ButtonContent>
        </button>
    );
}

export type ButtonLinkProps = Omit<LinkProps, "children" | "className"> &
    ButtonStyleProps & {
        children: ReactNode;
        leadIcon?: LucideIcon;
        tailIcon?: LucideIcon;
        className?: string;
        ref?: Ref<HTMLAnchorElement>;
    };

/** ページ遷移をボタンの見た目で提供するリンク（react-router の Link）。 */
export function ButtonLink({ variant = "solid-fill", size = "md", tone = "primary", block = false, leadIcon, tailIcon, className, children, ...props }: ButtonLinkProps) {
    return (
        <Link className={buttonClassName({ variant, size, tone, block }, className)} {...props}>
            <ButtonContent leadIcon={leadIcon} tailIcon={tailIcon} size={size}>
                {children}
            </ButtonContent>
        </Link>
    );
}

export type ButtonAnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> &
    ButtonStyleProps & {
        children: ReactNode;
        leadIcon?: LucideIcon;
        tailIcon?: LucideIcon;
        className?: string;
        ref?: Ref<HTMLAnchorElement>;
    };

/** 外部 URL やダウンロードなど、通常の <a> をボタンの見た目で提供する。 */
export function ButtonAnchor({ variant = "solid-fill", size = "md", tone = "primary", block = false, leadIcon, tailIcon, className, children, ...props }: ButtonAnchorProps) {
    return (
        <a className={buttonClassName({ variant, size, tone, block }, className)} {...props}>
            <ButtonContent leadIcon={leadIcon} tailIcon={tailIcon} size={size}>
                {children}
            </ButtonContent>
        </a>
    );
}
