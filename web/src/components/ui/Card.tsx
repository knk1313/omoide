import { createContext, useContext, useEffect, useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Link } from "./Link";

// DADS カード（https://design.digital.go.jp/dads/components/card/）を管理画面向けに絞ったもの。
//   - コンテナは必ず外周（枠線）と背景色を持つ。地（canvas）に対して 3:1 を満たす solid-gray-536 の 1px 枠線。
//   - 管理画面では高さの差を小さくするため影は使わない（docs/decisions.md D-07）。
//   - カード全体をリンクにするときは、タイトルだけをリンクにして擬似要素でクリック領域を広げる（interactive）。
//     その場合カードの中に他のリンクやボタンを置いてはならない（DADS のクリッカブルエリアの規定）。
//   - タイトルがリンクのときは下線を付ける。
//
//   <Card as="section">
//     <CardHeader title="最近の更新" description="直近 7 日間" actions={<Button size="sm" variant="outline">すべて見る</Button>} />
//     <CardBody>…</CardBody>
//     <CardFooter>…</CardFooter>
//   </Card>

export type CardPadding = "md" | "sm" | "none";

type CardContextValue = {
    padding: CardPadding;
    interactive: boolean;
    /** CardHeader の見出しに付ける id。as="section" のとき aria-labelledby に使う。 */
    headingId: string;
    setHasHeading: (has: boolean) => void;
};

const CardContext = createContext<CardContextValue | null>(null);

function useCard(): CardContextValue {
    const ctx = useContext(CardContext);
    if (!ctx) throw new Error("CardHeader / CardBody / CardFooterはCardの中で使ってください");
    return ctx;
}

// 余白の組み合わせ。ヘッダー → 本文 → フッターの間隔が二重にならないよう、先頭・末尾だけ外周と同じ余白にする。
const PADDING: Record<CardPadding, { header: string; body: string; footer: string }> = {
    md: { header: "px-6 pt-6 pb-0 last:pb-6", body: "px-6 py-4 first:pt-6 last:pb-6", footer: "px-6 py-4" },
    sm: { header: "px-4 pt-4 pb-0 last:pb-4", body: "px-4 py-3 first:pt-4 last:pb-4", footer: "px-4 py-3" },
    none: { header: "", body: "", footer: "" },
};

export type CardProps = HTMLAttributes<HTMLElement> & {
    children: ReactNode;
    /** section にすると CardHeader の見出しが aria-labelledby で関連付く。 */
    as?: "div" | "section" | "article" | "li";
    padding?: CardPadding;
    /** カード全体をリンクにする（CardHeader の href が必須）。hover で面の色が変わる。 */
    interactive?: boolean;
};

export function Card({ children, as: Component = "div", padding = "md", interactive = false, className, ...props }: CardProps) {
    const headingId = useId();
    const [hasHeading, setHasHeading] = useState(false);
    const labelled = Component !== "div" && hasHeading && !props["aria-labelledby"] && !props["aria-label"];
    return (
        <CardContext.Provider value={{ padding, interactive, headingId, setHasHeading }}>
            <Component
                className={cn(
                    "flex min-w-0 flex-col rounded-8 border border-border-on-canvas bg-surface text-text break-words",
                    interactive && "relative transition-colors hover:bg-surface-hover",
                    className,
                )}
                aria-labelledby={labelled ? headingId : props["aria-labelledby"]}
                {...props}
            >
                {children}
            </Component>
        </CardContext.Provider>
    );
}

export type CardHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
    title: ReactNode;
    /** 見出しレベル。ページの構造に合わせる（既定 h2）。 */
    as?: "h2" | "h3" | "h4";
    /** タイトルの下の補足。 */
    description?: ReactNode;
    /** 右側に置く操作（ボタン・メニューなど）。interactive なカードでは置けない。 */
    actions?: ReactNode;
    /** タイトルをリンクにする（react-router のパス）。 */
    href?: string;
    /** タイトルの上に置くラベル（分類・ステータスなど）。 */
    label?: ReactNode;
};

const HEADING_SIZE: Record<NonNullable<CardHeaderProps["as"]>, string> = {
    h2: "text-std-20B-150",
    h3: "text-std-18B-160",
    h4: "text-std-16B-170",
};

export function CardHeader({ title, as: Heading = "h2", description, actions, href, label, className, ...props }: CardHeaderProps) {
    const { padding, interactive, headingId, setHasHeading } = useCard();
    useEffect(() => {
        setHasHeading(true);
        return () => setHasHeading(false);
    }, [setHasHeading]);

    const titleNode = href ? (
        <Link
            to={href}
            className={cn(
                "text-text-strong visited:text-text-strong",
                // カード全体をクリック領域にする。カードが relative なので擬似要素がカード全体に広がる。
                interactive && "after:absolute after:inset-0",
            )}
        >
            {title}
        </Link>
    ) : (
        title
    );

    return (
        <div className={cn("flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between", PADDING[padding].header, className)} {...props}>
            <div className="flex min-w-0 flex-col gap-1">
                {label && <div className="text-16 text-text-muted">{label}</div>}
                <Heading id={headingId} className={cn("m-0 text-text-strong", HEADING_SIZE[Heading])}>
                    {titleNode}
                </Heading>
                {description && <p className="m-0 text-16 text-text-muted">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export type CardBodyProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function CardBody({ children, className, ...props }: CardBodyProps) {
    const { padding } = useCard();
    return (
        <div className={cn("min-w-0 flex-1", PADDING[padding].body, className)} {...props}>
            {children}
        </div>
    );
}

export type CardFooterProps = HTMLAttributes<HTMLDivElement> & {
    children: ReactNode;
    /** 本文との間に罫線を引く（既定 true）。 */
    divider?: boolean;
};

export function CardFooter({ children, divider = true, className, ...props }: CardFooterProps) {
    const { padding } = useCard();
    return (
        <div className={cn("min-w-0", divider && "border-t border-border", PADDING[padding].footer, className)} {...props}>
            {children}
        </div>
    );
}
