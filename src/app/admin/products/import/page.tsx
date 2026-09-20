"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Papa from "papaparse";
import { CheckCircle, Download, FileText, Spinner, Upload, WarningCircle, XCircle } from "@phosphor-icons/react";

const TEMPLATE_COLUMNS = [
  "Title",
  "Title_EN",
  "Description",
  "Description_EN",
  "Price",
  "Compare_At_Price",
  "Cost_Price",
  "Category",
  "Status",
  "Type",
  "Delivery_Method",
  "Duration",
  "Barcode",
  "Vendor",
  "Collection",
  "Tags",
  "Meta_Title",
  "Meta_Description",
  "Variants",
];

const VALID_STATUSES = ["active", "inactive", "sold"];
const VALID_TYPES = ["service", "virtual", "physical"];

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface ImportResult {
  imported: number;
  failed: number;
  total: number;
  errors?: { row: number; error: string }[];
}

export default function AdminProductsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, string>[] | null>(null);
  const [rowErrors, setRowErrors] = useState<{ row: number; error: string }[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateRow = (row: Record<string, string>): string | null => {
    if (!row.Title || !row.Title.trim()) return "Title is required";
    if (!row.Price || row.Price.trim() === "" || isNaN(parseFloat(row.Price))) return "Price is required and must be a number";
    if (row.Compare_At_Price && row.Compare_At_Price.trim() && isNaN(parseFloat(row.Compare_At_Price))) return "Compare_At_Price must be a number";
    if (row.Cost_Price && row.Cost_Price.trim() && isNaN(parseFloat(row.Cost_Price))) return "Cost_Price must be a number";
    if (row.Variants && row.Variants.trim().startsWith("[")) {
      try {
        const variants = JSON.parse(row.Variants) as unknown;
        if (!Array.isArray(variants)) return "Variants JSON must be an array";
      } catch {
        return "Variants must be valid JSON or legacy title:price:stock format";
      }
    }
    if (row.Status && row.Status.trim() && !VALID_STATUSES.includes(row.Status.trim().toLowerCase())) {
      return `Invalid status: "${row.Status}". Valid values: ${VALID_STATUSES.join(", ")}`;
    }
    if (row.Type && row.Type.trim() && !VALID_TYPES.includes(row.Type.trim().toLowerCase())) {
      return `Invalid type: "${row.Type}". Valid values: ${VALID_TYPES.join(", ")}`;
    }
    return null;
  };

  const handleFile = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith(".csv")) {
      alert("Please select a CSV file");
      return;
    }

    setFile(selectedFile);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as Record<string, string>[];
          const errors: { row: number; error: string }[] = [];
          let valid = 0;
          let errCount = 0;

          rows.forEach((row, i) => {
            const error = validateRow(row);
            if (error) {
              errors.push({ row: i + 1, error });
              errCount++;
            } else {
              valid++;
            }
          });

          setParsedData(rows);
          setRowErrors(errors);
          setValidCount(valid);
          setErrorCount(errCount);
        },
        error: () => {
          alert("Failed to parse CSV file");
        },
      });
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const downloadTemplate = () => {
    const headers = TEMPLATE_COLUMNS.join(",");
    const sampleRow = [
      "Sample Product",
      "Sample Product EN",
      "Product description in Chinese",
      "Product description in English",
      "99.99",
      "129.99",
      "55.00",
      "CategoryName",
      "active",
      "physical",
      "shipping",
      "",
      "0123456789012",
      "Acme",
      "Summer",
      "tag1,tag2",
      "SEO Title",
      "SEO Description",
      JSON.stringify([
        {
          title: "Basic",
          sku: "BASIC-001",
          barcode: "0123456789012",
          price: "79.99",
          compare_at_price: "99.99",
          cost: "40.00",
          stock: 10,
          weight: "0.50",
          weight_unit: "kg",
          option1: "Color: Black",
          image: "",
          is_default: true,
        },
        {
          title: "Premium",
          sku: "PREM-001",
          barcode: "0123456789013",
          price: "129.99",
          compare_at_price: "",
          cost: "70.00",
          stock: 5,
          weight: "0.60",
          weight_unit: "kg",
          option1: "Color: Silver",
          image: "",
          is_default: false,
        },
      ]),
    ]
      .map(escapeCsvValue)
      .join(",");
    const csvContent = headers + "\n" + sampleRow;
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!parsedData || validCount === 0) return;
    setImporting(true);
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/products/import", {
        method: "POST",
        body: JSON.stringify({ products: parsedData }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      alert("Import failed due to network error");
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const resetForm = () => {
    setFile(null);
    setParsedData(null);
    setRowErrors([]);
    setValidCount(0);
    setErrorCount(0);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const previewRows = parsedData ? parsedData.slice(0, 10) : [];

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">批量导入产品</h1>
              <p className="mt-1 text-sm text-muted-foreground">通过 CSV 文件批量导入或更新产品</p>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              下载 Excel 模板
            </Button>
          </div>

          {/* Step 1: Upload */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">1. 上传 CSV 文件</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetForm();
                      }}
                    >
                      移除
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      拖拽 CSV 文件到此处，或点击选择文件
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">支持 .csv 格式</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Preview */}
          {parsedData && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">2. 数据预览</CardTitle>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1">
                      共 <strong>{parsedData.length}</strong> 行
                    </span>
                    <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      有效: {validCount}
                    </Badge>
                    {errorCount > 0 && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        错误: {errorCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium w-12">#</th>
                        <th className="px-4 py-3 font-medium">Title</th>
                        <th className="px-4 py-3 font-medium">Price</th>
                        <th className="px-4 py-3 font-medium">Category</th>
                        <th className="px-4 py-3 font-medium">Vendor</th>
                        <th className="px-4 py-3 font-medium">Barcode</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Variants</th>
                        <th className="px-4 py-3 font-medium">错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => {
                        const error = rowErrors.find((e) => e.row === i + 1);
                        return (
                          <tr
                            key={i}
                            className={`border-b last:border-0 hover:bg-gray-50 ${
                              error ? "bg-red-50" : ""
                            }`}
                          >
                            <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-3 font-medium">{row.Title || "-"}</td>
                            <td className="px-4 py-3">{row.Price || "-"}</td>
                            <td className="px-4 py-3 text-xs">{row.Category || "-"}</td>
                            <td className="px-4 py-3 text-xs">{row.Vendor || "-"}</td>
                            <td className="px-4 py-3 text-xs font-mono">{row.Barcode || "-"}</td>
                            <td className="px-4 py-3">{row.Status || "-"}</td>
                            <td className="px-4 py-3">{row.Type || "-"}</td>
                            <td className="px-4 py-3 text-xs max-w-[200px] truncate">
                              {row.Variants || "-"}
                            </td>
                            <td className="px-4 py-3">
                              {error && (
                                <span className="text-xs text-red-600 flex items-center gap-1">
                                  <WarningCircle className="h-3 w-3 shrink-0" />
                                  {error.error}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {parsedData.length > 10 && (
                  <p className="px-4 py-2 text-xs text-muted-foreground border-t">
                    显示前 10 行，共 {parsedData.length} 行
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Import */}
          {parsedData && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">3. 确认导入</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleImport}
                    disabled={importing || validCount === 0}
                    className="gap-2"
                  >
                    {importing ? (
                      <>
                        <Spinner className="h-4 w-4" />
                        导入中...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        确认导入 ({validCount} 条有效数据)
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    重新选择文件
                  </Button>
                </div>

                {/* Result */}
                {result && (
                  <div className="mt-4 p-4 rounded-lg border">
                    <h4 className="font-medium mb-2">导入结果</h4>
                    <div className="flex items-center gap-4 text-sm">
                      <span>
                        总计: <strong>{result.total}</strong>
                      </span>
                      <Badge variant="default" className="bg-green-100 text-green-700">
                        成功: {result.imported}
                      </Badge>
                      {result.failed > 0 && (
                        <Badge variant="destructive">失败: {result.failed}</Badge>
                      )}
                    </div>
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-3 max-h-32 overflow-y-auto">
                        <p className="text-xs font-medium text-red-600 mb-1">错误详情:</p>
                        {result.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-500">
                            第 {e.row} 行: {e.error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>);
}
