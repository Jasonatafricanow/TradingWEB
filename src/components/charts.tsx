/**
 * 图表组件包装器
 *
 * 动态加载 recharts 以减小首屏 JS 体积（recharts ~500KB）。
 * 所有图表组件通过 next/dynamic + ssr: false 按需加载。
 *
 * 用法：import { Bar, BarChart, ... } from '@/components/charts'
 */
import dynamic from "next/dynamic"

// next/dynamic + recharts 的类型推断有限，需要 @ts-ignore
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
export const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false })
// @ts-ignore
export const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false })
// @ts-ignore
export const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false })
// @ts-ignore
export const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false })
// @ts-ignore
export const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false })
// @ts-ignore
export const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false })
// @ts-ignore
export const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false })
// @ts-ignore
export const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false })
// @ts-ignore
export const AreaChart = dynamic(() => import("recharts").then((m) => m.AreaChart), { ssr: false })
// @ts-ignore
export const Area = dynamic(() => import("recharts").then((m) => m.Area), { ssr: false })
// @ts-ignore
export const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), { ssr: false })
// @ts-ignore
export const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false })
// @ts-ignore
export const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false })
/* eslint-enable @typescript-eslint/ban-ts-comment */
