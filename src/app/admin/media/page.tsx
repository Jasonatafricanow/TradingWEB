"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/error-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "../_components";
import { Check, Copy, MagnifyingGlass, Trash, Upload } from "@phosphor-icons/react";

interface MediaItem {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  alt_text: string | null;
  created_at: string;
}

export default function AdminMediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMedia = useCallback(async (search?: string) => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "100");
      const res = await apiFetch(`/api/admin/media?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMedia(data.data || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { getStoredToken } = await import("@/contexts/auth-context");
      const token = getStoredToken() || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });
      if (res.ok) {
        fetchMedia(searchQuery);
      } else {
        let errorMsg = "Upload failed";
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          errorMsg = getErrorMessage(data.error, "Upload failed");
        } else {
          errorMsg = `Upload failed (HTTP ${res.status})`;
        }
        alert(errorMsg);
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCopyUrl = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = item.url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch(`/api/admin/media?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchMedia(searchQuery);
      }
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchMedia(searchQuery);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">媒体库</h1>
              <p className="mt-1 text-sm text-muted-foreground">{media.length} 个文件</p>
            </div>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
                <Upload className="h-4 w-4" />
                {uploading ? "上传中..." : "上传文件"}
              </Button>
            </div>
          </div>

          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative max-w-sm">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索文件名..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </form>

          {media.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                暂无媒体文件，点击上传按钮添加
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {media.map((item) => (
                <Card
                  key={item.id}
                  className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleCopyUrl(item)}
                >
                  <div className="relative aspect-square bg-gray-100">
                    <img
                      src={item.url}
                      alt={item.alt_text || item.original_name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {copiedId === item.id ? (
                        <span className="flex items-center gap-1 text-white text-xs bg-green-500 px-2 py-1 rounded">
                          <Check className="h-3 w-3" /> 已复制
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-white text-xs bg-blue-500 px-2 py-1 rounded">
                          <Copy className="h-3 w-3" /> 复制链接
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="text-xs truncate text-gray-700" title={item.original_name}>{item.original_name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatSize(item.size)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 "{deleteTarget?.original_name}" 吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
