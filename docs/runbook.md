# 小儿推拿门店增长小程序 2.0 运行手册

> 更新日期：2026-04-16
> 目标：给当前仓库补一版基于真实代码结构的部署、联调、验收和上线前检查手册。

## 1. 适用范围

本手册覆盖以下交付物：

- 微信小程序：`miniapp/`
- 小程序云函数：`miniapp/cloudfunctions/`
- 网页管理后台：`admin-web/`

当前仓库的核心运行形态是：

- 一个微信小程序承载 C 端页面和门店工作台
- 一组 CloudBase 云函数承载内容、增长、交易、工作台和后台能力
- 一个独立 `admin-web` 前端承载网页管理后台

## 2. 当前系统组成

### 小程序页面

- C 端：`index`、`tongue`、`tongue-report`、`mall`、`product-detail`、`cart`、`orders`、`fission`、`lottery`、`package-usage`、`profile`
- 工作台：`workbench/dashboard`、`workbench/orders`、`workbench/verify`、`workbench/campaigns`、`workbench/catalog`、`workbench/leads`、`workbench/staff`、`workbench/settings`

### 云函数

- `contentApi`
- `growthApi`
- `commerceApi`
- `opsApi`
- `payApi`
- `adminApi`
- `tmpDbFix`：仅受控运维场景使用，默认应关闭

### 网页后台

- `admin-web/src/pages/login-page.tsx`
- `admin-web/src/pages/dashboard-page.tsx`
- `admin-web/src/pages/orders-page.tsx`
- `admin-web/src/pages/verification-page.tsx`
- `admin-web/src/pages/catalog-page.tsx`
- `admin-web/src/pages/campaigns-page.tsx`
- `admin-web/src/pages/leads-page.tsx`
- `admin-web/src/pages/staff-page.tsx`
- `admin-web/src/pages/settings-page.tsx`
- `admin-web/src/pages/finance-page.tsx`
- `admin-web/src/pages/customers-page.tsx`
- `admin-web/src/pages/ops-page.tsx`

## 3. 环境准备

### 小程序与 CloudBase

确认以下配置与目标门店环境一致：

- `miniapp/config.js`
  - `cloudEnv`
- `miniapp/project.config.json`
  - `appid`
- `cloudbaserc.json`
  - `envId`
  - `appid`
  - `miniprogramRoot`
  - `cloudfunctionRoot`

注意：

- 当前 `cloudbaserc.json` 只列出了 `adminApi`，不能直接代表所有业务云函数都已纳入统一部署配置。
- 上线前需要明确其余云函数采用微信开发者工具手工上传，还是 CloudBase CLI/CI 流程统一管理。

### 网页后台

在 `admin-web` 目录准备 `.env.local`：

```env
VITE_CLOUDBASE_ENV=your-env-id
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_PUBLISHABLE_KEY=your-publishable-key
```

### 微信支付生产配置

生产环境中，支付敏感信息必须和普通业务配置分层管理：

- `pay_config` 集合：
  - `storeId`
  - `mchId`
  - `notifyUrl`
  - `enabled`
- `payApi` 云函数环境变量：
  - `API_V3_KEY`
  - `CERT_SERIAL_NO`
  - `PRIVATE_KEY`
  - `PAY_CALLBACK_SECRET`

核心要求：

- `MCH_ID` 可按门店写入 `pay_config.mchId`，便于后台读取与门店隔离。
- `API_V3_KEY`、`CERT_SERIAL_NO`、`PRIVATE_KEY` 不得写入仓库、前端环境变量或普通集合文档。
- `PRIVATE_KEY` / `apiclient_key.pem` 是退款和分账签名的关键材料，必须只存在于服务端受控环境。

支付架构告警：

- 多门店独立收款不要走单商户二清代收模式。
- 若门店主体独立，应优先采用微信支付服务商模式。
- 若是直营体系统一主体，应评估并启用官方分账接口，而不是在仓库外做非官方二清。

## 4. 数据与初始化准备

### 基础集合

至少核对并准备这些业务集合：

- `stores`
- `users`
- `products`
- `packages`
- `orders`
- `order_items`
- `package_usage`
- `pay_config`
- `ai_config`
- `notification_settings`
- `fission_campaigns`
- `fission_records`
- `tongue_reports`
- `refund_requests`
- `customer_followups`
- `admin_accounts`
- `admin_role_templates`
- `admin_login_events`
- `admin_audit_logs`

字段与状态词汇以 `docs/database_schema.md` 和当前云函数实现为准。

### 首个后台管理员

当前后台不能完全通过 UI 自举首个管理员，仍需准备：

1. CloudBase Web Auth 用户
2. 对应 `uid`
3. `admin_accounts` 记录
4. 真实 `storeId`
5. `active` 状态
6. 合法点分权限键

### 角色模板

如需在 `/staff` 页面套用模板，需预先准备：

- 系统模板：`isSystem=true`
- 或当前门店模板：带 `storeId`

## 5. 云函数部署

### 必须部署的函数

- `miniapp/cloudfunctions/contentApi`
- `miniapp/cloudfunctions/growthApi`
- `miniapp/cloudfunctions/commerceApi`
- `miniapp/cloudfunctions/opsApi`
- `miniapp/cloudfunctions/payApi`
- `miniapp/cloudfunctions/adminApi`

### 建议部署顺序

1. `contentApi`
2. `growthApi`
3. `commerceApi`
4. `opsApi`
5. `payApi`
6. `adminApi`

### 部署检查点

- 运行时版本与依赖安装正常
- 环境变量齐全
- `payApi` 已注入真实商户凭证：`API_V3_KEY`、`CERT_SERIAL_NO`、`PRIVATE_KEY`
- 支付回调密钥显式配置，禁止依赖默认值
- `tmpDbFix` 在生产环境保持禁用，除非受控运维场景临时开启

## 6. 小程序本地调试与真机验证

### 导入与启动

1. 用微信开发者工具打开 `miniapp/`
2. 检查 `appid`、云开发环境、NPM 构建、合法域名与权限配置
3. 确认 `app.js` 登录、邀请绑定、工作台入口逻辑可正常执行

### 首轮真机验收

按以下顺序验收：

1. 首页加载
2. 用户登录与自动建档
3. AI 舌象拍照与报告读取
4. 商城列表与商品详情
5. 购物车加购、下单、支付发起
6. 订单列表查询
7. 退款申请
8. 裂变分享进入与返现记录
9. 抽奖活动
10. 套餐购买后核销码与剩余次数展示
11. 工作台登录、权限判断、核销、订单查询、线索、员工、设置

### 高风险点

- 分享链路与邀请归因
- 支付回调鉴权
- 退款中间态与状态回写
- 多门店数据隔离
- 工作台冷启动时的角色与权限判定

## 7. 网页后台部署

### 本地构建

在 `admin-web/` 下执行：

```bash
npm install
npm run build
```

### 发布要求

- 将 `dist/` 发布到 CloudBase Hosting
- 配置 SPA 路由回退到 `index.html`

### 必须覆盖的后台路由

- `/dashboard`
- `/orders`
- `/verification`
- `/catalog`
- `/campaigns`
- `/leads`
- `/staff`
- `/settings`
- `/finance`
- `/customers`
- `/ops`

## 8. 网页后台验收

登录后至少验证：

1. 会话建立成功，`auth.me` 返回完整用户与门店信息
2. 侧边栏只展示当前账号可访问路由
3. `/orders` 可查单、查看详情、审核退款
4. `/verification` 可筛选、查码、核销、查看履约记录
5. `/catalog` 可查看商品与套餐
6. `/campaigns` 可查看活动与参与明细
7. `/customers` 可查看客户详情与跟进轨迹
8. `/staff` 可查看角色模板、账号列表、权限与状态
9. `/settings` 可读取支付、AI、通知等配置
10. `/finance` 可看支付流水、退款流水、对账概览
11. `/ops` 可看审计日志与系统健康信息

## 9. 上线前核查清单

### P0

- 目标门店的 `cloudEnv`、`appid`、Web 环境变量全部确认无误
- 所有核心云函数已部署到正确环境
- 支付商户号、API v3 密钥、证书序列号、私钥、回调地址、回调密钥联调通过
- `admin_accounts` 已准备首个可登录账号，且绑定正确 `storeId`
- 数据库中的门店、商品、套餐、支付配置、AI 配置、角色模板已初始化

### P1

- 小程序真机链路验收完成
- 网页后台登录和关键操作验收完成
- 裂变、退款、核销、权限隔离已做一轮门店场景验证
- 真实微信账号已完成一笔小额支付与一笔真实退款验证
- 文档与当前版本一致，不再依赖旧的初始化部署描述

### P2

- 当前未提交改动完成整理
- 形成可回滚版本号或 Git 标签
- 明确故障联系人、回滚方式、支付异常处理口径

## 10. 当前已知空白

以下事项不应被误认为“已经上线可用”：

- 完整履约报表中心
- 自动化部署流水线
- 后台 UI 内 CloudBase 用户 provisioning
- 后台密码重置
- 真实生产支付与退款已全量验证的书面记录

## 11. 仓库级验证

当前本地已确认：

```bash
node --test tests/*.test.js
```

结果：`111/111` 通过。

解释：

- 这说明当前仓库级行为回归稳定
- 但仍需补齐真机、预发布和生产环境验收，尤其是支付、退款、分享和后台登录链路
