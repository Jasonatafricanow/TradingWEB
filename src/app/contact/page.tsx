"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Envelope, ChatCircle, MapPin, Clock, PaperPlaneTilt, CheckCircle, Spinner, ArrowRight,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/reveal";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

const CHANNELS = [
  { Icon: Envelope, labelKey: "contact.channel.email", value: "support@fjglobal.online", href: "mailto:support@fjglobal.online", noteKey: "contact.channel.email.note" },
  { Icon: ChatCircle, labelKey: "contact.channel.whatsapp", value: "+258 87 888 8181", href: "https://wa.me/258878888181", noteKey: "contact.channel.whatsapp.note" },
  { Icon: Clock, labelKey: "contact.channel.hours", value: "Mon–Fri · 09:00–18:00 (UTC+8)", href: null, noteKey: "contact.channel.hours.note" },
];

const TOPICS = ["contact.topic.order", "contact.topic.sourcing", "contact.topic.consulting", "contact.topic.partner"];

export default function ContactPage() {
  const { t } = useI18n();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", topic: TOPICS[0], message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error(t("contact.form.required"));
      return;
    }
    setSending(true);
    // 演示环境：本地模拟提交，不发送真实邮件
    window.setTimeout(() => {
      setSending(false);
      setSent(true);
      toast.success(t("contact.form.success"));
    }, 700);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("footer.contact") }]} />

      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl font-medium sm:text-4xl">
          {t("contact.title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("contact.subtitle")}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Channels */}
        <div className="lg:col-span-5">
          <div className="space-y-3">
            {CHANNELS.map(({ Icon, labelKey, value, href, noteKey }, i) => (
              <Reveal key={labelKey} delay={i * 80}>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card transition-colors duration-200">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {t(labelKey)}
                      </p>
                      {href ? (
                        <a
                          href={href}
                          target={href.startsWith("http") ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className="mt-1 block break-words font-display text-[15px] font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="mt-1 font-display text-[15px] font-medium">{value}</p>
                      )}
                      <p className="mt-1 text-[12.5px] text-muted-foreground">{t(noteKey)}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={240}>
            <div className="mt-5 overflow-hidden rounded-2xl border border-border shadow-card">
              <div className="relative aspect-[16/10]">
                <Image
                  src="/images/catalog/business-meeting-3.jpg"
                  alt={t("contact.image_alt")}
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="flex items-center gap-2 text-[11px] font-medium text-white/80">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("contact.hq")}
                  </p>
                  <p className="mt-1 text-sm text-white/90">Century Avenue 100, Pudong, Shanghai</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Form */}
        <div className="lg:col-span-7">
          <Reveal delay={100}>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
              {sent ? (
                <div className="py-10 text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <CheckCircle className="h-7 w-7" weight="duotone" />
                  </span>
                  <h2 className="mt-5 font-display text-xl font-medium">
                    {t("contact.form.sent_title")}
                  </h2>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {t("contact.form.sent_desc")}
                  </p>
                  <div className="mt-7 flex flex-wrap justify-center gap-3">
                    <Button variant="outline" onClick={() => { setSent(false); setForm({ name: "", email: "", topic: TOPICS[0], message: "" }); }}>
                      {t("contact.form.again")}
                    </Button>
                    <Button asChild>
                      <Link href="/products">
                        {t("home.hero.cta.primary")}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <h2 className="font-display text-xl font-medium">
                    {t("contact.form.title")}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="c-name">{t("checkout.your_name")}</Label>
                      <Input
                        id="c-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={t("checkout.your_name_placeholder")}
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-email">{t("auth.email")}</Label>
                      <Input
                        id="c-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@company.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("contact.form.topic")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {TOPICS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm({ ...form, topic: key })}
                          className={
                            "rounded-md border px-4 py-1.5 text-[13px] font-medium transition-colors duration-200 " +
                            (form.topic === key
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-muted-foreground hover:text-foreground")
                          }
                        >
                          {t(key)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-msg">{t("contact.form.message")}</Label>
                    <textarea
                      id="c-msg"
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder={t("contact.form.message_placeholder")}
                      className="w-full rounded-xl border border-input bg-card px-4 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <Button type="submit" size="lg" disabled={sending}>
                      {sending ? <Spinner className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
                      {sending ? t("checkout.processing") : t("contact.form.submit")}
                    </Button>
                    <p className="text-[12px] text-muted-foreground">{t("contact.form.note")}</p>
                  </div>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}