import type { FormEvent, Ref } from "react";
import type { CurrentUser } from "../../shared/types";

/** コメントの書き込み欄（投稿ページと写真ビューアーで同じもの）：誰としてコメントするか、
    誰の投稿か、入力欄と文字数。送信はスマホではボトムナビの島、PC では欄の中のボタン。 */
export function CommentSheet({
  formId,
  sheetRef,
  textRef,
  open,
  user,
  authorName,
  error,
  text,
  sending,
  onText,
  onSubmit,
  className,
}: {
  formId: string;
  sheetRef?: Ref<HTMLFormElement>;
  textRef?: Ref<HTMLTextAreaElement>;
  open: boolean;
  user: Pick<CurrentUser, "displayName" | "avatarUrl">;
  authorName?: string;
  error: string;
  text: string;
  sending: boolean;
  onText: (text: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}) {
  return (
    <form
      id={formId}
      ref={sheetRef}
      className={`comment-sheet${className ? ` ${className}` : ""}`}
      inert={!open || undefined}
      aria-hidden={!open || undefined}
      aria-label="コメントする"
      onSubmit={onSubmit}
    >
      <div className="comment-sheet-head">
        <span className="comment-sheet-who">
          <span className="comment-sheet-avatar" aria-hidden>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
          </span>
          {user.displayName}としてコメント
        </span>
        {authorName && <span>{authorName}さんの投稿</span>}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <label className="comment-sheet-field">
        <textarea
          ref={textRef}
          name="body"
          aria-label="この投稿へのコメント"
          placeholder="この投稿にコメント"
          maxLength={1000}
          value={text}
          disabled={sending}
          onChange={(event) => onText(event.target.value)}
        />
        <span className="comment-sheet-count" aria-hidden>
          {text.length} / 1000
        </span>
      </label>
      <button className="comment-sheet-send" type="submit" disabled={sending || !text.trim()}>
        {sending ? "送信中…" : "送信"}
      </button>
    </form>
  );
}
