/**
 * 演示模式商品目录 —— 前后台共用的唯一数据源。
 * 仅在 IS_DEMO_MODE（未配置数据库且非 production）下使用。
 * 图片为本地 public/images/catalog 下的可商用素材（Unsplash 免费授权）。
 */

export interface DemoCategory {
  id: string;
  name: string;
  name_en: string;
  name_pt: string;
  name_ja: string | null;
  name_es: string | null;
  type: string;
  sort_order: number;
}

export interface DemoVariant {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  price: string;
  stock: number;
}

export interface DemoReview {
  id: string;
  product_id: string;
  user_id: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  is_approved: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface DemoProduct {
  id: string;
  title: string;
  title_en: string;
  title_pt: string;
  title_ja: string | null;
  title_es: string | null;
  description: string;
  description_en: string;
  description_pt: string;
  description_ja: string | null;
  description_es: string | null;
  price: string;
  compare_at_price: string | null;
  cost_price: string;
  category_id: string;
  category_name: string;
  type: "service" | "virtual" | "physical";
  status: string;
  duration: string | null;
  delivery_method: string;
  image_key: string;
  gallery: string[];
  vendor: string;
  collection: string;
  tags: string;
  barcode: string;
  stock: number;
  rating: number;
  review_count: number;
  sold_count: number;
  highlights: string[];
  highlights_en: string[];
  created_at: string;
  categories: DemoCategory;
}

const IMG = (name: string) => `/images/catalog/${name}.jpg`;

/** 相对「现在」的固定偏移，保证演示数据每次启动都新鲜且稳定 */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: "cat-1", name: "商业咨询", name_en: "Business Consulting", name_pt: "Consultoria Empresarial", name_ja: null, name_es: null, type: "service", sort_order: 1 },
  { id: "cat-2", name: "技术顾问", name_en: "Tech Advisory", name_pt: "Consultoria Técnica", name_ja: null, name_es: null, type: "service", sort_order: 2 },
  { id: "cat-3", name: "合规与税务", name_en: "Compliance & Tax", name_pt: "Conformidade e Impostos", name_ja: null, name_es: null, type: "service", sort_order: 3 },
  { id: "cat-4", name: "数字模板", name_en: "Digital Templates", name_pt: "Modelos Digitais", name_ja: null, name_es: null, type: "virtual", sort_order: 4 },
  { id: "cat-5", name: "在线课程", name_en: "Online Courses", name_pt: "Cursos Online", name_ja: null, name_es: null, type: "virtual", sort_order: 5 },
  { id: "cat-6", name: "软件许可", name_en: "Software Licenses", name_pt: "Licenças de Software", name_ja: null, name_es: null, type: "virtual", sort_order: 6 },
  { id: "cat-7", name: "消费电子", name_en: "Consumer Electronics", name_pt: "Eletrônicos", name_ja: null, name_es: null, type: "physical", sort_order: 7 },
  { id: "cat-8", name: "工业硬件", name_en: "Industrial Hardware", name_pt: "Hardware Industrial", name_ja: null, name_es: null, type: "physical", sort_order: 8 },
];

const cat = (id: string) => DEMO_CATEGORIES.find((c) => c.id === id)!;

type Seed = {
  id: string;
  title: string; title_en: string; title_pt: string;
  description: string; description_en: string; description_pt: string;
  price: string; compare_at_price?: string; cost?: string;
  category_id: string; type: DemoProduct["type"];
  duration?: string; delivery: string;
  img: string; gallery?: string[];
  vendor: string; collection: string; tags: string;
  stock?: number; rating: number; reviews: number; sold: number;
  highlights: string[]; highlights_en: string[];
  age: number;
};

const SEEDS: Seed[] = [
  // ── 咨询服务 ──
  {
    id: "prod-1", title: "跨境电商战略咨询", title_en: "Cross-Border E-Commerce Strategy", title_pt: "Estratégia de E-Commerce Transfronteiriço",
    description: "与资深跨境操盘手一对一拆解选品、定价、渠道与履约全链路，输出可执行的 90 天增长路线图。",
    description_en: "A one-on-one session with a senior cross-border operator covering sourcing, pricing, channels and fulfilment, ending in an executable 90-day growth roadmap.",
    description_pt: "Sessão individual com um especialista sênior cobrindo sourcing, preços, canais e logística, com um roteiro de crescimento de 90 dias.",
    price: "299.00", compare_at_price: "399.00", cost: "90.00", category_id: "cat-1", type: "service",
    duration: "60min", delivery: "online", img: "business-meeting-1", gallery: ["business-meeting-2", "financial-charts-1"],
    vendor: "GlobalTrade Advisory", collection: "Growth", tags: "strategy,consulting,growth",
    rating: 4.9, reviews: 38, sold: 214, age: 12,
    highlights: ["60 分钟一对一视频深度诊断", "会后 48 小时内交付书面路线图", "含选品与渠道优先级矩阵"],
    highlights_en: ["60-minute one-on-one video diagnosis", "Written roadmap delivered within 48 hours", "Includes sourcing and channel priority matrix"],
  },
  {
    id: "prod-2", title: "目标市场进入策略分析", title_en: "Market Entry Strategy Analysis", title_pt: "Análise de Estratégia de Entrada no Mercado",
    description: "针对单一目标国做需求规模、竞争格局、准入门槛与定价带的量化分析，给出进入或放弃的明确结论。",
    description_en: "Quantified analysis of demand size, competitive landscape, entry barriers and price bands for one target country, with a clear go / no-go conclusion.",
    description_pt: "Análise quantificada de demanda, concorrência, barreiras de entrada e faixas de preço para um país-alvo, com conclusão clara.",
    price: "499.00", cost: "160.00", category_id: "cat-1", type: "service",
    duration: "90min", delivery: "online", img: "financial-charts-2", gallery: ["business-meeting-3"],
    vendor: "GlobalTrade Advisory", collection: "Market Intel", tags: "market,research,entry",
    rating: 4.8, reviews: 26, sold: 132, age: 20,
    highlights: ["覆盖 1 个目标国的完整市场画像", "含 3 家直接竞品拆解", "交付 20 页分析报告"],
    highlights_en: ["Full market profile for one target country", "Teardown of three direct competitors", "20-page analysis report included"],
  },
  {
    id: "prod-3", title: "跨境供应链优化方案", title_en: "Supply Chain Optimization", title_pt: "Otimização da Cadeia de Suprimentos",
    description: "从工厂到海外仓的全链路成本建模，识别冗余环节并给出可落地的降本与时效改善方案。",
    description_en: "End-to-end cost modelling from factory to overseas warehouse, identifying redundancy and delivering actionable cost and lead-time improvements.",
    description_pt: "Modelagem de custos de ponta a ponta, da fábrica ao armazém no exterior, com melhorias acionáveis de custo e prazo.",
    price: "799.00", compare_at_price: "999.00", cost: "260.00", category_id: "cat-1", type: "service",
    duration: "120min", delivery: "online", img: "warehouse-logistics-1", gallery: ["cargo-ship-1", "warehouse-logistics-3"],
    vendor: "GlobalTrade Advisory", collection: "Operations", tags: "supply-chain,logistics,cost",
    rating: 4.9, reviews: 22, sold: 87, age: 31,
    highlights: ["全链路成本拆解与基准对比", "海外仓与直发方案权衡", "平均可识别 12%~18% 降本空间"],
    highlights_en: ["Full cost breakdown against benchmarks", "Overseas warehouse vs direct shipping trade-offs", "Typically identifies 12–18% cost reduction"],
  },
  {
    id: "prod-4", title: "数字化转型技术顾问", title_en: "Digital Transformation Advisory", title_pt: "Consultoria de Transformação Digital",
    description: "评估现有系统架构与数据流，规划 ERP / 订单 / 库存的一体化路径，避免重复投入与数据孤岛。",
    description_en: "Assess current architecture and data flows, then plan an integrated ERP / order / inventory path that avoids duplicate spend and data silos.",
    description_pt: "Avalie a arquitetura atual e planeje um caminho integrado de ERP / pedidos / estoque, evitando gastos duplicados.",
    price: "650.00", cost: "210.00", category_id: "cat-2", type: "service",
    duration: "90min", delivery: "online", img: "laptop-product-3", gallery: ["financial-charts-3"],
    vendor: "Northbridge Tech", collection: "Engineering", tags: "architecture,erp,integration",
    rating: 4.7, reviews: 19, sold: 64, age: 8,
    highlights: ["现有系统与数据流盘点", "分阶段实施路线与预算区间", "含供应商选型建议清单"],
    highlights_en: ["Inventory of current systems and data flows", "Phased roadmap with budget ranges", "Vendor selection shortlist included"],
  },
  {
    id: "prod-5", title: "跨境合规与税务申报辅导", title_en: "Cross-Border Compliance & Tax Filing", title_pt: "Conformidade e Declaração Fiscal",
    description: "梳理目标市场的 VAT / GST 注册门槛、申报周期与关税归类，规避罚款与清关延误。",
    description_en: "Map VAT / GST registration thresholds, filing cycles and tariff classification for your target markets to avoid penalties and customs delays.",
    description_pt: "Mapeie limites de registro de VAT / GST, ciclos de declaração e classificação tarifária para evitar multas e atrasos.",
    price: "420.00", cost: "140.00", category_id: "cat-3", type: "service",
    duration: "75min", delivery: "online", img: "business-meeting-4", gallery: ["financial-charts-4"],
    vendor: "Meridian Compliance", collection: "Compliance", tags: "vat,tax,customs",
    rating: 4.8, reviews: 31, sold: 156, age: 15,
    highlights: ["VAT / GST 注册门槛判定", "HS 编码与关税归类复核", "申报日历与责任清单"],
    highlights_en: ["VAT / GST registration threshold assessment", "HS code and tariff classification review", "Filing calendar with ownership list"],
  },
  {
    id: "prod-6", title: "海外品牌本地化诊断", title_en: "Overseas Brand Localization Audit", title_pt: "Auditoria de Localização de Marca",
    description: "从命名、视觉、文案到客服话术做本地化体检，指出会直接影响转化的文化错配点。",
    description_en: "A localization health check across naming, visuals, copy and support scripts, flagging cultural mismatches that directly hurt conversion.",
    description_pt: "Verificação de localização em naming, visual, texto e suporte, apontando incompatibilidades culturais que afetam a conversão.",
    price: "380.00", cost: "120.00", category_id: "cat-1", type: "service",
    duration: "60min", delivery: "online", img: "business-meeting-5", gallery: ["online-learning-2"],
    vendor: "GlobalTrade Advisory", collection: "Brand", tags: "brand,localization,copy",
    rating: 4.6, reviews: 14, sold: 58, age: 5,
    highlights: ["命名与视觉文化适配检查", "落地页文案逐条批注", "客服话术本地化模板"],
    highlights_en: ["Naming and visual cultural fit check", "Line-by-line landing page copy notes", "Localized support script templates"],
  },

  // ── 数字商品 ──
  {
    id: "prod-9", title: "商业计划书模板（跨境融资版）", title_en: "Business Plan Template — Trade Financing", title_pt: "Modelo de Plano de Negócios",
    description: "48 页结构化模板，含市场规模测算、单位经济模型与融资用途表，已适配跨境贸易叙事。",
    description_en: "A 48-page structured template with market sizing, unit economics and use-of-funds tables, tailored to cross-border trade narratives.",
    description_pt: "Modelo estruturado de 48 páginas com dimensionamento de mercado, unit economics e uso de recursos.",
    price: "29.00", compare_at_price: "59.00", cost: "4.00", category_id: "cat-4", type: "virtual",
    delivery: "download", img: "financial-charts-1", gallery: ["financial-charts-5"],
    vendor: "Ledger Studio", collection: "Templates", tags: "template,plan,financing",
    stock: 999, rating: 4.8, reviews: 96, sold: 1284, age: 45,
    highlights: ["48 页可编辑 DOCX + PPTX", "含单位经济与敏感性测算表", "终身免费更新"],
    highlights_en: ["48 editable pages in DOCX + PPTX", "Unit economics and sensitivity tables", "Free lifetime updates"],
  },
  {
    id: "prod-10", title: "三表财务模型 Excel 模板", title_en: "Three-Statement Financial Model", title_pt: "Modelo Financeiro de Três Demonstrações",
    description: "损益、现金流、资产负债表自动联动，内置跨境汇率与关税变量，支持 5 年滚动预测。",
    description_en: "Linked P&L, cash flow and balance sheet with built-in FX and tariff variables, supporting a five-year rolling forecast.",
    description_pt: "DRE, fluxo de caixa e balanço vinculados, com variáveis de câmbio e tarifas e previsão de cinco anos.",
    price: "49.00", cost: "7.00", category_id: "cat-4", type: "virtual",
    delivery: "download", img: "financial-charts-3", gallery: ["financial-charts-2"],
    vendor: "Ledger Studio", collection: "Templates", tags: "excel,model,finance",
    stock: 999, rating: 4.9, reviews: 145, sold: 2106, age: 60,
    highlights: ["三表自动联动、无循环引用", "汇率与关税敏感性开关", "含 12 个月现金流看板"],
    highlights_en: ["Auto-linked statements, no circular references", "FX and tariff sensitivity switches", "12-month cash flow dashboard"],
  },
  {
    id: "prod-11", title: "跨境物流成本测算表", title_en: "Cross-Border Logistics Cost Calculator", title_pt: "Calculadora de Custos Logísticos",
    description: "输入重量、体积、目的国与渠道，自动比选空运/海运/专线并算出到岸成本与毛利。",
    description_en: "Enter weight, volume, destination and channel to compare air / sea / line-haul and compute landed cost and margin automatically.",
    description_pt: "Informe peso, volume, destino e canal para comparar aéreo / marítimo e calcular custo e margem.",
    price: "19.00", cost: "3.00", category_id: "cat-4", type: "virtual",
    delivery: "download", img: "cargo-ship-2", gallery: ["warehouse-logistics-2"],
    vendor: "Ledger Studio", collection: "Operations", tags: "logistics,calculator,landed-cost",
    stock: 999, rating: 4.7, reviews: 63, sold: 742, age: 22,
    highlights: ["支持 8 种渠道并行比选", "自动计算体积重与到岸成本", "含毛利红线预警"],
    highlights_en: ["Compare eight channels side by side", "Automatic volumetric weight and landed cost", "Margin red-line alerts"],
  },
  {
    id: "prod-12", title: "跨境电商实战大师课", title_en: "Cross-Border E-Commerce Masterclass", title_pt: "Curso Prático de E-Commerce",
    description: "32 节视频课，从平台入驻、选品验证到广告投放与合规税务，配套可下载工作表。",
    description_en: "32 video lessons from platform onboarding and product validation to ad buying and tax compliance, with downloadable worksheets.",
    description_pt: "32 aulas em vídeo, de integração de plataforma e validação de produtos a anúncios e conformidade fiscal.",
    price: "199.00", compare_at_price: "349.00", cost: "25.00", category_id: "cat-5", type: "virtual",
    delivery: "email", img: "online-learning-3", gallery: ["online-learning-5", "online-learning-4"],
    vendor: "Trade Academy", collection: "Courses", tags: "course,video,operations",
    stock: 999, rating: 4.9, reviews: 208, sold: 3421, age: 90,
    highlights: ["32 节课 / 约 14 小时", "配套 9 份实操工作表", "结课颁发电子证书"],
    highlights_en: ["32 lessons / about 14 hours", "Nine practical worksheets included", "Digital certificate on completion"],
  },
  {
    id: "prod-13", title: "独立站转化率优化课程", title_en: "DTC Conversion Rate Optimization", title_pt: "Otimização de Conversão DTC",
    description: "以真实站点改版案例讲解落地页结构、信任要素与结账漏斗，附 A/B 测试计划模板。",
    description_en: "Real storefront redesign cases covering landing structure, trust signals and checkout funnels, with an A/B testing plan template.",
    description_pt: "Casos reais de redesign cobrindo estrutura de página, sinais de confiança e funil de checkout.",
    price: "149.00", cost: "18.00", category_id: "cat-5", type: "virtual",
    delivery: "email", img: "online-learning-5", gallery: ["laptop-product-4"],
    vendor: "Trade Academy", collection: "Courses", tags: "cro,dtc,ab-test",
    stock: 999, rating: 4.7, reviews: 74, sold: 968, age: 35,
    highlights: ["18 节课 / 约 7 小时", "6 个真实改版前后数据", "A/B 测试计划模板"],
    highlights_en: ["18 lessons / about 7 hours", "Six real before-and-after datasets", "A/B testing plan template"],
  },
  {
    id: "prod-14", title: "库存与补货管理系统许可", title_en: "Inventory & Replenishment License", title_pt: "Licença de Estoque e Reposição",
    description: "单站点年度许可，含多仓库存、安全库存预警与自动补货建议，支持 CSV 与 API 对接。",
    description_en: "Annual single-site license with multi-warehouse stock, safety-stock alerts and auto replenishment suggestions via CSV or API.",
    description_pt: "Licença anual para um site, com estoque multiarmazém, alertas e sugestões de reposição via CSV ou API.",
    price: "399.00", cost: "60.00", category_id: "cat-6", type: "virtual",
    delivery: "email", img: "warehouse-logistics-4", gallery: ["laptop-product-5"],
    vendor: "Northbridge Tech", collection: "Software", tags: "license,inventory,saas",
    stock: 999, rating: 4.6, reviews: 41, sold: 312, age: 18,
    highlights: ["单站点 12 个月许可", "多仓与安全库存预警", "CSV / REST API 双向同步"],
    highlights_en: ["12-month single-site license", "Multi-warehouse and safety-stock alerts", "Two-way CSV / REST API sync"],
  },

  // ── 实物：消费电子 ──
  {
    id: "prod-20", title: "ProBook 14 商务轻薄本", title_en: "ProBook 14 Business Ultrabook", title_pt: "ProBook 14 Ultrabook Empresarial",
    description: "14 英寸 2.8K 屏、32GB 内存与 1TB 固态，1.29kg 机身通过军规测试，适合跨境差旅办公。",
    description_en: "A 14-inch 2.8K display, 32GB RAM and 1TB SSD in a 1.29kg MIL-STD tested chassis, built for cross-border business travel.",
    description_pt: "Tela de 14 polegadas 2.8K, 32GB de RAM e SSD de 1TB em chassi de 1,29kg testado MIL-STD.",
    price: "1299.00", compare_at_price: "1499.00", cost: "880.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "laptop-product-1", gallery: ["laptop-product-2", "laptop-product-4", "laptop-product-5"],
    vendor: "ProBook", collection: "Computing", tags: "laptop,ultrabook,business",
    stock: 48, rating: 4.8, reviews: 156, sold: 642, age: 26,
    highlights: ["2.8K 120Hz 低功耗屏", "32GB LPDDR5 + 1TB NVMe", "75Wh 电池 / 100W PD 快充"],
    highlights_en: ["2.8K 120Hz low-power display", "32GB LPDDR5 + 1TB NVMe", "75Wh battery / 100W PD fast charge"],
  },
  {
    id: "prod-21", title: "SonicBuds Ultra 主动降噪耳机", title_en: "SonicBuds Ultra ANC Headphones", title_pt: "SonicBuds Ultra com ANC",
    description: "混合主动降噪深度 42dB，40 小时续航，支持多点连接与 LDAC 无损传输。",
    description_en: "Hybrid active noise cancellation up to 42dB, 40-hour battery, multipoint pairing and LDAC lossless transport.",
    description_pt: "Cancelamento ativo híbrido de até 42dB, bateria de 40 horas, multiponto e transporte LDAC.",
    price: "249.00", compare_at_price: "329.00", cost: "128.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "wireless-headphones-1", gallery: ["wireless-headphones-2", "wireless-headphones-3", "wireless-headphones-5"],
    vendor: "Sonic", collection: "Audio", tags: "headphones,anc,audio",
    stock: 126, rating: 4.7, reviews: 312, sold: 1876, age: 14,
    highlights: ["42dB 混合主动降噪", "40 小时续航 / 10 分钟快充 5 小时", "LDAC + 双设备多点连接"],
    highlights_en: ["42dB hybrid ANC", "40-hour battery / 10-min charge for 5 hours", "LDAC plus two-device multipoint"],
  },
  {
    id: "prod-22", title: "FJ Watch Active 智能运动手表", title_en: "FJ Watch Active Smartwatch", title_pt: "FJ Watch Active Smartwatch",
    description: "1.43 英寸 AMOLED 常亮屏，双频 GPS 与 100+ 运动模式，5ATM 防水，14 天典型续航。",
    description_en: "A 1.43-inch always-on AMOLED, dual-band GPS and 100+ sport modes, 5ATM water resistance and 14-day typical battery.",
    description_pt: "AMOLED sempre ativo de 1,43\", GPS de banda dupla, mais de 100 modos e bateria de 14 dias.",
    price: "199.00", cost: "96.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "smartwatch-1", gallery: ["smartwatch-2", "smartwatch-3", "smartwatch-4"],
    vendor: "FJ Wearables", collection: "Wearables", tags: "smartwatch,gps,fitness",
    stock: 210, rating: 4.6, reviews: 189, sold: 1124, age: 10,
    highlights: ["双频 GPS 轨迹更准", "血氧 / 心率 / 睡眠全天监测", "5ATM 防水，14 天续航"],
    highlights_en: ["Dual-band GPS for cleaner tracks", "All-day SpO2, heart rate and sleep", "5ATM water resistance, 14-day battery"],
  },
  {
    id: "prod-23", title: "Lumix X20 微单相机套机", title_en: "Lumix X20 Mirrorless Kit", title_pt: "Lumix X20 Kit Mirrorless",
    description: "2600 万像素背照式传感器，5 轴机身防抖，4K60 视频，含 18-55mm 变焦镜头。",
    description_en: "A 26MP back-illuminated sensor, five-axis in-body stabilization and 4K60 video, bundled with an 18-55mm zoom.",
    description_pt: "Sensor retroiluminado de 26MP, estabilização de cinco eixos e vídeo 4K60, com zoom 18-55mm.",
    price: "1099.00", compare_at_price: "1299.00", cost: "760.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "mirrorless-camera-1", gallery: ["mirrorless-camera-2", "mirrorless-camera-3"],
    vendor: "Lumix", collection: "Imaging", tags: "camera,mirrorless,4k",
    stock: 32, rating: 4.9, reviews: 87, sold: 268, age: 40,
    highlights: ["2600 万像素 BSI 传感器", "5 轴机身防抖，最高 6.5 档", "4K60 10bit 内录"],
    highlights_en: ["26MP BSI sensor", "Five-axis IBIS, up to 6.5 stops", "Internal 4K60 10-bit recording"],
  },
  {
    id: "prod-24", title: "Keychron K8 Pro 机械键盘", title_en: "Keychron K8 Pro Mechanical Keyboard", title_pt: "Keychron K8 Pro Mecânico",
    description: "87 键 TKL 布局，热插拔轴座与 QMK 固件，三模连接，铝合金边框与双层消音棉。",
    description_en: "An 87-key TKL layout with hot-swap sockets and QMK firmware, tri-mode connectivity, aluminium frame and dual damping foam.",
    description_pt: "Layout TKL de 87 teclas com soquetes hot-swap e firmware QMK, conectividade tri-mode e espuma dupla.",
    price: "129.00", cost: "62.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "mechanical-keyboard-1", gallery: ["mechanical-keyboard-2", "mechanical-keyboard-4"],
    vendor: "Keychron", collection: "Peripherals", tags: "keyboard,mechanical,qmk",
    stock: 164, rating: 4.8, reviews: 241, sold: 1543, age: 7,
    highlights: ["热插拔轴座，免焊换轴", "QMK / VIA 全键自定义", "蓝牙 / 2.4G / 有线三模"],
    highlights_en: ["Hot-swap sockets, solder-free switches", "Full QMK / VIA remapping", "Bluetooth, 2.4G and wired modes"],
  },
  {
    id: "prod-25", title: "EchoSphere 360 便携音箱", title_en: "EchoSphere 360 Portable Speaker", title_pt: "EchoSphere 360 Caixa Portátil",
    description: "360° 环绕声场，IP67 防尘防水，24 小时续航，支持双机立体声配对。",
    description_en: "A 360-degree soundstage, IP67 dust and water resistance, 24-hour battery and stereo pairing between two units.",
    description_pt: "Som 360°, resistência IP67, bateria de 24 horas e emparelhamento estéreo entre duas unidades.",
    price: "89.00", compare_at_price: "119.00", cost: "38.00", category_id: "cat-7", type: "physical",
    delivery: "shipping", img: "bluetooth-speaker-1", gallery: ["bluetooth-speaker-2", "bluetooth-speaker-3"],
    vendor: "Sonic", collection: "Audio", tags: "speaker,bluetooth,ip67",
    stock: 288, rating: 4.5, reviews: 176, sold: 2210, age: 4,
    highlights: ["360° 全向声场", "IP67 防尘防水", "24 小时续航 + 双机配对"],
    highlights_en: ["360-degree omnidirectional sound", "IP67 dust and water resistance", "24-hour battery plus stereo pairing"],
  },

  // ── 实物：工业硬件 ──
  {
    id: "prod-30", title: "六轴工业机械臂 RA-620", title_en: "RA-620 Six-Axis Industrial Robot Arm", title_pt: "Braço Robótico Industrial RA-620",
    description: "负载 6kg、臂展 920mm，重复定位精度 ±0.02mm，支持 EtherCAT 与标准 ROS2 接口。",
    description_en: "6kg payload and 920mm reach with ±0.02mm repeatability, supporting EtherCAT and standard ROS2 interfaces.",
    description_pt: "Carga de 6kg e alcance de 920mm com repetibilidade de ±0,02mm, com EtherCAT e ROS2.",
    price: "18900.00", cost: "13200.00", category_id: "cat-8", type: "physical",
    delivery: "shipping", img: "industrial-machinery-1", gallery: ["industrial-machinery-2", "industrial-machinery-4"],
    vendor: "Northbridge Robotics", collection: "Automation", tags: "robot,automation,ethercat",
    stock: 7, rating: 4.9, reviews: 12, sold: 34, age: 52,
    highlights: ["±0.02mm 重复定位精度", "EtherCAT / ROS2 双接口", "含现场调试与操作培训"],
    highlights_en: ["±0.02mm repeatability", "Dual EtherCAT and ROS2 interfaces", "On-site commissioning and training included"],
  },
  {
    id: "prod-31", title: "光纤激光切割机 LC-3015", title_en: "LC-3015 Fiber Laser Cutter", title_pt: "Cortadora a Laser LC-3015",
    description: "3000W 光纤激光源，3000×1500mm 工作台，碳钢切割厚度 20mm，含除尘与冷水机。",
    description_en: "A 3000W fiber source with a 3000×1500mm bed, cutting carbon steel up to 20mm, including dust extraction and chiller.",
    description_pt: "Fonte de fibra de 3000W com mesa de 3000×1500mm, corte de aço carbono até 20mm, com exaustor e chiller.",
    price: "42500.00", cost: "31000.00", category_id: "cat-8", type: "physical",
    delivery: "shipping", img: "industrial-machinery-3", gallery: ["industrial-machinery-5"],
    vendor: "Northbridge Robotics", collection: "Fabrication", tags: "laser,cutting,fabrication",
    stock: 3, rating: 4.8, reviews: 8, sold: 19, age: 66,
    highlights: ["3000W 光纤激光源", "碳钢 20mm / 不锈钢 10mm", "含除尘系统与工业冷水机"],
    highlights_en: ["3000W fiber laser source", "20mm carbon steel / 10mm stainless", "Dust extraction and industrial chiller included"],
  },
  {
    id: "prod-32", title: "工业级不锈钢阀门组件", title_en: "Industrial Stainless Valve Assembly", title_pt: "Conjunto de Válvulas Industriais",
    description: "316L 不锈钢阀体，DN50 法兰接口，耐压 40bar，适用于食品与化工管路。",
    description_en: "A 316L stainless body with DN50 flanges rated to 40bar, suitable for food and chemical process lines.",
    description_pt: "Corpo em aço 316L com flanges DN50 e pressão de 40bar, para linhas alimentícias e químicas.",
    price: "860.00", cost: "520.00", category_id: "cat-8", type: "physical",
    delivery: "shipping", img: "industrial-machinery-2", gallery: ["industrial-machinery-4"],
    vendor: "Meridian Industrial", collection: "Components", tags: "valve,stainless,process",
    stock: 64, rating: 4.7, reviews: 23, sold: 187, age: 29,
    highlights: ["316L 阀体，耐腐蚀", "DN50 法兰 / 40bar 耐压", "食品级密封件可选"],
    highlights_en: ["Corrosion-resistant 316L body", "DN50 flanges rated to 40bar", "Optional food-grade seals"],
  },
  {
    id: "prod-33", title: "自动化输送线模块 CV-800", title_en: "CV-800 Conveyor Line Module", title_pt: "Módulo de Esteira CV-800",
    description: "800mm 带宽模块化输送单元，变频调速 0.2~1.5m/s，可与既有产线拼接扩展。",
    description_en: "An 800mm modular conveyor unit with variable speed from 0.2 to 1.5m/s that splices into existing production lines.",
    description_pt: "Unidade modular de 800mm com velocidade variável de 0,2 a 1,5m/s, integrável a linhas existentes.",
    price: "6400.00", cost: "4300.00", category_id: "cat-8", type: "physical",
    delivery: "shipping", img: "warehouse-logistics-5", gallery: ["industrial-machinery-5", "warehouse-logistics-3"],
    vendor: "Meridian Industrial", collection: "Automation", tags: "conveyor,automation,module",
    stock: 11, rating: 4.6, reviews: 15, sold: 62, age: 37,
    highlights: ["模块化拼接，长度可扩展", "变频调速 0.2~1.5m/s", "含急停与光电传感套件"],
    highlights_en: ["Modular splicing for extendable length", "Variable speed 0.2–1.5m/s", "E-stop and photoelectric sensor kit included"],
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = SEEDS.map((s) => ({
  id: s.id,
  title: s.title,
  title_en: s.title_en,
  title_pt: s.title_pt,
  title_ja: null,
  title_es: null,
  description: s.description,
  description_en: s.description_en,
  description_pt: s.description_pt,
  description_ja: null,
  description_es: null,
  price: s.price,
  compare_at_price: s.compare_at_price ?? null,
  cost_price: s.cost ?? "0.00",
  category_id: s.category_id,
  category_name: cat(s.category_id).name,
  type: s.type,
  status: "active",
  duration: s.duration ?? null,
  delivery_method: s.delivery,
  image_key: IMG(s.img),
  gallery: (s.gallery ?? []).map(IMG),
  vendor: s.vendor,
  collection: s.collection,
  tags: s.tags,
  barcode: `20${s.id.replace(/\D/g, "").padStart(10, "0")}`,
  stock: s.stock ?? 999,
  rating: s.rating,
  review_count: s.reviews,
  sold_count: s.sold,
  highlights: s.highlights,
  highlights_en: s.highlights_en,
  created_at: daysAgo(s.age),
  categories: cat(s.category_id),
}));

/** 商品规格：实物按配置分档，服务/数字商品无规格 */
export const DEMO_VARIANTS: DemoVariant[] = [
  { id: "var-20-a", product_id: "prod-20", title: "32GB / 1TB 深空灰", sku: "PB14-32-1T-GR", price: "1299.00", stock: 26 },
  { id: "var-20-b", product_id: "prod-20", title: "32GB / 2TB 深空灰", sku: "PB14-32-2T-GR", price: "1499.00", stock: 14 },
  { id: "var-20-c", product_id: "prod-20", title: "64GB / 2TB 星光银", sku: "PB14-64-2T-SL", price: "1799.00", stock: 8 },
  { id: "var-21-a", product_id: "prod-21", title: "曜石黑", sku: "SB-ULTRA-BLK", price: "249.00", stock: 62 },
  { id: "var-21-b", product_id: "prod-21", title: "月光白", sku: "SB-ULTRA-WHT", price: "249.00", stock: 48 },
  { id: "var-21-c", product_id: "prod-21", title: "雾霭蓝", sku: "SB-ULTRA-BLU", price: "269.00", stock: 16 },
  { id: "var-22-a", product_id: "prod-22", title: "42mm 运动硅胶表带", sku: "FJW-ACT-42-SP", price: "199.00", stock: 120 },
  { id: "var-22-b", product_id: "prod-22", title: "46mm 编织尼龙表带", sku: "FJW-ACT-46-NY", price: "229.00", stock: 90 },
  { id: "var-24-a", product_id: "prod-24", title: "红轴 / 白光", sku: "KC-K8P-RED-W", price: "129.00", stock: 88 },
  { id: "var-24-b", product_id: "prod-24", title: "茶轴 / RGB", sku: "KC-K8P-BRN-RGB", price: "139.00", stock: 76 },
  { id: "var-23-a", product_id: "prod-23", title: "18-55mm 单镜套机", sku: "LMX-X20-K1", price: "1099.00", stock: 20 },
  { id: "var-23-b", product_id: "prod-23", title: "18-55 + 50mm 双镜套机", sku: "LMX-X20-K2", price: "1349.00", stock: 12 },
];

const REVIEW_AUTHORS = [
  "Chen Wei", "Marta Oliveira", "Daniel Krause", "Aiko Tanaka", "Luis Fernández",
  "Sarah Whitfield", "Rafael Costa", "Emma Lindqvist", "Tomás Ribeiro", "Nina Petrova",
];

const REVIEW_BODIES_ZH = [
  { title: "超出预期", content: "交付比约定时间还早，细节做得很扎实，团队直接照着执行了。" },
  { title: "物有所值", content: "对比了几家同类，这个价格拿到的深度是最高的，没有空话。" },
  { title: "会回购", content: "第二次购买了，质量稳定，客服响应也快，问题当天就解决。" },
  { title: "推荐给同行", content: "已经推荐给两个合作伙伴，落地性很强，不是那种泛泛而谈的东西。" },
  { title: "小建议", content: "整体很满意，如果能再多给一个本地化案例就更完美了。" },
  { title: "包装与物流", content: "包装很稳妥，跨境运输没有任何磕碰，清关也比预期顺利。" },
];

/** 为每个商品生成稳定的演示评价（数量按评论规模收敛到 3~6 条） */
export const DEMO_REVIEWS: DemoReview[] = DEMO_PRODUCTS.flatMap((p, pi) => {
  const count = Math.min(6, Math.max(3, Math.round(p.review_count / 30) + 3));
  return Array.from({ length: count }).map((_, i) => {
    const body = REVIEW_BODIES_ZH[(pi + i) % REVIEW_BODIES_ZH.length];
    const rating = i === count - 1 && p.rating < 4.8 ? 4 : 5;
    return {
      id: `rev-${p.id}-${i + 1}`,
      product_id: p.id,
      user_id: `demo-reviewer-${(pi + i) % 10}`,
      author: REVIEW_AUTHORS[(pi * 3 + i) % REVIEW_AUTHORS.length],
      rating,
      title: body.title,
      content: body.content,
      is_approved: true,
      is_verified: i % 3 !== 2,
      created_at: daysAgo(3 + i * 6 + (pi % 5)),
    };
  });
});

export function demoProductsByType(type?: string) {
  return type ? DEMO_PRODUCTS.filter((p) => p.type === type) : DEMO_PRODUCTS;
}

export function demoProduct(id: string) {
  return DEMO_PRODUCTS.find((p) => p.id === id) ?? null;
}

export function demoVariants(productId: string) {
  return DEMO_VARIANTS.filter((v) => v.product_id === productId);
}

export function demoReviews(productId: string) {
  return DEMO_REVIEWS.filter((r) => r.product_id === productId);
}

/** 同类目优先、再按销量补齐的推荐位 */
export function demoRecommendations(productId: string, limit = 4) {
  const source = demoProduct(productId);
  if (!source) return [];
  const sameCat = DEMO_PRODUCTS.filter((p) => p.id !== productId && p.category_id === source.category_id);
  const sameType = DEMO_PRODUCTS.filter(
    (p) => p.id !== productId && p.type === source.type && p.category_id !== source.category_id
  );
  const rest = DEMO_PRODUCTS.filter((p) => p.id !== productId && p.type !== source.type);
  return [...sameCat, ...sameType, ...rest]
    .sort((a, b) => b.sold_count - a.sold_count)
    .slice(0, limit);
}