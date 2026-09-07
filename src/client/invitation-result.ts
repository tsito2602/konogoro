export function invitationReviewMessage(count: number, selected: number, decision: "approved" | "rejected") {
  if (count === 0) return "新しく処理されたリクエストはありません。確認待ちの一覧をご確認ください。";
  const result = decision === "approved" ? `${count}件を承認しました` : `${count}件を承認せずに終了しました`;
  return count < selected ? `${result}。未処理のリクエストは一覧に残ります。` : `${result}。`;
}
