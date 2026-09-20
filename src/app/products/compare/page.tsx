"use client"
import { Fragment } from "react"
import Link from "next/link"

export default function Page() {
  return (
  <Fragment>

{/* TopNavBar */}
<header className="fixed top-0 w-full bg-surface-container-lowest/80 backdrop-blur-md border-b border-border-subtle z-50 shadow-sm">
<nav className="flex items-center justify-between px-margin-desktop py-4 max-w-container-max mx-auto">
<div className="flex items-center gap-8">
<span className="text-headline-sm font-headline-sm font-bold text-primary">GlobalTrade</span>
<div className="hidden md:flex items-center gap-6">
<Link className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md cursor-pointer active:opacity-70" href="/products">roducts</Link>
<Link className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md cursor-pointer active:opacity-70" href="/consulting">onsulting</Link>
<Link className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md cursor-pointer active:opacity-70" href="/digital-goods">igital Goods</Link>
</div>
</div>
<div className="flex items-center gap-4">
<button className="hidden sm:block text-on-surface-variant hover:text-primary transition-all duration-300 font-body-md text-body-md px-4 py-2">Log In</button>
<button className="bg-primary text-on-primary px-6 py-2 rounded-lg font-bold hover:bg-on-primary-fixed-variant transition-all duration-300 shadow-sm active:scale-95">Get Started</button>
</div>
</nav>
</header>
<main className="pt-32 pb-20">
{/* Hero Section */}
<section className="max-w-container-max mx-auto px-margin-desktop mb-16">
<div className="flex flex-col gap-4 max-w-3xl">
<span className="font-label-caps text-label-caps text-primary uppercase tracking-widest">Comparison Engine</span>
<h1 className="font-display-lg text-display-lg text-on-surface">Find the perfect tool for your digital workflow.</h1>
<p className="font-body-lg text-body-lg text-on-surface-variant">Analyze technical specifications across our flagship ecosystem. Precision-engineered hardware, compared side-by-side for total transparency.</p>
</div>
</section>
{/* Comparison Table */}
<section className="max-w-container-max mx-auto px-margin-desktop">
<div className="bg-surface-container-lowest rounded-xl border border-border-subtle shadow-sm overflow-hidden">
{/* Sticky Product Headers */}
<div className="comparison-grid border-b border-border-subtle glass-header sticky top-[73px] z-40 bg-surface-container-lowest/95">
<div className="p-6 flex items-end">
<span className="font-label-caps text-label-caps text-outline uppercase">Specifications</span>
</div>
{/* Product 1 */}
<div className="p-6 flex flex-col items-center text-center gap-4 border-l border-border-subtle">
<div className="w-32 h-32 rounded-lg bg-surface-container-low overflow-hidden group">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" data-alt="A premium high-end smartphone with a sleek metallic titanium finish and a large edge-to-edge vibrant glass display. The phone is positioned on a minimalist marble surface with soft, cinematic lighting creating elegant reflections. The overall aesthetic is professional, modern, and high-tech with a clean blue-tinted light mode atmosphere." src="https://lh3.googleusercontent.com/aida-public/AB6AXuB9YUeTUE_mVQN3oDNONYiANwvzyvKvbIoFC6WHr5OhFLlmtmi9CqCM9hk5qEi2HpANfSJ_8z_eIxKsponuBgUDdHWNu194Z2LuEfYRVCKXM5DNEMn1ZVv5pSRml1hFJwHY_QnHD_9rIqrScRREitRBb_8n0ME1Un1Co1lIdL1wxWqx5z66_9W8YBgqAeaQ4DPrEcyEi48ZQnSqEkPpeM0QE43hRdXeAcHtUuOlLW6DP3_JjQfEc_rINvGYFNqP0OflFscQ_kLnkwo"/>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">Pro-X 15</h3>
</div>
{/* Product 2 */}
<div className="p-6 flex flex-col items-center text-center gap-4 border-l border-border-subtle">
<div className="w-32 h-32 rounded-lg bg-surface-container-low overflow-hidden group">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" data-alt="Modern wireless noise-canceling headphones with a matte charcoal finish and plush leather ear cups. The headphones are shown in a high-key studio setting with bright, diffuse lighting and a clean white background. The style is minimalist and corporate, emphasizing premium build quality and sophisticated technology." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOSkhy6lyBXDlxvn4_dc8oBpiWmFES5xIOqP0eGnLOH2OM1sVqa0c8vO9iffzgs1DAZW6CStwnfGUoCIKBsrWC8mk4sMWkWpZ3jnjsKXl6aGGcvrf_HDyb7jsyYn0HhFk-7LVMdXAGkI5ItP3NKQGFdaIFuY_bLx8HQI87Q0PUIOYF5CJdYvjNE2s-4hV4ABSn9BqAyN3E0VQBG6fPuYGZwv7eZEy94U7uL79JbW_IbIn3rSLVW6pBikTlJcvYMKWZPmU2j_khNVo"/>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">SonicBuds Ultra</h3>
</div>
{/* Product 3 */}
<div className="p-6 flex flex-col items-center text-center gap-4 border-l border-border-subtle">
<div className="w-32 h-32 rounded-lg bg-surface-container-low overflow-hidden group">
<img className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" data-alt="A sleek smart watch with a vibrant OLED circular screen and a high-performance silicone band. The watch is presented on a clean tech-inspired background with soft ambient blue lighting that highlights its slim profile and modern design. The image conveys precision engineering and active lifestyle connectivity in a premium corporate style." src="https://lh3.googleusercontent.com/aida-public/AB6AXuC0DnHmqiVKu7lWxCe9eEWFUdyACJUbsVRnFNOq3IxAkHdYwHzjfwEF1MNcM2DQRgJi8rMP9ebc3Jox30Pl5MkvWWROisGCe005LmXef6hDgW0R2Tu9khQo8B7KshpR_Q9eaV2lq-pjsAgInJpUkEz6uxPvWllsXTuHOZqq0g7y6jDjfcX1gUlsy2RK6EW5_bT3g-Rqg_dTYo01JOsh-KNEMguB2xsuoky0Mp9CyeFwGMa9k9yvgXwuCEzqzgObCKEiLg9uVCYxoGc"/>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">FJ Watch Active</h3>
</div>
</div>
{/* Price Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">payments</span>
<span className="font-body-md font-bold">Price</span>
</div>
<div className="p-6 text-center border-l border-border-subtle font-headline-sm text-primary">$1,199.00</div>
<div className="p-6 text-center border-l border-border-subtle font-headline-sm text-primary">$349.00</div>
<div className="p-6 text-center border-l border-border-subtle font-headline-sm text-primary">$499.00</div>
</div>
{/* Display/Audio Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">visibility</span>
<span className="font-body-md font-bold">Display / Audio</span>
</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">6.7" Super Retina XDR, ProMotion 120Hz</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">Spatial Audio with Dynamic Head Tracking</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">1.5" LTPO OLED, Always-On Display, 2000 nits</div>
</div>
{/* Processor Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">memory</span>
<span className="font-body-md font-bold">Processor</span>
</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">A17 Pro Bionic (3nm architecture)</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">H2 Adaptive Silicon for Neural Audio</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">S9 SiP with 4-core Neural Engine</div>
</div>
{/* Battery Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">battery_charging_full</span>
<span className="font-body-md font-bold">Battery Life</span>
</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">29h Video Playback / Fast Charging</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">40h Listening Time with ANC</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">36h Normal Use / 72h Low Power Mode</div>
</div>
{/* Connectivity Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">signal_cellular_alt</span>
<span className="font-body-md font-bold">Connectivity</span>
</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">5G Ultra Wideband, Wi-Fi 6E, USB-C 3.0</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">Bluetooth 5.3, Ultra Wideband chip</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant">L1/L5 Dual-band GPS, Cellular + Wi-Fi</div>
</div>
{/* Key Features Row */}
<div className="comparison-grid border-b border-border-subtle group hover:bg-surface-container-low transition-colors duration-200">
<div className="p-6 flex items-center gap-3">
<span className="material-symbols-outlined text-primary">auto_awesome</span>
<span className="font-body-md font-bold">Key Features</span>
</div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant text-body-sm px-4">
                        48MP Pro Main Camera, Titanium Frame, Action Button customization.
                    </div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant text-body-sm px-4">
                        Active Noise Cancellation 2.0, Transparency Mode, IPX4 Water Resistance.
                    </div>
<div className="p-6 text-center border-l border-border-subtle text-on-surface-variant text-body-sm px-4">
                        ECG App, Blood Oxygen monitoring, Crash Detection, Titanium Case.
                    </div>
</div>
{/* Actions Row */}
<div className="comparison-grid bg-surface-container-low/50">
<div className="p-6"></div>
<div className="p-8 border-l border-border-subtle flex justify-center">
<button className="w-full max-w-[200px] bg-primary text-on-primary px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-on-primary-fixed-variant transition-all duration-300 shadow-sm active:scale-95 group" >
<span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                            Add to Cart
                        </button>
</div>
<div className="p-8 border-l border-border-subtle flex justify-center">
<button className="w-full max-w-[200px] bg-primary text-on-primary px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-on-primary-fixed-variant transition-all duration-300 shadow-sm active:scale-95 group" >
<span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                            Add to Cart
                        </button>
</div>
<div className="p-8 border-l border-border-subtle flex justify-center">
<button className="w-full max-w-[200px] bg-primary text-on-primary px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-on-primary-fixed-variant transition-all duration-300 shadow-sm active:scale-95 group" >
<span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                            Add to Cart
                        </button>
</div>
</div>
</div>
</section>
{/* Newsletter / Support */}
<section className="max-w-container-max mx-auto px-margin-desktop mt-24">
<div className="bg-primary rounded-xl p-12 text-on-primary flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
{/* Abstract Background Pattern */}
<div className="absolute inset-0 opacity-10 pointer-events-none">
<div className="absolute top-0 right-0 w-96 h-96 bg-on-primary rounded-full blur-[100px] -mr-48 -mt-48"></div>
<div className="absolute bottom-0 left-0 w-64 h-64 bg-on-primary rounded-full blur-[80px] -ml-32 -mb-32"></div>
</div>
<div className="relative z-10">
<h2 className="font-headline-md text-headline-md mb-2">Still undecided?</h2>
<p className="opacity-90 max-w-md">Our global consulting team can help you build the perfect hardware stack for your enterprise needs.</p>
</div>
<div className="relative z-10 flex gap-4">
<button className="bg-on-primary text-primary px-8 py-3 rounded-lg font-bold hover:bg-primary-fixed transition-all active:scale-95">Speak to an Expert</button>
<button className="border border-on-primary text-on-primary px-8 py-3 rounded-lg font-bold hover:bg-on-primary/10 transition-all active:scale-95">Download PDF Specs</button>
</div>
</div>
</section>
</main>
{/* Footer */}
<footer className="w-full py-12 bg-surface-muted border-t border-border-subtle">
<div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-container-max mx-auto gap-8">
<div className="flex flex-col gap-4">
<span className="font-headline-sm text-headline-sm font-bold text-on-surface">GlobalTrade</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">© 2024 GlobalTrade Enterprise. All rights reserved.</p>
</div>
<div className="flex gap-8">
<Link className="text-on-surface-variant hover:text-primary underline transition-all duration-300 font-body-sm text-body-sm" href="#">Privacy Policy</Link>
<Link className="text-on-surface-variant hover:text-primary underline transition-all duration-300 font-body-sm text-body-sm" href="#">Terms of Service</Link>
<Link className="text-on-surface-variant hover:text-primary underline transition-all duration-300 font-body-sm text-body-sm" href="#">Compliance</Link>
<Link className="text-on-surface-variant hover:text-primary underline transition-all duration-300 font-body-sm text-body-sm" href="#">Global Support</Link>
</div>
</div>
</footer>
{/* Simple Interaction Toast */}
<div className="fixed bottom-8 right-8 bg-inverse-surface text-inverse-on-surface px-6 py-4 rounded-xl shadow-xl transform translate-y-24 transition-transform duration-300 z-[100] flex items-center gap-3" id="toast">
<span className="material-symbols-outlined text-primary-fixed">check_circle</span>
<span id="toast-message">Added to cart!</span>
</div>


  </Fragment>
  )
}