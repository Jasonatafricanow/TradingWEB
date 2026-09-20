import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveIsDemoMode } from "@/config/constants";

function setEnv(nodeEnv: "production" | "development", dbHost: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("DB_HOST", dbHost);
  if (nodeEnv === "production") vi.stubEnv("JWT_SECRET", "test-strong-secret-0123456789abcdef");
}

function loginRequest(email: string, password: string) {
  return new Request("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function loadPost() {
  vi.resetModules();
  const { POST } = await import("../login/route");
  return POST;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveIsDemoMode 环境组合真值表", () => {
  it("production + 无 DB_HOST → false（fail-closed）", () => {
    expect(resolveIsDemoMode({ NODE_ENV: "production", DB_HOST: "" })).toBe(false);
  });
  it("production + 有 DB_HOST → false", () => {
    expect(resolveIsDemoMode({ NODE_ENV: "production", DB_HOST: "db.example" })).toBe(false);
  });
  it("development + 有 DB_HOST → false", () => {
    expect(resolveIsDemoMode({ NODE_ENV: "development", DB_HOST: "db.example" })).toBe(false);
  });
  it("development + 无 DB_HOST → true（demo 保留）", () => {
    expect(resolveIsDemoMode({ NODE_ENV: "development", DB_HOST: "" })).toBe(true);
  });
});

describe("POST /api/auth/login demo fail-closed", () => {
  it("production 缺 DB_HOST → 503 配置错误，且不签发 demo token", async () => {
    setEnv("production", "");
    const POST = await loadPost();
    const res = await POST(loginRequest("admin@globaltrade.enterprise", "admin123") as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Server is not configured (missing DB_HOST in production)" });
  });

  it("development 缺 DB_HOST → demo 登录照常签发 token（回归护栏）", async () => {
    setEnv("development", "");
    const POST = await loadPost();
    const res = await POST(loginRequest("demo@example.com", "demo123") as never);
    expect(res.status).toBe(200);
    expect((await res.json()).data.token).toBeTruthy();
  });
});
