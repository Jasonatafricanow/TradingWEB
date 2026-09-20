"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { apiFetch } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, CreditCard, FloppyDisk, Gear, Globe, Shield, WarningCircle } from "@phosphor-icons/react";

interface SiteConfig {
  siteName: string;
  siteNameEn: string;
  siteDescription: string;
  siteDescriptionEn: string;
  contactEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  whatsappMessage: string;
  defaultLocale: string;
  currency: string;
  theme: string;
}

interface PaymentConfig {
  source: string;
  paypalConfigured: boolean;
  paypalClientIdConfigured: boolean;
  paypalClientSecretConfigured: boolean;
  paypalSandbox: boolean;
  stripeConfigured: boolean;
  stripePublicKeyConfigured: boolean;
  stripeSecretKeyConfigured: boolean;
  stripeSandbox: boolean;
}

interface SecurityConfig {
  forceHttps: boolean;
  rateLimitEnabled: boolean;
  rateLimitPerMinute: string;
  twoFactorEnabled: boolean;
  sessionTimeout: string;
}

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

  const [siteConfig, setSiteConfig] = useState<SiteConfig>({
    siteName: "GlobalTrade Hub",
    siteNameEn: "GlobalTrade Hub",
    siteDescription: "跨境咨询交易平台",
    siteDescriptionEn: "Cross-border Consulting & Trade Platform",
    contactEmail: "admin@globaltrade.com",
    supportPhone: "+86 400-888-8888",
    whatsappNumber: "",
    whatsappMessage: "",
    defaultLocale: "zh",
    currency: "USD",
    theme: "shopify",
  });


  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    source: "env",
    paypalConfigured: false,
    paypalClientIdConfigured: false,
    paypalClientSecretConfigured: false,
    paypalSandbox: true,
    stripeConfigured: false,
    stripePublicKeyConfigured: false,
    stripeSecretKeyConfigured: false,
    stripeSandbox: true,
  });

  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    forceHttps: true,
    rateLimitEnabled: true,
    rateLimitPerMinute: "60",
    twoFactorEnabled: false,
    sessionTimeout: "30",
  });

  // Load saved config from /api/admin/settings (site_settings 表)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/settings");
        if (!res.ok) throw new Error("load failed");
        const json = await res.json();
        const remote = json.data || {};
        if (cancelled) return;
        if (remote.site && Object.keys(remote.site).length) {
          setSiteConfig((prev) => ({ ...prev, ...remote.site }));
        }
        if (remote.payment && Object.keys(remote.payment).length) {
          setPaymentConfig((prev) => ({ ...prev, ...remote.payment }));
        }
        if (remote.security && Object.keys(remote.security).length) {
          setSecurityConfig((prev) => ({ ...prev, ...remote.security }));
        }
      } catch {
        // 回退：尝试旧的 localStorage 缓存以保证升级体验
        try {
          const saved = localStorage.getItem("admin_settings");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.site) setSiteConfig((prev) => ({ ...prev, ...parsed.site }));
            if (parsed.security) setSecurityConfig((prev) => ({ ...prev, ...parsed.security }));
          }
        } catch {
          /* ignore */
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const res = await apiFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          site: siteConfig,
          security: securityConfig,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      // 写一份本地缓存，避免下次首屏闪烁
      try {
        localStorage.setItem(
          "admin_settings",
          JSON.stringify({ site: siteConfig, security: securityConfig })
        );
      } catch { /* quota / private mode */ }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6 lg:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
              </div>
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>)
  }

  
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("admin.settings")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.settings_desc")}</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="gap-2"
            >
              {saveStatus === "saving" ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t("admin.saving")}
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {t("admin.saved")}
                </>
              ) : saveStatus === "error" ? (
                <>
                  <WarningCircle className="h-4 w-4" />
                  {t("admin.save_error")}
                </>
              ) : (
                <>
                  <FloppyDisk className="h-4 w-4" />
                  {t("admin.save_settings")}
                </>
              )}
            </Button>
          </div>

          <Tabs defaultValue="site" className="mt-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="site" className="gap-2">
                <Gear className="h-4 w-4" />
                {t("admin.site_settings")}
              </TabsTrigger>
              <TabsTrigger value="payment" className="gap-2">
                <CreditCard className="h-4 w-4" />
                {t("admin.payment_settings")}
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Shield className="h-4 w-4" />
                {t("admin.security_settings")}
              </TabsTrigger>
            </TabsList>

            {/* Site Settings */}
            <TabsContent value="site" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-600" />
                    {t("admin.site_info")}
                  </CardTitle>
                  <CardDescription>{t("admin.site_info_desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.site_name")} (中文)</Label>
                      <Input
                        value={siteConfig.siteName}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, siteName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.site_name")} (English)</Label>
                      <Input
                        value={siteConfig.siteNameEn}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, siteNameEn: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.site_description")} (中文)</Label>
                      <Input
                        value={siteConfig.siteDescription}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, siteDescription: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.site_description")} (English)</Label>
                      <Input
                        value={siteConfig.siteDescriptionEn}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, siteDescriptionEn: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("admin.contact_info")}</CardTitle>
                  <CardDescription>{t("admin.contact_info_desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.contact_email")}</Label>
                      <Input
                        type="email"
                        value={siteConfig.contactEmail}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, contactEmail: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.support_phone")}</Label>
                      <Input
                        value={siteConfig.supportPhone}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, supportPhone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* WhatsApp Config */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("admin.whatsapp_config")}</CardTitle>
                  <CardDescription>{t("admin.whatsapp_config_desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.whatsapp_number")}</Label>
                      <Input
                        value={siteConfig.whatsappNumber || ""}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, whatsappNumber: e.target.value })
                        }
                        placeholder={t("admin.whatsapp_number_placeholder")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.whatsapp_message")}</Label>
                      <Input
                        value={siteConfig.whatsappMessage || ""}
                        onChange={(e) =>
                          setSiteConfig({ ...siteConfig, whatsappMessage: e.target.value })
                        }
                        placeholder={t("admin.whatsapp_message_placeholder")}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("admin.locale_currency")}</CardTitle>
                  <CardDescription>{t("admin.locale_currency_desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.default_locale")}</Label>
                      <Select
                        value={siteConfig.defaultLocale}
                        onValueChange={(val) =>
                          setSiteConfig({ ...siteConfig, defaultLocale: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zh">中文</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.default_currency")}</Label>
                      <Select
                        value={siteConfig.currency}
                        onValueChange={(val) =>
                          setSiteConfig({ ...siteConfig, currency: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD - 美元</SelectItem>
                          <SelectItem value="EUR">EUR - 欧元</SelectItem>
                          <SelectItem value="GBP">GBP - 英镑</SelectItem>
                          <SelectItem value="JPY">JPY - 日元</SelectItem>
                          <SelectItem value="CNY">CNY - 人民币</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Theme Settings Card (Shopify style) */}
              <Card>
                <CardHeader>
                  <CardTitle>在线商店主题 (Online Store Theme)</CardTitle>
                  <CardDescription>选择您网站的前台模板主题（更改后前台立即切换生效）</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>当前激活主题 (Active Theme)</Label>
                      <Select
                        value={siteConfig.theme || "shopify"}
                        onValueChange={(val) =>
                          setSiteConfig({ ...siteConfig, theme: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="shopify">精品电商风 (Shopify Prestige)</SelectItem>
                          <SelectItem value="tech">科技玻璃风 (Tech Terminal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Settings */}
            <TabsContent value="payment" className="mt-6 space-y-6">
              <Card className="border-amber-200 bg-amber-50/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-900">
                    <WarningCircle className="h-5 w-5" />
                    Payment credentials are server-managed
                  </CardTitle>
                  <CardDescription className="text-amber-800">
                    PayPal and Stripe secrets must be configured through server environment variables. This page only shows runtime status and never stores or displays secret values.
                  </CardDescription>
                </CardHeader>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      PayPal
                    </CardTitle>
                    <CardDescription>{t("admin.paypal_desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Runtime status</span>
                      <span className={paymentConfig.paypalConfigured ? "font-medium text-green-700" : "font-medium text-red-700"}>
                        {paymentConfig.paypalConfigured ? "Configured" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>PAYPAL_CLIENT_ID</span>
                      <span>{paymentConfig.paypalClientIdConfigured ? "Set" : "Missing"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>PAYPAL_CLIENT_SECRET</span>
                      <span>{paymentConfig.paypalClientSecretConfigured ? "Set" : "Missing"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Sandbox mode</span>
                      <span>{paymentConfig.paypalSandbox ? "Enabled" : "Disabled"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-purple-600" />
                      Stripe
                    </CardTitle>
                    <CardDescription>{t("admin.stripe_desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Runtime status</span>
                      <span className={paymentConfig.stripeConfigured ? "font-medium text-green-700" : "font-medium text-red-700"}>
                        {paymentConfig.stripeConfigured ? "Configured" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>STRIPE_PUBLIC_KEY</span>
                      <span>{paymentConfig.stripePublicKeyConfigured ? "Set" : "Missing"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>STRIPE_SECRET_KEY</span>
                      <span>{paymentConfig.stripeSecretKeyConfigured ? "Set" : "Missing"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Sandbox mode</span>
                      <span>{paymentConfig.stripeSandbox ? "Enabled" : "Disabled"}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Security Settings */}
            <TabsContent value="security" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    {t("admin.security_config")}
                  </CardTitle>
                  <CardDescription>{t("admin.security_config_desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="font-medium">{t("admin.force_https")}</Label>
                      <p className="text-xs text-muted-foreground">{t("admin.force_https_desc")}</p>
                    </div>
                    <Switch
                      checked={securityConfig.forceHttps}
                      onCheckedChange={(checked) =>
                        setSecurityConfig({ ...securityConfig, forceHttps: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="font-medium">{t("admin.rate_limit")}</Label>
                      <p className="text-xs text-muted-foreground">{t("admin.rate_limit_desc")}</p>
                    </div>
                    <Switch
                      checked={securityConfig.rateLimitEnabled}
                      onCheckedChange={(checked) =>
                        setSecurityConfig({ ...securityConfig, rateLimitEnabled: checked })
                      }
                    />
                  </div>
                  {securityConfig.rateLimitEnabled && (
                    <div className="ml-4 space-y-2">
                      <Label>{t("admin.rate_limit_value")}</Label>
                      <Input
                        type="number"
                        value={securityConfig.rateLimitPerMinute}
                        onChange={(e) =>
                          setSecurityConfig({
                            ...securityConfig,
                            rateLimitPerMinute: e.target.value,
                          })
                        }
                        className="max-w-[200px]"
                      />
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="font-medium">{t("admin.two_factor")}</Label>
                      <p className="text-xs text-muted-foreground">{t("admin.two_factor_desc")}</p>
                    </div>
                    <Switch
                      checked={securityConfig.twoFactorEnabled}
                      onCheckedChange={(checked) =>
                        setSecurityConfig({ ...securityConfig, twoFactorEnabled: checked })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.session_timeout")}</Label>
                    <Select
                      value={securityConfig.sessionTimeout}
                      onValueChange={(val) =>
                        setSecurityConfig({ ...securityConfig, sessionTimeout: val })
                      }
                    >
                      <SelectTrigger className="max-w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 {t("admin.minutes")}</SelectItem>
                        <SelectItem value="30">30 {t("admin.minutes")}</SelectItem>
                        <SelectItem value="60">1 {t("admin.hour")}</SelectItem>
                        <SelectItem value="120">2 {t("admin.hours")}</SelectItem>
                        <SelectItem value="480">8 {t("admin.hours")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>);
}
