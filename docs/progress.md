# 小儿推拿门店增长小程序 2.0 - 当前进展

> 更新日期：2026-04-16
> 本文档以当前仓库代码、目录结构、测试覆盖和现有部署文档为准，替代 2026-03 的初始化阶段记录。

## 当前结论

- 当前阶段：**Release Candidate (RC)**。
- 代码级开发、回归测试、部署配置梳理、数据库自举脚本和文档收口已完成。
- 小程序 C 端、门店工作台、网页后台、云函数主链路都已经落地，不再是规划或 Demo 状态。
- 仓库级回归测试当前为 `111/111` 通过，说明主要功能和最近的部署/自举脚本补充已有代码层保障。
- 当前仅剩生产环境真实商户配置、真实支付退款联调与真机验收作为上线前最终收口事项。

## 模块清单

### 已完成

#### 1. 小程序 C 端主链路

- 首页：`miniapp/pages/index`
- AI 舌象：`miniapp/pages/tongue`、`miniapp/pages/tongue-report`
- 商城与商品详情：`miniapp/pages/mall`、`miniapp/pages/product-detail`
- 购物车：`miniapp/pages/cart`
- 订单中心：`miniapp/pages/orders`
- 裂变入口：`miniapp/pages/fission`
- 抽奖活动：`miniapp/pages/lottery`
- 套餐使用：`miniapp/pages/package-usage`
- 个人中心：`miniapp/pages/profile`

当前状态判断依据：

- 页面均已存在完整 `.js/.json/.wxml/.wxss` 四件套。
- `miniapp/app.json` 已注册完整路由与 Tab 栏。
- `tests/cart-flow.test.js`、`tests/frontend-regressions.test.js`、`tests/review-fixes.test.js` 已覆盖商城、购物车、商品详情、订单统计、分享等关键行为。

#### 2. 小程序门店工作台

- 工作台首页：`miniapp/pages/workbench/dashboard`
- 订单管理：`miniapp/pages/workbench/orders`
- 到店核销：`miniapp/pages/workbench/verify`
- 活动管理：`miniapp/pages/workbench/campaigns`
- 商品与套餐管理：`miniapp/pages/workbench/catalog`
- 客户线索：`miniapp/pages/workbench/leads`
- 员工与权限：`miniapp/pages/workbench/staff`
- 门店设置：`miniapp/pages/workbench/settings`

当前状态判断依据：

- `miniapp/utils/workbench.js` 已统一角色、权限与工作台准入逻辑。
- `tests/workbench-2.0.test.js`、`tests/workbench-ops-regressions.test.js` 已覆盖角色归一化、冷启动权限判定、门店隔离、核销与退款更新等问题。

#### 3. 云函数主能力

- `contentApi`：首页与商城内容获取
- `growthApi`：舌象历史、裂变收入、抽奖、套餐等增长链路
- `commerceApi`：商品详情、订单创建、订单查询、退款申请
- `opsApi`：工作台聚合接口、核销、员工、设置、客户、订单
- `payApi`：支付、回调、退款链路
- `adminApi`：网页后台会话、订单、商品、活动、客户、员工、财务、运维

当前状态判断依据：

- `miniapp/app.js` 当前实际调用的主入口是 `opsApi`、`payApi`、`growthApi`、`commerceApi`。
- `admin-web` 与 `miniapp/pages/workbench/*` 对应接口均已接入。
- 测试已覆盖支付回调鉴权、退款状态机、门店数据隔离、后台权限收敛等关键点。

#### 4. 网页管理后台 `admin-web`

- 登录页、路由守卫、后台壳层已完成
- 页面已落地：`dashboard`、`orders`、`verification`、`catalog`、`campaigns`、`leads`、`staff`、`settings`
- Phase D 页面已落地：`finance`、`customers`、`ops`

当前状态判断依据：

- 页面源码位于 `admin-web/src/pages`
- `tests/admin-web.test.js`、`tests/admin-isolation-regressions.test.js` 已覆盖权限路由、后台会话、详情抽屉、核销台、财务与客户页等

#### 5. 稳定性与安全基线

- 内部支付回调鉴权已改为 fail-closed
- `tmpDbFix` 默认关闭，且要求受控启用
- 后台权限模型已收敛为点分权限键，默认拒绝
- 多门店隔离已经补到订单、活动、商品、设置、客户、核销、退款审核等链路
- 退款状态词汇与中间态已统一为 `refund_requested -> refunding -> refunded`

### 已解决的收口项

- 云函数统一部署配置已完成：`cloudbaserc.json` 已覆盖 `contentApi`、`growthApi`、`commerceApi`、`opsApi`、`payApi`、`adminApi`
- 小程序与后台环境变量模板已统一为占位符口径，不再提交真实环境 ID
- 数据库 bootstrap 已完成：`npm run db:init` 可创建核心集合、建议索引、首个管理员账号和默认角色模板
- 上线与部署文档已收口到当前 2.0 架构，旧版初始化口径已不再是主参考
- 当前代码工作区已可以按发布节奏管理，不再处于“持续散落改动”的状态

### 未开始

以下能力在当前仓库里没有看到已完成的证据，或现有文档明确说明尚未覆盖：

- 完整履约报表中心或跨订单核销运营看板
- 面向生产的自动化发布流水线与环境切换策略
- 后台账号的 UI 内用户 provisioning、密码重置、UID 后补绑定
- 真实支付、真实退款、真实通知、真实 AI 服务的上线验收记录
- 全量运行手册与值班/故障处置文档

## 上线前阻塞项

### P0 阻塞

- CloudBase 生产环境仍需做最终人工确认：需要在真实上线门店逐项核对 `miniapp/config.js`、`miniapp/project.config.json`、`cloudbaserc.json`、`admin-web/.env.local`
- 真实支付联调未在仓库中留下可验证结果：代码测试通过不等于商户号、证书、回调地址、退款权限已验证
- 真实商户敏感信息尚未在生产环境完成最终注入和验收：`MCH_ID`、`API_V3_KEY`、`CERT_SERIAL_NO`、`PRIVATE_KEY`

### P1 阻塞

- 需要完成小程序真机回归：登录、分享、下单、支付、退款申请、核销、裂变返现、抽奖
- 需要完成后台联调：登录、权限守卫、订单详情、退款审核、核销台、商品与活动编辑、客户与员工页
- 需要确认支付配置、AI 配置、通知配置和门店基础数据已在真实生产环境逐项填充完成

### P2 收尾项

- 形成门店维度的最终上线记录，包括真实支付、真实退款、值守人和回滚责任人
- 输出一版明确的“上线检查表”和“回滚入口”

## 验证现状

2026-04-16 本地仓库校验结果：

- `node --test tests/*.test.js`
- 结果：`111/111` 通过

这代表：

- 当前代码在仓库级回归测试上是稳定的
- 但并不自动代表微信开发者工具真机链路、CloudBase 线上环境、真实支付与真实 AI 接口已经全部验收通过

## 下一步建议

1. 按 `docs/deployment_guide.md` 和 `docs/runbook.md` 注入真实微信支付商户凭证并核对生产环境。
2. 使用真实微信账号完成一笔 0.01 元支付和一笔真实退款，保留书面验收记录。
3. 完成小程序真机与后台生产环境验收，逐项勾选 `docs/go-live-checklist.md`。
4. 验证值守、回滚和支付异常处置口径后，再进入正式上线。
