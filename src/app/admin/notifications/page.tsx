"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/contexts/i18n-context";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader } from "../_components";
import { ArrowsClockwise, Bell, ChatCircle, CheckFat, Envelope, Funnel, Info, Megaphone, ShoppingBag, Warning } from "@phosphor-icons/react";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  channel: string;
  created_at: string;
  read_at: string | null;
}

const typeIcons: Record<string, React.ElementType> = {
  order: ShoppingBag,
  message: ChatCircle,
  alert: Warning,
  promotion: Megaphone,
  info: Info,
};

const typeColors: Record<string, string> = {
  order: "bg-blue-100 text-blue-700",
  message: "bg-purple-100 text-purple-700",
  alert: "bg-red-100 text-red-700",
  promotion: "bg-green-100 text-green-700",
  info: "bg-gray-100 text-gray-700",
};

export default function AdminNotificationsPage() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterRead, setFilterRead] = useState("all");

  const load = useCallback(async () => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const params = new URLSearchParams();
      params.set("limit", "100");
      const res = await apiFetch("/api/notifications?" + params.toString());
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
      }
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/notifications/" + id + "/read", { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
      }
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/notifications", { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        toast.success("All marked as read");
      }
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const filtered = notifications.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    if (filterRead === "unread" && n.is_read) return false;
    if (filterRead === "read" && !n.is_read) return false;
    return true;
  });

  const fmtDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return diffMin + "m ago";
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return diffHours + "h ago";
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex"><div className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-2">{unreadCount} unread</Badge>
            )}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckFat className="h-4 w-4 mr-1" /> Mark All Read
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Funnel className="h-4 w-4" /> Filter:
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="alert">Alert</SelectItem>
              <SelectItem value="promotion">Promotion</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRead} onValueChange={setFilterRead}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No notifications found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((notif) => {
              const Icon = typeIcons[notif.type] || Info;
              return (
                <div
                  key={notif.id}
                  className={
                    "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors " +
                    (notif.is_read
                      ? "bg-white hover:bg-gray-50"
                      : "bg-blue-50 border-blue-200 hover:bg-blue-100")
                  }
                  onClick={() => !notif.is_read && markRead(notif.id)}
                >
                  <div className={"p-2 rounded-full " + (typeColors[notif.type] || typeColors.info)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={"text-sm " + (notif.is_read ? "font-normal" : "font-semibold")}>
                        {notif.title}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {fmtDate(notif.created_at)}
                      </span>
                    </div>
                    {notif.body && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notif.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {notif.type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {notif.channel}
                      </Badge>
                      {!notif.is_read && (
                        <span className="text-[10px] text-blue-600 font-medium">New</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
