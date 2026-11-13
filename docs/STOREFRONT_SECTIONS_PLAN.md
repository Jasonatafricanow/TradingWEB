# 前台模块化方案（区块 + 模板）

> 状态：方案，待确认。参考 Shopify Online Store 2.0 的「区块 / 模板 / 主题编辑器」思路，按本项目现状裁剪。
> 日期：2026-11-14

## 1. 现状

- 首页由 `src/app/page.tsx` 按主题二选一：`home-themes/shopify-home.tsx`（496 行）或 `tech-home.tsx`（356 行）。导航和页脚也各有两套（`navbar-themes/`、`footer-themes/`）。
- 主题由 `site_settings` 的 `site.theme` 决定，`?theme=` 只能临时预览。
- 每个首页内部其实已经分成若干段，只是写死在一个文件里：
  - shopify：主视觉、运费事实条、经营品类、商品目录、履约说明、咨询推广、联系条。
  - tech：主视觉、库存台账、按品类目录、配送区域表、联系条。
- 想要增删一段、调整顺序、换一张图或一句标题，都必须改代码再发版。

## 2. 目标

- **页面由区块拼装：** 商家在后台增删区块、拖动排序、修改区块设置，不用改代码。
- **先保证外观不变：** 第一步上线后，两套首页和现在看起来完全一样，只是换成了由数据驱动。
- **草稿与发布分开：** 改动先存为草稿，可以预览；发布后才对顾客生效，并且可以回滚到旧版本。
- **区块可设有效期：** 比如活动横幅到期自动下线。做法和这次会员折扣、佣金的有效期一致。
- **多语言沿用现有的 i18n：** 区块里的文字按语言分别填写，没填的语言回退到默认语言。

## 3. 核心概念

| 概念 | 是什么 | 存在哪里 |
|---|---|---|
| 区块类型（section type） | 一个 React 组件，加一份设置项结构（schema）和默认值。例如 `hero`、`product-grid`、`shipping-facts` | 代码，`src/storefront/sections/<type>/` |
| 区块实例 | 某个页面里的一个区块：类型、设置值、是否启用、有效期 | 数据库，页面模板的 JSON 里 |
| 页面模板（template） | 一个页面的区块顺序和每个区块的设置。例如 `home`、`product`、`collection` | 数据库 `storefront_templates`，分草稿、已发布、历史版本 |
| 主题预设（preset） | 一整套模板加配色、字体令牌。现有的 tech 和 shopify 两套变成两个预设 | 代码里的默认 JSON，可以一键导入为模板 |
| 区块组（section group） | 页头、页脚这种所有页面共用的区块 | 和页面模板放在同一张表，`kind = 'group'` |

## 4. 数据与代码结构

```
src/storefront/
  registry.ts                 # 区块类型注册表：type → { component, schema, defaults }
  render-template.tsx         # 读取模板 JSON，按顺序渲染区块；跳过停用或已过期的区块，以及未知类型
  schema.ts                   # 设置项类型：text / richtext / image / product-picker / collection-picker / select / number / color / i18n-text
  sections/
    hero/                     # index.tsx + schema.ts
    shipping-facts/
    category-tiles/
    product-grid/
    fulfilment-steps/
    advisory-offer/
    contact-strip/
    stock-ledger/
    zone-table/
  presets/
    shopify.json              # 现有 shopify 首页对应的模板
    tech.json                 # 现有 tech 首页对应的模板
```

数据库（新迁移 `0041_storefront_templates`，可重复执行）：

```
storefront_templates
  id, page_key ('home' | 'product' | 'collection' | 'header' | 'footer' …),
  status ('draft' | 'published' | 'archived'), version, data JSON,
  updated_by, created_at, published_at
  唯一索引 (page_key, status='published') 由服务层保证同一页面只有一个已发布版本
```

模板 JSON 示例：

```json
{
  "sections": [
    { "id": "s1", "type": "hero", "enabled": true,
      "starts_at": null, "ends_at": null,
      "settings": { "title": { "zh": "…", "en": "…" }, "image": "/images/home/port.jpg", "cta_href": "/products" } },
    { "id": "s2", "type": "product-grid", "enabled": true,
      "settings": { "source": "featured", "limit": 8 } }
  ]
}
```

- **读取路径：** 首页服务端读取已发布模板，做短时缓存，发布时清掉。读不到模板，或者模板 JSON 校验失败时，回退到代码里的预设 JSON，页面永远有内容。
- **校验：** 保存时按每个区块的 schema 用 zod 校验设置值。未知区块类型可以保存，但不渲染，后台会标出来。
- **权限：** 后台新增 `storefront` 版块，接进这次做的经理权限表，默认只有 admin 能用。保存、发布、回滚都写审计日志。

## 5. 分期

### 第一期：首页区块化，外观不变（约 3–4 天）
1. 建好区块注册表和 `render-template`。
2. 把两套首页按现有的段拆成区块组件，文案和图片改为从设置项读取。默认值等于现在的写死内容，所以外观不变。
3. 写 `presets/shopify.json` 和 `tech.json`。首页改为「已发布模板 → 不存在就用预设」。
4. 加 `0041` 迁移和模板读写服务。暂时没有编辑器，后台只有一个「导入预设 / 发布」按钮。
5. 验收：两个预设渲染出来的页面和现在逐屏截图对比一致；i18n 门禁新增为 0；单测覆盖模板校验、回退和有效期过滤。

### 第二期：后台主题编辑器（约 4–6 天）
1. `/admin/storefront`：左侧是区块列表（拖动排序、启用开关、有效期），右侧是 iframe 实时预览，预览读的是草稿。
2. 设置面板根据 schema 自动生成表单。图片选择直接用现有的媒体库，商品和分类用选择器。
3. 支持草稿保存、预览链接、发布、版本历史和一键回滚。
4. 验收：不改代码，就能完成新增横幅、调整顺序、设置活动有效期这几件事，并且发布后立即生效。

### 第三期：扩展到其他页面（按需）
1. 页头、页脚改成区块组。导航菜单可配置，两套导航和页脚合并成可配置的区块。
2. 商品详情页和分类页模板化：主信息区固定，下面的推荐、评价、FAQ 等做成可排序的区块。
3. 区块内的小组件（block）：例如主视觉里的多个按钮、FAQ 的多个条目，可以单独增删。
4. 主题令牌（配色、圆角、字体）在后台可调，写进 CSS 变量。

## 6. 风险与取舍

- **不做任意拖拽的自由布局：** 只支持纵向排列的区块，加上固定的设置项。这样能保持现在的设计质量，也便于做多语言和测试。
- **性能：** 模板只在服务端读一次并缓存，前台不额外请求。区块组件尽量用服务端组件，只有交互部分用客户端组件。
- **和演示模式的关系：** 演示模式直接使用预设 JSON，不需要数据库。
- **迁移风险低：** 第一期只新增一张表；没有模板时回退到预设，老站点不受影响。

## 7. 需要你确认的

1. 第一期是否两套首页都做，还是先只做现在线上用的那一套（`site.theme` 的当前值）。
2. 编辑器要不要给经理角色用。默认只给 admin，可以在角色权限页开放。
3. 第三期里，商品详情页和页头页脚哪个优先。
