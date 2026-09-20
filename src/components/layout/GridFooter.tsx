"use client"
import { Fragment } from "react"

export default function GridFooter() {
  return (
    <footer className="mt-20 border-t border-border-subtle pt-12 pb-20 px-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1 md:col-span-2">
        <h2 className="font-headline-sm mb-4">订阅全球贸易趋势</h2>
        <p className="text-on-surface-variant mb-6 max-w-md">每周为您推送最新的原材料行情、供应链报告以及优质供应商推荐。</p>
        <div className="flex gap-2 max-w-sm">
        <input className="flex-1 bg-surface-container-low border-border-subtle rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-primary/20" placeholder="您的邮箱地址" type="email"/>
        <button className="bg-primary text-on-primary px-6 py-2 rounded-lg font-bold">订阅</button>
        </div>
        </div>
        <div>
        <h4 className="font-bold mb-4">关于我们</h4>
        <ul className="space-y-2 text-on-surface-variant text-sm">
        <li><a className="hover:text-primary" href="#">平台介绍</a></li>
        <li><a className="hover:text-primary" href="#">信任与安全</a></li>
        <li><a className="hover:text-primary" href="#">加入我们</a></li>
        </ul>
        </div>
        <div>
        <h4 className="font-bold mb-4">帮助中心</h4>
        <ul className="space-y-2 text-on-surface-variant text-sm">
        <li><a className="hover:text-primary" href="#">物流追踪</a></li>
        <li><a className="hover:text-primary" href="#">退款政策</a></li>
        <li><a className="hover:text-primary" href="#">联系客服</a></li>
        </ul>
        </div>
        </div>
        </footer>
  );
}
