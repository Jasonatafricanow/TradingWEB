"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { applyColorMode, COLOR_MODE_STORAGE_KEY, type ColorMode } from "@/lib/theme-init";

type Mode = ColorMode;
const STORAGE_KEY = COLOR_MODE_STORAGE_KEY;
const applyMode = applyColorMode;

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "system";
    setMode(stored);
    applyMode(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "system";
      if (current === "system") applyMode("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (m: Mode) => {
    setMode(m);
    localStorage.setItem(STORAGE_KEY, m);
    applyMode(m);
  };

  const options: { value: Mode; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: t("theme.light"), Icon: Sun },
    { value: "dark", label: t("theme.dark"), Icon: Moon },
    { value: "system", label: t("theme.system"), Icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("theme.toggle")}
          className={cn("flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground",
            className
          )}
        >
          {mode === "dark" ? (
            <Moon className="h-4 w-4" weight="duotone" />
          ) : mode === "light" ? (
            <Sun className="h-4 w-4" weight="duotone" />
          ) : (
            <Monitor className="h-4 w-4" weight="duotone" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {options.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => choose(value)}
            className={cn("gap-2 cursor-pointer", mode === value && "bg-accent font-medium")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}