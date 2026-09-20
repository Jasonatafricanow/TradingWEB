"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/client-api";
import { toast } from "sonner";
import {
  DELIVERY_METHODS,
  type ApiDeliveryMethod,
  parseDeliveryMethods,
  serializeDeliveryMethods,
} from "@/config/delivery-methods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { Plus } from "@phosphor-icons/react";

// ── Props ──
interface DeliveryMethodPickerProps {
  /** 当前已选的 delivery_method 逗号分隔值 */
  value: string;
  /** 商品类型（用于筛选可用的交付方式） */
  productType: string;
  /** 值变更回调 */
  onChange: (newValue: string) => void;
  /** 可选的 className */
  className?: string;
}

// ── 新增表单的类型 ──
interface NewMethodForm {
  code: string;
  label: string;
  label_en: string;
  applicable_types: string[];
}

const INITIAL_FORM: NewMethodForm = {
  code: "",
  label: "",
  label_en: "",
  applicable_types: [],
};

/**
 * DeliveryMethodPicker — 交付方式多选组件，支持内联新增自定义交付方式。
 *
 * 使用方式：
 * ```tsx
 * <DeliveryMethodPicker
 *   value={form.delivery_method}
 *   productType={form.type}
 *   onChange={(v) => setForm({ ...form, delivery_method: v })}
 * />
 * ```
 *
 * 新增的交付方式会通过 Sheet 弹窗填写 code / label / 适用商品类型，
 * 提交后自动刷新列表并预选中新 code。
 */
export function DeliveryMethodPicker({
  value,
  productType,
  onChange,
  className,
}: DeliveryMethodPickerProps) {
  // ── 交付方式列表状态 ──
  const [methods, setMethods] = useState<ApiDeliveryMethod[]>(() =>
    DELIVERY_METHODS.map((m) => ({
      id: `builtin-${m.code}`,
      code: m.code,
      label: m.label,
      label_en: m.i18nKey.replace("delivery.", ""),
      applicable_types: m.applicableTypes,
      sort_order: m.sort,
      is_active: true,
      is_builtin: true,
    }))
  );
  const [loadingMethods, setLoadingMethods] = useState(false);

  // ── 新增 Sheet 状态 ──
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newForm, setNewForm] = useState<NewMethodForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // ── 加载交付方式列表 ──
  const fetchMethods = useCallback(async () => {
    setLoadingMethods(true);
    try {
      const res = await apiFetch("/api/admin/delivery-methods");
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.data)) {
        setMethods(json.data);
      }
    } catch {
      // 静默降级，使用内置默认值
    } finally {
      setLoadingMethods(false);
    }
  }, []);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  // ── 筛选可用的交付方式 ──
  const availableMethods = methods.filter(
    (m) => m.applicable_types.includes(productType) && m.is_active
  );
  const selectedCodes = parseDeliveryMethods(value);

  // ── 勾选/取消 ──
  const toggleMethod = (code: string) => {
    const next = selectedCodes.includes(code)
      ? selectedCodes.filter((c) => c !== code)
      : [...selectedCodes, code];
    onChange(serializeDeliveryMethods(next));
  };

  // ── 重置新增表单 ──
  const openAddSheet = () => {
    setNewForm({ ...INITIAL_FORM, applicable_types: [productType] });
    setSheetOpen(true);
  };

  // ── 提交新增 ──
  const handleAdd = async () => {
    if (!newForm.code.trim()) {
      toast.error("请输入交付方式 code");
      return;
    }
    if (!newForm.label.trim()) {
      toast.error("请输入交付方式标签");
      return;
    }
    if (newForm.applicable_types.length === 0) {
      toast.error("请选择至少一个适用商品类型");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/delivery-methods", {
        method: "POST",
        body: JSON.stringify(newForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "新增失败");
      }
      toast.success("交付方式已创建");

      // 关闭 Sheet
      setSheetOpen(false);

      // 刷新列表
      await fetchMethods();

      // 预选中新 code
      const nextCodes = [...selectedCodes, newForm.code];
      onChange(serializeDeliveryMethods(nextCodes));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新增交付方式失败");
    } finally {
      setSaving(false);
    }
  };

  // ── 切换 applicable type ──
  const toggleApplicableType = (type: string) => {
    setNewForm((prev) => ({
      ...prev,
      applicable_types: prev.applicable_types.includes(type)
        ? prev.applicable_types.filter((t) => t !== type)
        : [...prev.applicable_types, type],
    }));
  };

  return (
    <div className={className}>
      <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-1.5">
        {availableMethods.map((m) => {
          const checked = selectedCodes.includes(m.code);
          return (
            <label
              key={m.id}
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleMethod(m.code)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{m.label}</span>
              <span className="text-xs text-gray-400">({m.code})</span>
              {m.is_builtin && (
                <span className="text-[10px] text-gray-300 ml-auto">内置</span>
              )}
            </label>
          );
        })}
        {availableMethods.length === 0 && !loadingMethods && (
          <p className="text-xs text-muted-foreground">
            当前商品类型无可选交付方式
          </p>
        )}
        {loadingMethods && (
          <p className="text-xs text-muted-foreground">加载中...</p>
        )}
      </div>

      {/* 新增交付方式按钮 */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 text-blue-600 hover:text-blue-700"
        onClick={openAddSheet}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        新增交付方式
      </Button>

      {/* 新增交付方式 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>新增交付方式</SheetTitle>
            <SheetDescription>
              添加新的交付方式，创建后即可在商品编辑中选用。
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 px-4 py-4">
            {/* code */}
            <div className="space-y-2">
              <Label>
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                value={newForm.code}
                onChange={(e) =>
                  setNewForm({ ...newForm, code: e.target.value })
                }
                placeholder="小写字母+数字，如: wechat_transfer"
              />
              <p className="text-xs text-muted-foreground">
                唯一标识，创建后不可修改
              </p>
            </div>

            {/* label */}
            <div className="space-y-2">
              <Label>
                标签 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={newForm.label}
                onChange={(e) =>
                  setNewForm({ ...newForm, label: e.target.value })
                }
                placeholder="如: 微信转账"
              />
            </div>

            {/* label_en */}
            <div className="space-y-2">
              <Label>标签（英文）</Label>
              <Input
                value={newForm.label_en}
                onChange={(e) =>
                  setNewForm({ ...newForm, label_en: e.target.value })
                }
                placeholder="如: WeChat Transfer"
              />
            </div>

            {/* applicable_types */}
            <div className="space-y-2">
              <Label>
                适用商品类型 <span className="text-red-500">*</span>
              </Label>
              <div className="space-y-1.5 rounded-md border p-3">
                {["service", "virtual", "physical"].map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={newForm.applicable_types.includes(type)}
                      onChange={() => toggleApplicableType(type)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      {type === "service"
                        ? "服务 (Service)"
                        : type === "virtual"
                        ? "虚拟商品 (Virtual)"
                        : "实物 (Physical)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter className="px-4 pb-4">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "创建中..." : "创建"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
