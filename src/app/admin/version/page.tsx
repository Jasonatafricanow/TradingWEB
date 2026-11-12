"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, GitBranch, Clock, Cube } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/client-api";
import { useI18n } from "@/contexts/i18n-context";
import { translate } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdminVersionInfo {
  appVersion: string;
  buildId: string | null;
  gitCommit: string | null;
  gitBranch: string | null;
  builtAt: string | null;
  nodeEnv: string;
  startedAt: string;
  uptimeSeconds: number;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function AdminVersionPage() {
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<AdminVersionInfo | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch("/api/admin/version");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { data: AdminVersionInfo };
      setInfo(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(locale === "zh" ? "zh-CN" : locale === "pt" ? "pt-BR" : "en-US");
  };

  const rows: Array<{ label: string; value: string; mono?: boolean }> = info
    ? [
        { label: t("version.app_version"), value: info.appVersion },
        { label: t("version.build_id"), value: info.buildId ?? "—", mono: true },
        { label: t("version.git_commit"), value: info.gitCommit ? info.gitCommit.slice(0, 12) : "—", mono: true },
        { label: t("version.git_branch"), value: info.gitBranch ?? "—" },
        { label: t("version.built_at"), value: formatTime(info.builtAt) },
        { label: t("version.started_at"), value: formatTime(info.startedAt) },
        { label: t("version.uptime"), value: formatUptime(info.uptimeSeconds) },
        { label: t("version.node_env"), value: info.nodeEnv },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("version.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("version.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <ArrowsClockwise className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("version.refresh")}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-700">{t("version.load_failed")}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("version.app_version")}
            </CardTitle>
            <Cube className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {info ? translate(locale, "version.app_version_value", { version: info.appVersion }) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("version.git_branch")}
            </CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{info?.gitBranch ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("version.uptime")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{info ? formatUptime(info.uptimeSeconds) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("version.details")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !info ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <dl className="divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className={`text-sm font-medium text-gray-900 ${row.mono ? "font-mono" : ""}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("version.hot_deploy_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <p>{t("version.hot_deploy_desc")}</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>{t("version.hot_deploy_step1")}</li>
            <li>{t("version.hot_deploy_step2")}</li>
            <li>{t("version.hot_deploy_step3")}</li>
          </ol>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="secondary">{t("version.hot_deploy_badge")}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}