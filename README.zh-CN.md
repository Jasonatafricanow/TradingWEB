# TradingWEB

[English](README.md) | [简体中文](README.zh-CN.md)

线上商城与运营后台，让网页订单、门店销售和 Shopify 导入共用一套订单与库存规则。

## 值得看的实现

- 金额按整数最小货币单位计算，分配库存时锁定相关行。
- 支付完成、扣库存、核销优惠券、写订单时间线在同一事务内完成。
- POS 重试和数据迁移都通过服务端契约写入。

详见[实现说明](docs/IMPLEMENTATION.md)、[源码与测试](src)及[变更记录](CHANGELOG.md)。鉴权和支付修复的历史放在变更记录中。

## 运行与验证

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm validate
pnpm test
pnpm test:e2e
```

数据库和支付配置请按仓库部署说明设置。本地模拟运行不能替代支付集成测试。非演示模式的密码重置需要明确设置 `NEXT_PUBLIC_SITE_URL`。

## 当前证据与待办

已有单元测试、后台列表浏览器测试和数据库迁移检查。完整的下单到支付端到端测试、带种子数据的公开演示和当前产品截图仍待交付。部署方式和实验性业务模块见[实现说明](docs/IMPLEMENTATION.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。
