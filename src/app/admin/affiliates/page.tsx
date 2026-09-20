"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { toast } from "sonner";
import { PageHeader } from "../_components";
import { ArrowsClockwise, CheckCircle, Plus, ShareNetwork, SignOut, Warning, XCircle } from "@phosphor-icons/react";

interface AffiliateData {
  id: string; user_id: string; code: string; status: string;
  nickname?: string; name?: string; email?: string; rate?: string;
  balance?: string; commission_rate?: string; total_earned?: string;
  total_paid?: string; clicks?: number; conversions?: number;
  exit_settlement?: string; exit_settled_at?: string;
  users?: { name?: string; email?: string; };
  created_at: string;
}

interface PayoutData {
  id: string; affiliate_id: string; amount: string;
  commission?: string; status: string; method?: string;
  note?: string; affiliates?: { nickname?: string; };
  created_at: string;
}

export default function AdminAffiliatesPage() {
  const { t } = useI18n();
  const [affiliates, setAffiliates] = useState<AffiliateData[]>([]);
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [aRes, pRes] = await Promise.all([
        fetch("/api/admin/affiliates"),
        fetch("/api/admin/affiliates/payouts"),
      ]);
      setAffiliates((await aRes.json()).data || []);
      setPayouts((await pRes.json()).data || []);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Manual create
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newNickname, setNewNickname] = useState("")
  const [newRate, setNewRate] = useState("5")

  const handleManualCreate = async () => {
    if (!newEmail || !newNickname) return toast.error("请填写邮箱和昵称")
    setCreating(true)
    try {
      const res = await fetch("/api/admin/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, nickname: newNickname, rate: parseFloat(newRate) || 5 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "添加失败")
      toast.success("推广者已添加")
      setCreateOpen(false); setNewEmail(""); setNewNickname(""); setNewRate("5"); load()
    } catch (err) { toast.error(err instanceof Error ? err.message : "添加失败") }
    finally { setCreating(false) }
  }

  const handleReview = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/affiliates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { toast.success(status === "active" ? "Approved" : "Suspended"); load(); }
      else { toast.error("Operation failed"); }
    } catch { toast.error("Network error"); }
  };

  const handlePayout = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/admin/affiliates/payouts/${id}/${action}`, {
        method: "POST",
      });
      if (res.ok) { toast.success(action === "approve" ? "Payout approved" : "Payout rejected"); load(); }
      else { toast.error("Operation failed"); }
    } catch { toast.error("Network error"); }
  };

  const pendingReviews = affiliates.filter(a => a.status === "pending");
  const totalEarned = affiliates.reduce((s, a) => s + parseFloat(a.total_earned || "0"), 0);
  const suspicious = affiliates.filter(a => a.status === "suspended");

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShareNetwork className="h-6 w-6" /> {t("admin.affiliates_title")}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> {t("admin.refresh")}
            </Button>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {t("admin.new_affiliate")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("admin.new_affiliate")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{t("staff.email")} *</Label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="promoter@example.com" /></div>
                  <div><Label>{t("staff.name")} *</Label><Input value={newNickname} onChange={e => setNewNickname(e.target.value)} placeholder="Nickname" /></div>
                  <div><Label>{t("coupon.value")} (%)</Label><Input type="number" min="0" max="100" step="0.1" value={newRate} onChange={e => setNewRate(e.target.value)} /></div>
                  <Button onClick={handleManualCreate} className="w-full" disabled={creating}>
                    {creating ? t("admin.creating") : t("admin.confirm_create")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{t("admin.affiliates_total")}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold">{affiliates.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{t("admin.affiliates_earned")}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold text-green-600">${formatMoney(totalEarned)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{t("admin.affiliates_suspicious")}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold text-red-600">{suspicious.length}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="review">
          <TabsList className="mb-4">
            <TabsTrigger value="review">Review ({pendingReviews.length})</TabsTrigger>
            <TabsTrigger value="affiliates">All ({affiliates.length})</TabsTrigger>
            <TabsTrigger value="payouts">Payouts ({payouts.length})</TabsTrigger>
            <TabsTrigger value="fraud">Deactivated ({suspicious.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="review">
            {pendingReviews.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending reviews</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <Table><TableHeader><TableRow>
                  <TableHead>User</TableHead><TableHead>Nickname</TableHead><TableHead>Code</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{pendingReviews.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{a.users?.email || a.user_id?.slice(0, 8)}</TableCell>
                    <TableCell>{a.nickname}</TableCell>
                    <TableCell><code className="text-xs">{a.code}</code></TableCell>
                    <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleReview(a.id, "active")}>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleReview(a.id, "suspended")}>
                        <XCircle className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="affiliates">
            {affiliates.filter(a => a.status !== "pending").length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No affiliates yet</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <Table><TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Nickname</TableHead><TableHead>Rate</TableHead><TableHead>Balance</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{affiliates.filter(a => a.status !== "pending").map(a => (
                  <TableRow key={a.id}>
                    <TableCell><code className="text-xs">{a.code}</code></TableCell>
                    <TableCell>{a.nickname}</TableCell>
                    <TableCell>{a.rate || a.commission_rate || "0"}%</TableCell>
                    <TableCell>${formatMoney(a.balance)}</TableCell>
                    <TableCell>${formatMoney(a.total_earned)}</TableCell>
                    <TableCell><Badge variant={a.status === "active" ? "default" : "destructive"}>{a.status}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleReview(a.id, a.status === "active" ? "suspended" : "active")}>
                        {a.status === "active" ? "Suspend" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="payouts">
            {payouts.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No payout requests</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <Table><TableHeader><TableRow>
                  <TableHead>Affiliate</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.affiliates?.nickname || p.affiliate_id?.slice(0, 8)}</TableCell>
                    <TableCell>${formatMoney(p.commission || p.amount)}</TableCell>
                    <TableCell><Badge variant={p.status === "pending" ? "outline" : "default"}>{p.status}</Badge></TableCell>
                    <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handlePayout(p.id, "approve")}>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handlePayout(p.id, "reject")}>
                        <XCircle className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="fraud">
            {affiliates.filter(a => a.status === "deactivated").length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No deactivated affiliates</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <Table><TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Nickname</TableHead><TableHead>Settlement</TableHead><TableHead>Settled At</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>{affiliates.filter(a => a.status === "deactivated").map(a => (
                  <TableRow key={a.id}>
                    <TableCell><code className="text-xs">{a.code}</code></TableCell>
                    <TableCell>{a.nickname}</TableCell>
                    <TableCell>${formatMoney(a.exit_settlement)}</TableCell>
                    <TableCell>{a.exit_settled_at ? new Date(a.exit_settled_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell><Badge variant="secondary">Deactivated</Badge></TableCell>
                  </TableRow>
                ))}</TableBody></Table>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
