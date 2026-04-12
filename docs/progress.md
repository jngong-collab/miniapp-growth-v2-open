# 小儿推拿门店拓客小程序 - 进展文档

## 2026-03-16 ~ 03-17 规划阶段完成 ✅

### 核心决策
- **定位**：拓客系统，不是商城系统
- **裂变机制**：购买返现（¥19.9 购买，邀请好友购买返 ¥15.9，多劳多得）
- **功能极简**：AI 看舌象 + 裂变返现 + 轻量商城 + 套餐核销
- **技术栈**：微信小程序原生 + 微信云开发（云函数 + 云数据库 + 云存储）
- **支付方式**：直接使用微信支付 API（不用交易组件），门店配置自己的商户号
- **AI 舌象**：门店在后台自行配置 API（地址/密钥/模型/提示词）
- **产品数据**：先用御小主示例数据，上线时可一键清除

### 产出文件
| 文件 | 说明 |
|---|---|
| `plan.md` | 完整产品规划（功能设计 + 技术架构 + 开发优先级） |
| `docs/progress.md` | 本文件，进展记录 |
| `docs/代理商方案.md` | 面向门店的产品介绍文档 |

---

## 2026-03-17 Step 1 项目初始化与数据库设计 ✅

### 完成内容

**项目基座**：
- `app.json` — 8 页面路由 + 4 个 Tab 栏配置
- `app.js` — 云开发初始化、自动登录、分享来源追踪、新用户自动注册
- `app.wxss` — 完整设计系统（CSS 变量、按钮、标签、价格组件、列表、工具类）
- `project.config.json` + `sitemap.json`

**8 个页面骨架**（每个含 .wxml/.wxss/.js/.json 四件套）：
- `pages/index/` — 首页
- `pages/tongue/` — AI 看舌象
- `pages/tongue-report/` — 舌象报告
- `pages/mall/` — 商城
- `pages/product-detail/` — 商品详情
- `pages/fission/` — 裂变返现
- `pages/package-usage/` — 套餐核销
- `pages/profile/` — 个人中心

**6 个云函数**（每个含 index.js + package.json）：
- `tongueAnalysis` — AI 舌象分析（analyze/getReport/getHistory）
- `commerceApi` — 商品详情、订单创建、支付发起、订单查询、退款申请
- `growthApi` — 舌象、抽奖、裂变和券/套餐增长链路查询
- `opsApi` — 门店工作台与内部权限、订单核销、员工管理、客户跟进
- `contentApi` — 首页与商城内容配置
- `payApi` — 微信支付（统一下单、回调、退款）

**数据库设计**：
- `docs/database_schema.md` — 11 个 Collection 完整字段定义 + 索引建议

### 下一步
- [ ] Step 2：首页 UI 开发 + 门店信息展示
