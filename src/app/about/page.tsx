"use client"
import { Fragment } from "react"
import Link from "next/link"

export default function Page() {
  return (
  <Fragment>

{/* Hero Section */}
<section className="relative px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20 overflow-hidden">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
<div className="z-10">
<h1 className="text-4xl md:text-5xl lg:text-6xl tracking-tight leading-none font-semibold text-gray-900">
  Cross-Border Trade, <br/><span className="text-blue-600">Connected Globally</span>
</h1>
<p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-lg">
  GlobalTrade is a trusted digital service platform, empowering your international journey through professional consulting and premium digital assets.
</p>
<div className="mt-10 flex flex-wrap items-center gap-8">
<div className="flex flex-col">
<span className="text-3xl font-semibold text-blue-600">1000+</span>
<span className="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Users</span>
</div>
<div className="w-px h-10 bg-gray-200"></div>
<div className="flex flex-col">
<span className="text-3xl font-semibold text-blue-600">500+</span>
<span className="text-xs text-gray-500 uppercase tracking-wider mt-1">Quality Products</span>
</div>
<div className="w-px h-10 bg-gray-200"></div>
<div className="flex flex-col">
<span className="text-3xl font-semibold text-blue-600">50+</span>
<span className="text-xs text-gray-500 uppercase tracking-wider mt-1">Categories</span>
</div>
</div>
</div>
<div className="relative lg:h-[500px] rounded-2xl overflow-hidden shadow-xl">
<img
  className="w-full h-full object-cover"
  alt="Global trade team collaborating in a modern office overlooking a city skyline at sunset"
  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIcpbOatx3fXDH2rAuN55IRrGt_QVzCklcH1kUckSOSmItYvZOlBtmyYStfKC6spX7jd2QDbJZnOMdX3qo5IP5zPVeKYQ4-FtEIjfUK6M4PIHeyRskHbvuXtP9LhA27l5R4BzuYIMSvlWBhjW8fSzZouzzWknfCK3NkF_bqzRNW2RagMGyeO7xRuuuA7KZWlYmep7JHgtJoQl4XEAQ-Ibc9FbHqI226wVTk_WKX31i473kI_YAJeDPpsKl_YNicI6bNQZbRXf_sqk"
/>
<div className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-transparent"></div>
</div>
</div>
{/* Background Decoration */}
<div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-100/30 blur-[120px] rounded-full -z-10"></div>
</section>

{/* Trust & Security Section */}
<section className="bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
<div className="max-w-7xl mx-auto">
<div className="text-center mb-14">
<h2 className="text-2xl md:text-3xl font-semibold text-gray-900">Secure Cross-Border Payment</h2>
<p className="mt-4 text-base text-gray-500">Dual payment protection and global SSL encryption for worry-free transactions.</p>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
{[
  {
    icon: "🔒",
    bgClass: "bg-blue-100",
    iconClass: "text-blue-600",
    title: "SSL Encryption",
    desc: "Military-grade encryption protocols protecting every byte of your data during transmission."
  },
  {
    icon: "💳",
    bgClass: "bg-indigo-100",
    iconClass: "text-indigo-600",
    title: "Verified Partners",
    desc: "Supporting PayPal and Visa international credit card payments with integrated fraud protection.",
    badges: ["PAYPAL", "VISA"]
  },
  {
    icon: "🛡️",
    bgClass: "bg-purple-100",
    iconClass: "text-purple-600",
    title: "Buyer Protection",
    desc: "Comprehensive transaction monitoring and resolution support for every digital purchase."
  },
].map((card) => (
<div key={card.title} className="bg-white border border-gray-100 rounded-xl p-8 flex flex-col items-center text-center shadow-sm">
<div className={`w-16 h-16 ${card.bgClass} rounded-full flex items-center justify-center mb-6`}>
<span className={`text-2xl ${card.iconClass}`}>{card.icon}</span>
</div>
<h3 className="text-lg font-semibold text-gray-900 mb-3">{card.title}</h3>
{card.badges && (
  <div className="flex gap-3 mt-1 mb-2">
    {card.badges.map(b => (
      <span key={b} className="px-3 py-1 bg-gray-100 rounded text-xs font-medium tracking-wide">{b}</span>
    ))}
  </div>
)}
<p className="text-sm text-gray-500">{card.desc}</p>
</div>
))}
</div>
</div>
</section>

{/* Contact Section */}
<section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
<div className="grid grid-cols-1 lg:grid-cols-5 gap-16">
{/* Contact Info */}
<div className="lg:col-span-2">
<h2 className="text-2xl md:text-3xl font-semibold text-gray-900">Get in Touch</h2>
<p className="mt-4 text-base text-gray-500 leading-relaxed">
  Connected to global experts with multilingual support. We&apos;re here to help you navigate the international landscape.
</p>
<div className="mt-10 space-y-6">
{[
  {
    icon: "💬",
    bgClass: "bg-green-100",
    iconColor: "text-green-600",
    title: "WhatsApp Support",
    detail: "+258 87 888 8181",
    href: "https://wa.me/258878888181"
  },
  {
    icon: "✉️",
    bgClass: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Email Inquiry",
    detail: "support@globaltrade.enterprise"
  },
  {
    icon: "🌐",
    bgClass: "bg-indigo-100",
    iconColor: "text-indigo-600",
    title: "Global Experts",
    detail: "One-on-one service from senior experts"
  },
].map((item) => {
  const content = (
    <div className="flex items-center gap-5 p-4 rounded-xl hover:bg-gray-50 transition-colors group cursor-pointer">
    <div className={`w-12 h-12 rounded-full ${item.bgClass} flex items-center justify-center ${item.iconColor} group-hover:scale-110 transition-transform`}>
    <span>{item.icon}</span>
    </div>
    <div>
    <h4 className="font-semibold text-gray-900 text-sm">{item.title}</h4>
    <p className="text-sm text-gray-500">{item.detail}</p>
    </div>
    </div>
  );
  return item.href ? <Link key={item.title} href={item.href}>{content}</Link> : <div key={item.title}>{content}</div>;
})}
</div>
</div>
{/* Contact Form */}
<div className="lg:col-span-3">
<form className="bg-white border border-gray-100 rounded-2xl p-8 md:p-10 shadow-sm space-y-6">
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="space-y-2">
<label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</label>
<input className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="John Doe" type="text"/>
</div>
<div className="space-y-2">
<label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</label>
<input className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="john@example.com" type="email"/>
</div>
</div>
<div className="space-y-2">
<label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</label>
<select className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
<option>Business Consulting</option>
<option>Tech Advisory</option>
<option>Legal Consulting</option>
<option>Digital Products Support</option>
<option>Other</option>
</select>
</div>
<div className="space-y-2">
<label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Message</label>
<textarea className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="How can we help your journey?" rows={4}></textarea>
</div>
<button className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm" type="submit">Send Message</button>
</form>
</div>
</div>
</section>

{/* Map Section */}
<section className="w-full h-[400px] bg-gray-100 grayscale hover:grayscale-0 transition-all duration-700 overflow-hidden relative">
<img
  className="w-full h-full object-cover"
  alt="World map showing global trade hubs with subtle glowing points indicating international presence"
  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBWxnW3xj4tNBNRX_9sRxNdjJtR51wI3ug25i--t7p9pOeUH6X0D4mJoFz4tebpMvE1FOdO1IO-f4IywT3sDLV_ysT87c-rSURbEI1TxWxQ4cWa1PE3pH1gdk03_nHqHDWQZzrVOr0ezURjAXjX65yJx9jsPFlSMgqtHLAUkMQN-Pz1Y_kOJ510smlFx3QhfbVx7ePB2vwdevnzWJZs_TEhi4M5VFjgZdYt69tIXzFhn_FMxEIZkamPkcLWAvX1HddodpXcxaGmW-k"
/>
<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
<div className="bg-white/95 px-8 py-5 rounded-xl shadow-lg text-center">
<h3 className="text-lg font-semibold text-gray-900">Operating in 50+ Countries</h3>
<p className="text-sm text-gray-500">Global Headquarters &amp; Local Experts</p>
</div>
</div>
</section>

{/* WhatsApp FAB */}
<Link
  className="fixed bottom-8 right-8 w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors z-40"
  href="https://wa.me/258878888181"
>
  <span>💬</span>
</Link>

  </Fragment>
  )
}
