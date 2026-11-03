// 完成版を保存するときのファイル名の検査。Mac・iPhone・Windows のどこに保存しても扱える名前だけを受け付ける。
// サーバー（download_name）も同じ文字を取り除くが、画面では送る前に断って理由を示す。

export const MAX_FILE_NAME_LENGTH = 80;

/** ファイル名に使えない文字（パスの区切りと、Windows で使えない記号）。 */
const FORBIDDEN = '/\\:*?"<>|';

/** 拡張子（.mp4）を付けて入力されたときは外す。 */
export function stripExtension(name: string): string {
    return name.trim().replace(/\.mp4$/i, "").trimEnd();
}

/** 使えなければ、その理由と次に取る操作。使えれば null。 */
export function fileNameProblem(raw: string): string | null {
    const name = stripExtension(raw);
    if (!name) return "ファイル名を入力してください";
    const bad = [...new Set([...name].filter((c) => FORBIDDEN.includes(c)))];
    if (bad.length > 0) return `「${bad.join(" ")}」はファイル名に使えません。ほかの文字に置き換えてください`;
    // 改行やタブなどの制御文字
    if ([...name].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return "改行やタブはファイル名に使えません";
    if (name.startsWith(".")) return "「.」で始まるファイル名は使えません。先頭の「.」を消してください";
    if (name.length > MAX_FILE_NAME_LENGTH) return `ファイル名は ${MAX_FILE_NAME_LENGTH} 文字以内で入力してください`;
    return null;
}

/** 入力欄に出す例（例: 20261104の動画）。当日の日付を使う。 */
export function fileNamePlaceholder(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `例：${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}の動画`;
}
