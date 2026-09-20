# Changelog

> 2026-06-21 娌荤悊璇存槑锛?/14 涔嬪墠鐨勪腑鏂囨潯鐩師鏂囦欢鍥?GBK鈫扷TF-8 缂栫爜閿欎贡涓嶅彲璇汇€傚凡鏍规嵁 git commit message 閲嶅啓涓虹畝瑕佹憳瑕侊紱濡傞渶瀹屾暣缁嗚妭璇风敤 `git show <hash>` 鏌ョ湅 commit 姝ｆ枃銆?
---

## 2026-06-18 鈥?T-0: ValidationError, delivery_method migration, cart itemKey fix

| File | Type | Description |
|------|------|-------------|
| `src/lib/errors.ts` | Added | `ValidationError` class (鈫?HTTP 400) |
| `src/services/products/variant-service.ts` | Modified | Strict per-variant price validation, remove 0.00 fallback, use ValidationError |
| `src/services/orders/order-service.ts` | Modified | 5脳 ValidationError (delivery not selected, whitelist, variant conflict) |
| `src/services/auth/auth-middleware.ts` | Modified | `errorResponse` recognizes ValidationError 鈫?400 |
| `src/app/cart/page.tsx` | Modified | itemKey 涓夋鎷兼帴 (productId-variantId-deliveryId) |
| `drizzle/0007_delivery_method.sql` | Added | order_items.delivery_method snapshot + products.delivery_method VARCHAR(255) |
| `src/storage/database/shared/schema.ts` | Modified | delivery_method column definitions |
| `src/contexts/cart-context.tsx` | Modified | Cart context updates |
| Various admin/products | Modified | UI fixes + schema alignment |

## 2026-06-18 鈥?Payment validation, auth OAuth fix, format util

| File | Type | Description |
|------|------|-------------|
| `src/app/api/payment/callback/route.ts` | Modified | Fixed imports, Stripe support, payment validation |
| `src/app/api/payment/create/route.ts` | Modified | Payment creation fixes |
| `src/app/api/payment/webhook/route.ts` | Modified | Webhook handling |
| `src/services/payment/payment-service.ts` | Modified | Service updates |
| `src/services/payment/stripe-provider.ts` | Modified | Stripe provider fixes |
| `src/services/payment/paypal-provider.ts` | Modified | PayPal provider fixes |
| `src/services/payment/payment-validation.ts` | Added | Shared callback/webhook validation |
| `src/lib/format.ts` | Added | `formatMoney()` safe DB DECIMAL formatter |
| `src/components/auth/oauth-buttons.tsx` | Modified | Google Identity Services TypeScript declarations |
| `src/contexts/auth-context.tsx` | Modified | Auth context fixes |
| Various admin/orders/auth | Modified | Code quality and type fixes |

## 2026-06-17 — Glass UI visual redesign

| File | Type | Description |
|------|------|-------------|
| `src/app/globals.css` | Modified | Added glass/blob/grid/animation utilities (glass, blob, bg-grid-tech, shimmer, etc.) |
| `src/components/navbar.tsx` | Replaced | Glass design + status bar + shimmer buttons, kept i18n/auth/cart |
| `src/components/footer.tsx` | Replaced | Glass footer with blob backgrounds, kept i18n |
| `src/app/page.tsx` | Replaced | Glass hero with terminal card + partner marquee + stat strip, kept real API data |
| `package.json` | Modified | Added framer-motion dependency for hero animations |

## 2026-06-14 (Hotfix) 鈥?淇?Navbar 璐у竵/璇█涓嬫媺鏃犲搷搴?

- 鏍瑰洜锛歚lib/portal-utils.ts` 鎵嬪姩寤轰簡 `#radix-portal-container`锛堝甫 `position:relative; z-index:9999`锛夛紝鍏ㄧ珯 11 涓?Radix overlay 缁勪欢锛坉ropdown / popover / select / dialog / sheet / tooltip / drawer / context-menu / hover-card / menubar / alert-dialog锛夐兘 portal 杩涘畠銆傝繖瀹瑰櫒鍜?navbar 鐨?`sticky + backdrop-blur` 鍒涘缓鐨?stacking context 閰嶅悎涓嶅ソ锛宒ropdown 鍦?navbar 閲岀偣鍑绘棤鍝嶅簲/涓嶅彲瑙併€?- 淇細`getPortalContainer()` 鐩存帴杩斿洖 `null`锛岃 Radix 鐢ㄩ粯璁?body portal锛沗PortalContainerInit` 鏀逛负 no-op锛堜繚鐣欏鍑轰互鍏煎寮曠敤锛夈€俽emoveChild race 鐢?`client-providers.tsx` 閲岀幇鏈夌殑鍏ㄥ眬 ErrorEvent handler 鍏滃簳銆?- 椤烘墜鎶?`DropdownMenuContent` 鐨?`z-50` 鎻愬埌 `z-[100]`锛堜箣鍓嶄笌 navbar header 鍚岀骇 z-50锛夈€?- 閰嶅锛欵2E 娴嬭瘯 + PWA 鍥炬爣銆?
## 2026-06-14 (Pass 2) 鈥?UI 浼樺寲 Round 1 鍏ㄩ噺钀藉湴


### 澶氳瑷€淇ˉ
- `i18n-context.tsx` 鈥?zh / en / pt 涓夊紶琛ㄥ悇杩藉姞绾?70 涓?key锛歚home.*` / `checkout.*` / `nav.group.*` / `admin.customers_*` / `admin.affiliates_*` / `crumb.*`
- 棣栭〉 `page.tsx` 瀹屽叏閲嶅啓锛氭墍鏈夌‖缂栫爜鑻辨枃璧?`t()`锛屽垏璇█鐬棿鍝嶅簲
- `checkout/page.tsx` 鈥?Contact Info / Order Summary / Payment Method / Coupon / Subtotal / Discount / Pay / SSL note 鍏ㄩ儴璧?`t()`
- `admin-sidebar.tsx` 鈥?8 涓垎缁勬爣棰橈紙鏁版嵁鎬昏 / 鍟嗗搧绠＄悊 / 璁㈠崟绠＄悊 / 瀹㈡埛绠＄悊 / 钀ラ攢鎺ㄥ箍 / 浠撳偍鐗╂祦 / 鍐呭宸ュ叿 / 绯荤粺绠＄悊锛変粠纭紪鐮佷腑鏂囨敼涓?`t("nav.group.*")`锛涘獟浣撳簱涔熻蛋 `t("admin.media_lib")`
- `admin/customers/page.tsx` + `admin/affiliates/page.tsx` 鈥?鏍囬 / KPI / 瀵硅瘽妗嗘枃妗ｅ叏閮ㄧ粺涓€鍒?`t()`

### 棣栭〉閲嶅啓
- 鍒犻櫎 4 寮犲閮?`lh3.googleusercontent.com/aida-public/...` AI 鍗犱綅鍥撅紝鎹负鏈湴娓愬彉锛圤KLCH-ish radial-gradient锛? Phosphor 鍥炬爣
- Bento Grid 4 寮犲崱锛圕onsumer Electronics / Industrial Hardware / Consulting / Digital Goods锛夋敼涓虹湡瀹?`<Link>`锛屽垎鍒寚鍚?`/products?type=virtual` / `/consulting` / `/digital-goods`
- Featured Products 鏀逛负浠?`/api/products?limit=4` 鎷夌湡瀹炴暟鎹?+ skeleton loading锛屾敮鎸佸璇█瀛楁锛涘簳閮ㄥ姞 `View All Products` CTA
- 鍒犻櫎 hero 娴姩鐨勫亣"In Transit"鍗★紙Order #GT-88291-XL锛?- 椤堕儴"Marketplace Categories"鍥涗釜 chip 鍒犻櫎锛堜箣鍓嶆病缁戣烦杞級

### 鍏叡绔?Breadcrumb
- 鏂扮粍浠?`components/breadcrumb-public.tsx` 鈥?鑷姩鍦ㄦ渶鍓嶈ˉ"棣栭〉"锛屾渶鍚庝竴椤逛笉鍙偣
- 宸叉帴鍏ワ細`/products`銆乣/cart`銆乣/checkout`銆乣/orders`銆乣/account`

### 鍚庡彴 UI 涓€鑷存€?- `admin/orders/[id]/page.tsx`锛? 涓垎鏁ｅ湪 Status / Tracking / Notes 鍗￠噷鐨?Save 鎸夐挳 鈫?涓€涓?sticky 搴曢儴 "Save All Changes" 宸ュ叿鏍忥紱澶栧眰 `<div className="flex"><div className="flex-1 p-8">` hack 鍏ㄩ儴鏇挎崲涓虹粺涓€鐨?`<div className="p-6 lg:p-8">`
- `admin/customers/page.tsx` + `admin/affiliates/page.tsx` 鈥?鍚屼笂鐨勫鍣?hack 鏇挎崲锛汯PI 鍗?`grid-cols-3` 鈫?`grid-cols-1 sm:grid-cols-3`锛堝皬灞忎笉鎸わ級
- `admin/inventory/traffic/staff/recommendations` 鈥?鍚屾牱鎶?KPI 缃戞牸鏀逛负鍝嶅簲寮?- `admin/products/page.tsx` 寮圭獥 max-w 浠?`max-w-2xl` 鍔犲埌 `max-w-3xl`锛寁ariants 缂栬緫鍣ㄤ粠 12 鍒楁í鎺掗噸鍐欎负鍨傜洿 stack锛堟瘡涓鏍肩嫭绔嬪崱鐗囷細鏍囬 / SKU / 浠锋牸 / 搴撳瓨 + 3 涓?option 灞炴€э級

### 瑙嗚缁嗚妭
- `Navbar`锛氳揣甯佹寜閽樉绀哄綋鍓?code锛圲SD / EUR / CNY鈥︼級锛岃瑷€鎸夐挳鏄剧ず褰撳墠鍥芥棗 + 鐭爜锛堭焽焽?ZH锛夛紱澧炲姞 `aria-label`锛堣揣甯併€佽瑷€銆佽喘鐗╄溅銆佺敤鎴枫€佺Щ鍔ㄨ彍鍗曪級
- `Footer`锛氫箣鍓嶆閾剧殑 `Terms / Privacy`锛坄href="#"`锛夋敼涓烘寚鍚?鍟嗗搧 / 鍜ㄨ / 鏁板瓧鍟嗗搧"鐨勫疄鐢ㄥ鑸?- `products/page.tsx` ProductCard锛歚onMouseEnter/Leave` 淇敼 inline `boxShadow` 鍏ㄩ儴鍘绘帀锛屾敼涓?Tailwind `hover:shadow-lg`锛涙寜閽殑 box-shadow 涔熸敼鎴?Tailwind `shadow-md shadow-blue-500/30 hover:shadow-lg`
- `products/page.tsx`锛氱‖缂栫爜 "Marketplace" 涓婃柟灏忓瓧璧?`t("home.cat.title")`锛?Try adjusting your filters" 姝昏嫳鏂囧垹闄?
### 鏂扮粍浠?- `components/page-skeleton.tsx` 鈥?鍏敤 `<PageSkeleton variant="list|detail|form|grid" />`锛岀粺涓€鍏ㄧ珯 loading 鍗犱綅锛堝悗缁换浣曟柊椤甸潰鐩存帴鐢ㄥ畠锛岄伩鍏?4 绉嶈嚜鍒?skeleton 鍏卞瓨锛?
### 鎶ュ憡
- `UI_OPTIMIZATION_AUDIT.md` 鈥?璇︾粏鐨?UI 瀹℃煡鎶ュ憡锛?8 椤逛紭鍖栧缓璁紝鍒?P0/P1/P2锛?
## 2026-06-14 鈥?鍓嶇杩炴帴鎬?+ DB 鎺ュ彛杩炴帴鎬т笓椤瑰鏌?

### 鍓嶇 鈫?API 璺緞淇?- `affiliate/dashboard/page.tsx`锛歚/api/affiliates/dashboard-extra` 鈫?`/api/affiliates/dashboard/extra`锛堜箣鍓?404锛?- `admin/products/page.tsx`锛氬垹闄?/ 缂栬緫鍟嗗搧鏀圭敤 RESTful 璺緞 `/api/admin/products/{id}`锛屼笉鍐嶇敤 `?id=` query
- `admin/media/page.tsx`銆乣admin/products/export/page.tsx`锛氭妸閿欑殑 localStorage key `auth_token` 鏀逛负 `getStoredToken()`锛堜箣鍓嶅彂閫佺┖ Bearer token锛屽繀 401锛?
### DB 鎺ュ彛 / Schema 瀵归綈
- `POST /api/admin/products`锛氫粠璁よ瘉鐢ㄦ埛鑷姩娉ㄥ叆 `seller_id`锛坰chema 鏄?NOT NULL锛屼箣鍓嶅繀鎶ラ敊锛?- POST / PUT `/api/admin/products[/:id]`锛氳ˉ涓婂 `bulkSaveVariants` 鐨勮皟鐢紝variants 涓嶅啀琚涪寮?- `POST /api/admin/customers`锛氭柊澧烇紙涔嬪墠鍙湁 GET锛屽墠绔?鍒涘缓瀹㈡埛"鎸夐挳 405锛?- `POST /api/admin/affiliates`锛氭柊澧烇紙涔嬪墠鍙湁 GET锛屽墠绔?鎵嬪姩娣诲姞鎺ㄥ箍鑰?鎸夐挳 405锛?- `GET /api/admin/refunds/[id]`锛歚getRefund(id)` 涔嬪墠瀹炵幇鎴?`return listRefunds()`锛屽弬鏁拌蹇界暐锛涙敼涓烘寜 id 鏌ヨ鍗曟潯
- `services/admin/orders-service.ts`锛歚paymentStatus` 鍚屾椂鍐?`payment_status` 鍜?`financial_status`锛岀鐞嗗憳淇濆瓨鍚庨〉闈㈢粓浜庤兘鐪嬪埌鍙樺寲

### 鏂板鍔熻兘
- **`/api/admin/settings` GET / PUT**锛氱珯鐐?/ 鏀粯 / 瀹夊叏閰嶇疆鐪熸钀藉湴鍒?`site_settings` 琛紙涔嬪墠鍙啓 localStorage锛?- **checkout 浼樻儬鐮?*锛氱粨绠楅〉鍔犱紭鎯犵爜杈撳叆妗嗭紝璋?`/api/coupons/validate`锛涗笅鍗曟椂鎶?`couponCode` 浼犵粰鍚庣锛宍createOrder` 楠岃瘉骞跺啓鍏?`orders.coupon_id` / `discount_amount`锛屽悓姝ョ疮鍔?`coupons.used_count`
- **admin/products 鍟嗗搧鍥剧墖涓婁紶**锛氬脊绐楀姞鍥剧墖涓婁紶鍖猴紝璋?`/api/upload/image` 杩斿洖 url 鍥炲～ `image_key`
- **admin/products variants 缂栬緫鍣?*锛氬脊绐楀姞瑙勬牸琛岀紪杈戝櫒锛堟爣棰?/ SKU / 浠锋牸 / 搴撳瓨 + 3 涓?option 灞炴€э級锛屽瓧娈靛悕涓?backend 鍒楀榻愶紱缂栬緫鏃惰嚜鍔?GET 宸叉湁 variants
- **OAuth 鎸夐挳**锛歚auth/login` 鍜?`auth/register` 椤垫帴鍏?`GoogleLoginButton` + `AppleLoginButton`锛堢粍浠跺凡缁忓啓濂戒絾涔嬪墠娌′汉 import锛?- **Footer**锛歚/about` 鍔犻摼鎺ワ紱"鑱旂郴鎴戜滑"鏀逛负 mailto

### 鏂板杩佺Щ
- `drizzle/0005_affiliates_settings.sql`锛氳ˉ榻?`affiliates` + `referrals` + `site_settings` 涓夊紶缂哄け鐨勮〃锛堟帹骞裤€佹彁鐜般€佷剑閲戙€佺淮鎶ゆā寮忋€佺珯鐐硅缃兘渚濊禆杩欎笁寮犺〃锛?
### 娓呯悊
- `services/admin/membership-service.ts`锛氱敓浜х幆澧冮挶鍖呬綑棰濅粠 `null` 鏀逛负 `{ balance: 0 }`锛涘墠绔?`account/page.tsx` 鍙湪 `balance > 0` 鏃舵覆鏌撻挶鍖呭崱鐗?- `products/electronics`銆乣products/physical`銆乣products/pro-x-15`銆乣orders/pending` 杩?4 涓棤鍏ュ彛銆佹湁鍐椾綑鐨勯〉闈㈡浛鎹负 `redirect()`

### 瀹℃煡鎶ュ憡
- `FRONTEND_UI_CONNECTIVITY_AUDIT.md` 鈥?璺敱 / 閾炬帴 / fetch / 浜嬩欢缁戝畾杩炴帴鎬э紙宸插綊妗ｈ嚦 `_archive/`锛?- `DB_API_CONNECTIVITY_AUDIT.md` 鈥?MySQL 鍚庣鎺ュ彛閫愰」鏍￠獙锛堝凡褰掓。鑷?`_archive/`锛?- `CHANGELOG_BACKLOG.md` 鈥?澶囬€?/ 鏆傜紦椤癸紙蹇冩効鍗曘€佸純鍗曟仮澶嶃€佺敤鎴烽挶鍖呭畬鏁寸増銆佺淮鎶ゆā寮?UI銆佸鏈嶈亰澶?绛夛級

## 2026-06-15 鈥?璁捐绯荤粺钀藉湴 + Admin 鍏ㄩ噺閲嶆瀯 + 鍥炬爣杩佺Щ


### 璁捐绯荤粺锛圖ESIGN.md + OKLCH + 鏆楄壊妯″紡锛?- **DESIGN.md** 鈥?鍏ㄦ柊璁捐绯荤粺鏂囨。锛氬搧鐗屾敞鍐岋紙B2B trust-first锛夈€丱KLCH 鑹插僵绛栫暐锛堝崟鍝佺墝钃濓級銆佹帓鐗堜綋绯伙紙Geist Display + Hanken Grotesk Body + JetBrains Mono锛夈€侀棿璺?甯冨眬瑙勮寖銆佸姩鏁堟寚鍗椼€乀aste-Skill +  铻嶅悎鍙嶆ā寮忔竻鍗曪紙60+ 鏉′氦浠樺墠妫€鏌ヨ鍒欙級
- **globals.css 瀹屽叏閲嶅啓** 鈥?鎵€鏈変护鐗岃縼绉昏嚦 OKLCH锛涙柊澧?`@utility brand-gradient`锛堣摑鈫掗潧钃濅笉鍐嶏紝绾搧鐗岃摑锛夈€乣glass-card`銆乣table-modern`銆乣badge-status`銆乣card-hover`銆乣stat-icon-*`锛涙柊澧炲畬鏁?`.dark` 鏆楄壊妯″紡浠ょ墝闆?- **鎺掔増绯荤粺鍗囩骇** 鈥?`layout.tsx` 绉婚櫎 Inter锛圱aste-Skill 绂佺敤瀛椾綋锛夛紝娣诲姞 Geist 浣滀负 Display 瀛椾綋 + Hanken Grotesk 鎻愬崌涓洪粯璁?sans锛涚Щ闄?Google Material Symbols CDN `<link>`锛涙坊鍔?`suppressHydrationWarning`
- **瀹夎渚濊禆** 鈥?`@phosphor-icons/react`銆乣motion`锛團ramer Motion 缁т换鑰咃級

### Admin 鍩虹璁炬柦锛坙ayout + 鍏变韩缁勪欢搴擄級
- **`admin/layout.tsx`** 鈥?鍏ㄦ柊鍏变韩澶栧３锛歚BreadcrumbProvider` + `AdminSidebar` + 鍐呭鍖猴紙`max-w-7xl p-6 lg:p-8`锛夛紱绉诲姩绔?Sheet overlay 渚ц竟鏍?+ 椤堕儴瀵艰埅鏍?- **`admin/_components/`** 鈥?8 涓叡浜粍浠讹細`PageHeader` / `DataTable<T>`锛堝惈 pagination / loading / 绌烘€?/ 琛屾搷浣?/ 琛岀偣鍑诲鑸級/ `StatCard` / `StatCardGrid` / `FilterBar` / `EmptyState` / `ConfirmDialog` / `Breadcrumb` / `BreadcrumbProvider`
- 30 涓?admin 椤甸潰绉婚櫎鎵嬪姩 AdminSidebar 瀵煎叆 + 娓叉煋 + `flex h-screen` 鍖呰 + 鎵嬪姩 `<main>` 鍖呰锛涚粺涓€鏀圭敤 layout 鎻愪緵鐨勫澹?+ PageHeader

### 鍥炬爣杩佺Щ锛坙ucide 鈫?phosphor锛?- 楂橀椤甸潰 `products/page.tsx` / `orders/page.tsx` 宸茶縼绉伙紱鍏朵綑 30 椤典繚鐣?lucide锛堝姛鑳芥甯革紝鍙悗缁€愰〉杩侊級
- shadcn/ui 缁勪欢鑷甫鐨?lucide 鍥炬爣涓嶅姩

### 楠岃瘉
- ts-check 闆堕敊璇紱lint 鏃犳柊閿欒锛沗AdminSidebar` 鍙湪 `layout.tsx` 瀵煎叆锛?0 椤垫竻闆讹級锛涙棤 `flex h-screen` 娈嬬暀

## 2026-06-09 — 架构重塑：剔除外部依赖 + 统一数据层


- 鍒犻櫎鎵€鏈?Supabase 瀹㈡埛绔緷璧栥€丄uth helper銆丼erver Action 妗?- `lib/db.ts` 缁熶竴涓?Drizzle ORM锛坢ysql2 杩炴帴姹狅級浣滀负鍞竴鏁版嵁璁块棶鍏ュ彛
- 移除第三方平台遗留脚本与冗余配置
- 閰嶅 `drizzle/0001..0004` 杩佺Щ寤虹珛 MySQL 琛ㄧ粨鏋?


- Auth demo 妯″紡锛氭湭閰嶇疆 DB_HOST 鏃惰烦杩囩湡瀹炴暟鎹簱鏌ヨ锛屼娇鐢ㄥ唴瀛?mock锛屽墠绔紑鍙戜笉渚濊禆鍚庣
- 璁㈠崟鍏宠仈瀹㈡埛锛歰rder 璇︽儏鎸?`user_id` join `users` 鍙栭偖绠?濮撳悕
- 瀛椾綋缁熶竴 + CSS 閲嶆瀯



### 鏂板妯″潡
- 搴撳瓨绠＄悊锛堝叆搴?/ 鍑哄簱 / 璋冩暣 / 浣庡簱瀛橀璀︼級
- 鍛樺伐绠＄悊锛堣鑹叉潈闄?/ 娣诲姞 / 绂佺敤锛?- 浼樻儬鍒?/ 鎶樻墸鐮侊紙鐧惧垎姣?+ 鍥哄畾 / 鏍￠獙 / 缁撹处闆嗘垚锛?- 閫€娆?/ 鍞悗锛堢敤鎴风敵璇?/ 瀹℃壒 / 閫€璐у叆搴?/ 鑷姩鍔犲簱瀛橈級
- 閿€鍞鐞嗭紙鏀跺叆瓒嬪娍 / 鍟嗗搧鎺掕 / 鏃舵绛涢€?/ CSV 瀵煎嚭锛?- 娴侀噺鍒嗘瀽锛圥V / UV / 椤甸潰鎺掕 / 鏉ユ簮楗煎浘 / 鍩嬬偣锛?- 閭欢閫氱煡锛堜粯娆剧‘璁?/ 鍙戣揣閫氱煡 / Resend / 妯℃澘绠＄悊锛?- 寮冨崟鎸藉洖锛堣褰曗啋2h 鑷姩鍙?10% 鐮?鈥?鍚庤鍒椾负鏆傜紦椤癸紝瑙?BACKLOG锛?- 浼氬憳绛夌骇 / VIP锛? 绾у崌闄嶇骇 / 娑堣垂鍗囩骇 / 鎶樻墸锛?- 澶氫粨搴?+ 搴撳瓨璋冩嫧锛堜粨搴?CRUD / 璋冩嫧 / 鑷姩鎵ｅ噺锛?- 瀹㈡埛鍗＄墖锛堝鎴峰垪琛?/ 璇︽儏 / 璁㈠崟鍘嗗彶锛?- SEO / GEO锛堝姩鎬?sitemap / JSON-LD 缁撴瀯鍖栨暟鎹級
- 璇勮璇勫垎锛? 鏄?/ 瀹℃牳锛?
### 澶氳瑷€淇
- 鍟嗗搧鍗＄墖鏁村崱鍙偣鍑?`onClick` + 鎸夐挳 `stopPropagation`
- 銆岀珛鍗宠喘涔般€嶆敼涓哄姞鍏ヨ喘鐗╄溅 + `router.push("/cart")`
- 璁㈠崟璇︽儏椤电┖鐧戒慨澶嶏紙鏂板 GET handler + mock join 淇锛?- `t()` 鍏滃簳鏀逛负 `keyToLabel()`锛屼笉鍐嶆樉绀哄師濮?key 鍚?- i18n 閲嶅 key 娓呯悊锛坋n 8 涓?/ es 12 涓?/ pt 12 涓級
- mock 鍟嗗搧/鍒嗙被鏁版嵁琛ュ叏 `title_es` / `description_es` / `name_es`
- 鏃ヨ鏀寔绉婚櫎锛堢敤鎴疯姹傦級
- `requireUser` 鍦?mock 妯″紡璺宠繃 Bearer 妫€鏌?- `locale === "zh"` 纭紪鐮佹浛鎹负 `_loc()` 杈呭姪鍑芥暟

### 鍚庡彴绠＄悊椤甸潰 i18n 杩佺Щ
- 渚ц竟鏍?22 椤瑰鑸叏閮ㄦ敼涓?`t()`
- zh / en / pt 鍚勫鍔犵害 200 涓炕璇?key
- 16 涓鐞嗛〉闈㈡柊澧?`useI18n` 瀵煎叆 + 椤靛ご鏀圭敤 `t()`

### 閰嶇疆涓績
- 鏂板 `src/config/`锛歚site.ts` / `locale.ts` / `currency.ts` / `payment.ts` / `constants.ts`
- 澶氳瑷€鏍囩/鍥芥棗鑷姩浠?LOCALES 鏁扮粍鐢熸垚锛屾柊澧炶瑷€鍙渶鍔犱竴琛?
### 璁よ瘉瑕嗙洊瀹¤
- `payment/create` 鍔?requireUser锛沗abandoned-carts PUT` 鍔?requireUser
- 妯℃嫙妯″紡鏂板璁㈠崟 / 娴忚鏁版嵁 / 浼氬憳绛夌骇 / 閭欢妯℃澘
- mock join 閫昏緫閲嶅啓锛堜竴瀵瑰/澶氬涓€鍒嗙锛?
## 2026-05-24 鈥?v0.5.0 浠撳簱璋冩嫧 + 浜у搧澶?SKU + 鎵归噺瀵煎叆瀵煎嚭 + 濯掍綋搴?+ 鎴愭湰浠?
**淇敼浜猴細JW** 路 commit `8b45e72` (Merge `616a4e9` feat/schema-improve into master)

- 澶氫粨搴?+ 搴撳瓨璋冩嫧绯荤粺锛堝悎骞?#3 PR锛?- 浜у搧澶?SKU / 鍙樹綋锛坥ption1 / option2 / option3锛?- 鎵归噺瀵煎叆瀵煎嚭锛圕SV锛?- 濯掍綋搴?- 鎴愭湰浠峰瓧娈?- 淇锛氳鍗曟敮浠樼姸鎬佽惤搴撱€佽鍗曢噾棰濊绠椼€佹暟鎹簱缁熶竴銆乪nv 娓呯悊锛坄981afac`锛?
## 2026-05-21 鈥?v0.4.0 鏈湴璁よ瘉绯荤粺 + users 琛?+ 绠＄悊椤甸潰鍒涘缓鑳藉姏

**淇敼浜猴細JW** 路 commit `7e573ec` + `dcc15b9`

- 鑷缓 JWT 璁よ瘉锛坄lib/auth-local.ts`锛夛紝鍓旈櫎澶栭儴 Auth provider
- 鏂板 `users` 琛?+ `0003_create_users_table.sql` 杩佺Щ
- 绠＄悊椤甸潰锛氬憳宸ュ垱寤?/ 鍟嗗搧鍒涘缓 / 鍒嗙被鍒涘缓鑳藉姏
- 鏉冮檺绯荤粺鍏ㄩ噺钀藉湴 + 浠撳簱渚涘簲鍟嗚ˉ璐э紙`0d4e31b` 鍓嶇殑 v0.3.4 宸ヤ綔锛?
## 2026-05-21 鈥?v0.3.2 Bug 淇?+ UX 鍏ㄩ潰浼樺寲

**淇敼浜猴細JW** 路 commit `6d666a7`

- 澶氬 Bug 淇?- UX polish

## 2026-05-21 鈥?v0.3.1 鏉冮檺绯荤粺 + 鍟嗗搧鎵╁睍

**淇敼浜猴細JW** 路 commit `05db3d4`

- 鏉冮檺绯荤粺棣栫増锛坧ermissions + permission_groups锛?- 鍟嗗搧鎵╁睍瀛楁
- service 灞傞噸鏋?
## 2026-05-21 鈥?v0.3.0 鍟嗗搧缂栬緫浼樺寲 + 鍛樺伐绠＄悊澧炲己锛堟帹鏂級

> 鍘熸枃涔辩爜涓嶅彲鎭㈠锛実it 鍘嗗彶閲屾棤瀵瑰簲鍗曠嫭 commit锛涗及璁℃槸 v0.3.1 commit `05db3d4` 鐨勯澶囧伐浣溿€?
## 鏃╂湡 鈥?v0.2.x 鍙婁箣鍓?
> 鍘熸枃涔辩爜涓嶅彲鎭㈠銆?> 宸茬煡濂犲熀鎻愪氦锛歚a40ea2d init: tradingWEB full project - i18n, affiliate module, mock support`
