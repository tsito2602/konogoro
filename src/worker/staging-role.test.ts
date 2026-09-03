import { describe, expect, it } from "vitest";
import { app } from "./index";

const developmentUser = {
  id: "01JDEVUSER0000000000000000",
  display_name: "つばさ",
  role: "owner",
  avatar_url: null,
};

function env(staging: boolean): Cloudflare.Env {
  return {
    APP_ORIGIN: "http://localhost:5173",
    STAGING: staging ? "true" : undefined,
    DB: {
      prepare: (query: string) => ({
        bind: () => ({
          first: async () =>
            query.includes("line_user_id")
              ? { avatar_url: null, line_user_id: null, line_friend_enabled: 0, notification_enabled: 0 }
              : developmentUser,
        }),
      }),
    } as unknown as D1Database,
  } as unknown as Cloudflare.Env;
}

describe("staging role switch", () => {
  it("stagingだけでブラウザ用の権限Cookieを設定する", async () => {
    const response = await app.request(
      "/api/staging/role",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "viewer" }) },
      env(true),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("konogoro_staging_role=viewer");
  });

  it("Cookieの権限をAPI認可に使うcurrent userへ反映する", async () => {
    const response = await app.request("/api/me", { headers: { Cookie: "konogoro_staging_role=uploader" } }, env(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ role: "uploader", isStaging: true });
  });

  it("本番では切替APIと権限Cookieを無効にする", async () => {
    const changeResponse = await app.request(
      "/api/staging/role",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "viewer" }) },
      env(false),
    );
    const meResponse = await app.request(
      "/api/me",
      { headers: { Cookie: "konogoro_staging_role=viewer" } },
      env(false),
    );

    expect(changeResponse.status).toBe(404);
    await expect(meResponse.json()).resolves.toMatchObject({ role: "owner", isStaging: false });
  });
});
