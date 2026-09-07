import { expect, it } from "vitest";
import { invitationReviewMessage } from "./invitation-result";

it("reports only the server-confirmed count when a batch is partially processed", () => {
  expect(invitationReviewMessage(1, 3, "approved")).toBe("1件を承認しました。未処理のリクエストは一覧に残ります。");
  expect(invitationReviewMessage(3, 3, "rejected")).toBe("3件を承認せずに終了しました。");
  expect(invitationReviewMessage(0, 3, "approved")).not.toContain("承認しました");
});
