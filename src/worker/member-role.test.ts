import { describe, expect, it, vi } from "vitest";
import { app } from "./index";

const owner = { id: "01JDEVUSER0000000000000000", display_name: "Owner", role: "owner" };
const member = {
  id: "member-1",
  display_name: "Member",
  role: "uploader",
  avatar_url: null,
  line_user_id: "line-member-1",
  notification_enabled: 1,
};

function ownerEnv(updatedMember: typeof member | null = member, onUpdate?: (values: unknown[]) => void): Cloudflare.Env {
  return {
    APP_ORIGIN: "http://localhost:5173",
    DB: {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            if (query.includes("UPDATE users")) {
              onUpdate?.(values);
              return updatedMember;
            }
            return owner;
          },
        }),
      }),
    } as unknown as D1Database,
  } as Cloudflare.Env;
}

describe("member role API", () => {
  it("ownerが他のメンバーの権限を変更できる", async () => {
    const onUpdate = vi.fn();
    const response = await app.request("/api/family/members/member-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "uploader" }),
    }, ownerEnv(member, onUpdate));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "member-1", role: "uploader", lineConnected: true, notificationEnabled: true });
    expect(onUpdate).toHaveBeenCalledWith(["uploader", expect.any(String), "member-1"]);
  });

  it("自分自身の権限変更を拒否する", async () => {
    const onUpdate = vi.fn();
    const response = await app.request(`/api/family/members/${owner.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "viewer" }),
    }, ownerEnv(member, onUpdate));

    expect(response.status).toBe(400);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("存在しないメンバーを404にする", async () => {
    const response = await app.request("/api/family/members/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "viewer" }),
    }, ownerEnv(null));

    expect(response.status).toBe(404);
  });
});
