import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { translate } from "@/i18n";
import {
  formatTableRange,
  getAdminSegmentLabel,
  safeAuthError,
  SYSTEM_SHELL_KEYS,
  type SystemShellTranslator,
} from "@/i18n/system-shell";

describe("Batch 1 system shell presentation", () => {
  const t: SystemShellTranslator = (key) => translate("en", key);

  it("uses explicit localized admin route labels and stable IDs", () => {
    expect(getAdminSegmentLabel(t, "products")).toBe("Products");
    expect(getAdminSegmentLabel(t, "42")).toBe("#42");
    expect(getAdminSegmentLabel(t, "not-configured")).toBe("Details");
  });

  it("covers every active first-level admin route explicitly", () => {
    const activeRoutes = readdirSync(resolve("src/app/admin"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name);

    expect(Object.keys(SYSTEM_SHELL_KEYS)).toEqual(
      expect.arrayContaining(activeRoutes),
    );
  });

  it("formats table ranges through the typed catalog", () => {
    expect(formatTableRange("en", { start: 1, end: 20, total: 37 })).toBe(
      "Showing 1–20 of 37",
    );
  });

  it("uses safe localized authentication failures", () => {
    expect(safeAuthError(t)).toBe("Something went wrong. Please try again.");
    expect(safeAuthError((key) => translate("pt", key))).not.toContain("secret");
  });

  it("keeps component-owned admin defaults in the typed shell", () => {
    const files = [
      "src/app/admin/layout.tsx",
      "src/app/admin/_components/Breadcrumb.tsx",
      "src/app/admin/_components/DataTable.tsx",
      "src/app/admin/_components/FilterBar.tsx",
      "src/app/admin/_components/ConfirmDialog.tsx",
      "src/components/ui/pagination.tsx",
      "src/components/ui/spinner.tsx",
    ].map((file) => readFileSync(resolve(file), "utf8"));

    for (const source of files) {
      expect(source).not.toMatch(
        /Loading\.\.\.|GlobalTrade Admin|aria-label="Breadcrumb"|No items to display|Search\.\.\.|>Cancel<|>Confirm<|Go to previous page|Go to next page|More pages|aria-label="Loading"/,
      );
    }
  });

  it("keeps active authentication presentation and API free text out of JSX", () => {
    const sources = [
      "src/app/auth/login/page.tsx",
      "src/app/auth/register/page.tsx",
      "src/app/auth/forgot-password/page.tsx",
      "src/app/auth/reset-password/page.tsx",
      "src/components/auth/oauth-buttons.tsx",
      "src/components/auth/contact-info-dialog.tsx",
    ].map((file) => readFileSync(resolve(file), "utf8"));

    for (const source of sources) {
      expect(source).toContain("useI18n");
      expect(source).not.toMatch(
        /setError\(json\.error|setError\(sign(?:In|Up)Error\)|setError\(t\(|setError\(safeAuthError|Welcome Back|Create Account|Complete Your Contact Info|Google login failed, please try again|请求失败|网络错误|密码重置成功|placeholder="you@example\.com"|placeholder="\+86/,
      );
    }
  });
});
