# 小儿推拿门店增长小程序 2.0 - 当前进展

> 更新日期：2026-04-16
> 本文档以当前仓库代码、目录结构、测试覆盖和现有部署文档为准，替代 2026-03 的初始化阶段记录。

## 当前结论

- 项目已从“页面骨架期”进入“联调、验收、部署收口期”。
- 小程序 C 端、门店工作台、网页后台、云函数主链路都已经落地，不再是规划或 Demo 状态。
- 仓库级回归测试当前为 `108/108` 通过，说明主要功能和近期修复点已有较强的代码层保障。
- 目前最大的差距不在页面数量，而在生产环境准备、真实支付/回调联调、后台账号初始化、部署流程固化，以及文档同步。

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

### 开发中

#### 1. 最后一轮联调与收尾修复

当前工作区仍有未提交改动，集中在这些区域：

- `miniapp/app.js`
- `miniapp/cloudfunctions/opsApi/index.js`
- `miniapp/cloudfunctions/payApi/index.js`
- `miniapp/utils/workbench.js`
- `miniapp/pages/product-detail/product-detail.js`
- `miniapp/pages/lottery/lottery.js`
- `admin-web/src/pages/catalog-page.tsx`
- 以及多份新增回归测试

这说明项目还处在“持续收口中”，并非完全冻结版本。

#### 2. 文档与实际实现同步

- `docs/progress.md` 原内容仍停留在 2026-03 初始化阶段
- `docs/deployment_guide.md` 仍以早期 12 个集合和简化部署口径为主
- `docs/implementation_plan.md` 仍保留 `tongueAnalysis` 等早期描述，而当前云函数目录已转向 2.0 聚合结构

这部分现在正在补齐。

#### 3. 生产部署口径统一

- `cloudbaserc.json` 当前只声明了 `adminApi`
- 实际业务依赖的 `contentApi`、`growthApi`、`commerceApi`、`opsApi`、`payApi` 仍需明确统一部署方式
- 管理后台与小程序的环境变量、路由回退、首个管理员初始化流程需要形成一版统一执行手册

### 未开始

以下能力在当前仓库里没有看到已完成的证据，或现有文档明确说明尚未覆盖：

- 完整履约报表中心或跨订单核销运营看板
- 面向生产的自动化发布流水线与环境切换策略
- 后台账号的 UI 内用户 provisioning、密码重置、UID 后补绑定
- 真实支付、真实退款、真实通知、真实 AI 服务的上线验收记录
- 全量运行手册与值班/故障处置文档

## 上线前阻塞项

### P0 阻塞

- CloudBase 生产环境未完成统一确认：需要核对 `miniapp/config.js`、`miniapp/project.config.json`、`cloudbaserc.json`、`admin-web/.env.local`
- 云函数部署口径未完全固化：当前仓库配置只覆盖 `adminApi`，不能代表整套系统已可重复部署
- 真实支付联调未在仓库中留下可验证结果：代码测试通过不等于商户号、证书、回调地址、退款权限已验证
- 首个后台管理员初始化仍依赖运维或数据库写入，不能完全通过 UI 自举
- 旧文档存在明显过期信息，若直接按旧文档执行部署，存在误操作风险

### P1 阻塞

- 需要完成小程序真机回归：登录、分享、下单、支付、退款申请、核销、裂变返现、抽奖
- 需要完成后台联调：登录、权限守卫、订单详情、退款审核、核销台、商品与活动编辑、客户与员工页
- 需要确认数据库集合、索引、初始化数据、角色模板、通知配置、支付配置、AI 配置已按生产门店准备完成

### P2 收尾项

- 清理和合并当前未提交改动
- 更新部署与交接文档，避免后续人员继续参考旧版初始化文档
- 输出一版明确的“上线检查表”和“回滚入口”

## 验证现状

2026-04-16 本地仓库校验结果：

- `node --test tests/*.test.js`
- 结果：`108/108` 通过

这代表：

- 当前代码在仓库级回归测试上是稳定的
- 但并不自动代表微信开发者工具真机链路、CloudBase 线上环境、真实支付与真实 AI 接口已经全部验收通过

## 下一步建议

1. 先按 `docs/runbook.md` 完成一轮环境与部署核查。
2. 以真机和预发布环境跑完一轮核心业务验收。
3. 清理当前工作区未提交改动并形成可追踪版本。
4. 再决定是否进入正式提审和门店上线。
