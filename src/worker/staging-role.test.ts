import { describe, expect, it, vi } from "vitest";
import { app, canSwitchStagingRole } from "./index";

const user = { id: "01JDEVUSER0000000000000000", display_name: "つばさ", role: "owner" };

function stagingEnv(enabled: boolean, onUpdate = vi.fn()): Cloudflare.Env {
  return {
    APP_ORIGIN: "http://localhost:5173",
    STAGING_ROLE_SWITCH_ENABLED: enabled ? "true" : undefined,
    DB: {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => user,
          run: async () => {
            if (query.includes("UPDATE users SET role")) onUpdate(values);
            return { meta: { changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database,
  } as unknown as Cloudflare.Env;
}

describe("staging role switch", () => {
  it("明示的に有効化された環境だけで利用できる", () => {
    expect(canSwitchStagingRole({ STAGING_ROLE_SWITCH_ENABLED: "true" })).toBe(true);
    expect(canSwitchStagingRole({ STAGING_ROLE_SWITCH_ENABLED: "false" })).toBe(false);
    expect(canSwitchStagingRole({})).toBe(false);
  });

  it("stagingで現在のユーザーを選択した権限へ切り替える", async () => {
    const onUpdate = vi.fn();
    const response = await app.request(
      "/api/staging/role",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      },
      stagingEnv(true, onUpdate),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: "viewer" });
    expect(onUpdate).toHaveBeenCalledWith(["viewer", expect.any(String), user.id]);
  });

  it("通常環境ではAPIを公開しない", async () => {
    const onUpdate = vi.fn();
    const response = await app.request(
      "/api/staging/role",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      },
      stagingEnv(false, onUpdate),
    );

    expect(response.status).toBe(404);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
