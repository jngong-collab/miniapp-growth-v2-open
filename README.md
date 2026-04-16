# 小儿推拿门店增长小程序 2.0（Monorepo）

本仓库是一个面向「门店增长运营」场景的小程序重构版本（2.0），目标是把获客、裂变、社群运营和到店转化串成一条闭环，减少通用商城复杂度，保留门店可执行的增长动作。

本版本实现为「同一个微信小程序」承载：

- C 端消费者流量页（首页 / AI 舌象 / 活动商城 / 个人中心）
- 门店工作台（订单、核销、活动、商品、客户跟进、员工权限）

> 技术基座：微信小程序 + CloudBase（单门店单环境）。当前仓库已经进入联调、验收和部署收口阶段，不再是初始化或纯页面骨架阶段。

## 文档导航

- 当前进展：[docs/progress.md](C:/Users/Administrator/Desktop/裂变小程序/docs/progress.md)
- 运行手册：[docs/runbook.md](C:/Users/Administrator/Desktop/裂变小程序/docs/runbook.md)
- 部署指南：[docs/deployment_guide.md](C:/Users/Administrator/Desktop/裂变小程序/docs/deployment_guide.md)
- 实施概览：[docs/implementation_plan.md](C:/Users/Administrator/Desktop/裂变小程序/docs/implementation_plan.md)
- 上线清单：[docs/go-live-checklist.md](C:/Users/Administrator/Desktop/裂变小程序/docs/go-live-checklist.md)
- 网页后台部署：[docs/admin-web-deploy.md](C:/Users/Administrator/Desktop/裂变小程序/docs/admin-web-deploy.md)
- 数据结构：[docs/database_schema.md](C:/Users/Administrator/Desktop/裂变小程序/docs/database_schema.md)

## 一、已完成的重构范围（版本快照）

- 登录流程：
  - `miniapp/app.js` 已去除 `adminApi` 容错路径，仅保留 `opsApi` 工作台入口；
  - `_normalizeLoginResult` 增加对登录返回形态兼容（`res.data._openid`、`res._openid`）；
  - 工作台权限统一通过 `getWorkbenchAccess` 获取，避免页面侧零散鉴权判断。
- 安全修复：
  - 移除内部回调默认硬编码 Secret 的「回退放行」路径（改为缺失即失败，fail-closed）；
  - 避免未鉴权客户端直接复用后台能力。
- 代码清理：
  - 全量清理旧 `adminApi` 使用痕迹；
  - 工作台页面样式已分阶段完成 `app.wxss` token 统一改造（Phase 2）；
  - C 端非核心链路样式已完成 token 统一（profile/orders/package-usage/tongue/tongue-report）。
- 当前分支：`codex/2.0-clean-sweep`（已推送到 GitHub 远端）。

## 二、仓库结构

```text
miniapp/
  app.js / app.json / app.wxss
  config.js               # 部署级配置（含 cloudEnv）
  pages/
    index/                 # 首页
    tongue/                # AI 舌象拍照/上传
    tongue-report/         # 舌象报告
    mall/                  # 商品列表
    product-detail/        # 商品/服务详情 + 下单
    orders/                # C 端订单列表
    package-usage/         # 套餐核销码与使用记录
    profile/               # 个人中心
    fission/               # 裂变入口
    lottery/               # 抽奖活动
    workbench/
      dashboard/           # 工作台首页
      orders/              # 工作台订单与退款处理
      verify/              # 到店核销
      campaigns/           # 活动管理
      catalog/             # 商品与套餐管理
      leads/               # 客户线索与跟进
      staff/               # 员工与权限
      settings/            # 门店配置
  cloudfunctions/
    growthApi/             # 舌象、抽奖、分享落地、线索打点
    commerceApi/           # 商品、订单、支付、退款申请
    opsApi/                # 工作台聚合接口（订单、核销、设置、权限）
    contentApi/            # 首页配置、活动位、推荐内容
    payApi/                # 支付/回调相关兼容与补充
```

## 三、运行前提

1. 安装微信开发者工具（推荐 stable 最新版本）。
2. 已有 CloudBase 云开发环境。
3. 已在微信小程序后台绑定云开发环境并配置支付参数（如微信支付）。

## 四、快速启动

### 1. 代码准备

- `cloudEnv` 配置在 `miniapp/config.js`，按门店新环境调整。
- 如需本地测试，确保微信开发者工具已登陆同一微信小程序与云开发环境。

### 2. 小程序导入

- 打开微信开发者工具，导入本仓库根目录中的 `miniapp` 目录。
- 确认 `project.config.json` 中 `appid` 与本地环境一致。
- 开启云开发，检查 `wx.cloud.init` 是否成功。

### 3. 云函数部署

对 `miniapp/cloudfunctions/*` 分别执行依赖安装与部署（按需）：

```bash
cd miniapp/cloudfunctions/commerceApi
npm install
# 使用微信开发者工具/CI 上传函数
```

其他函数同理（`contentApi`、`growthApi`、`opsApi`、`payApi`）。

> 建议在第一次部署前先设置 `cloudBase` 环境变量：支付回调秘钥、AI 配置相关参数、必要开关开关。

## 五、环境变量与配置（建议）

以下是常用且建议显式配置的项（以云函数环境变量或数据库配置为准）：

- 支付与回调：
  - `WECHAT_PAY_MCH_ID`（商户号）
  - `WX_PAY_SECRET` / 回调密钥（请勿写死默认值）
- AI 舌象：
  - `AI_BASE_URL`
  - `AI_API_KEY`
  - `AI_MODEL`（可选）
- 管理域能力：
  - `CLOUD_ENV_ID`
- 安全与幂等：
  - 订单/支付回调去重凭证、内部鉴权密钥（强制配置，否则拒绝回调）

> 注意：内部回调接口采用 fail-closed，缺失秘钥不应回退到硬编码明文；请在部署环境里显式配置。

## 六、数据与接口边界（2.0 约定）

- `users`：包含角色与权限（`role/permissions`）及店铺归属；
- `stores/products/packages/orders/order_items/package_usage`：交易与履约闭环；
- `lottery_campaigns/lottery_records`：抽奖运营链路；
- `fission_campaigns/fission_records`：裂变活动与邀请归因；
- `tongue_reports`：AI 舌象与转化来源；
- `refund_requests`：退款申请与审计，退款成功后再触发反向回滚；
- `customer_followups`：客户跟进轨迹（来源、状态、备注、最近跟进时间）。

## 七、工作台权限模型（当前策略）

- `customer`：普通用户，仅 C 端页面；
- `staff`：店员，默认可见核销/订单/跟进；
- `admin`：店长/管理员，具备活动、商品、员工、门店设置权限。

## 八、页面入口与测试建议

- C 端转化链路：
  `首页 -> AI舌象 -> 推荐 -> 下单支付 -> 到店核销 -> 邀请分享`
- 裂变链路：
  `分享进入 -> 下单 -> 返现记录 -> 退款回写`
- 抽奖链路：
  `进入抽奖 -> 参与记录 -> 中奖记录 -> 到店/咨询引导`
- 工作台链路：
  `我的 -> 工作台 -> 今日指标 -> 订单/退款/核销/客户`

## 九、当前状态与验收

已覆盖的验收项：

- 样式系统：`app.wxss` Tokens + 工作台/C端非核心页面 token 规范完成。
- 安全修复：内部回调 fail-closed、`adminApi` 退化路径清理、角色鉴权统一。
- 视图契约：WXML/JS 结构未改造下完成样式重构，尽量降低回归风险。
- 仓库级测试：`node --test tests/*.test.js` 当前为 `108/108` 通过。

剩余工作：

- 真机与预发布环境下的全链路验收；
- 真实支付、退款、通知、AI 服务的生产联调确认；
- 云函数部署口径、后台账号初始化和回滚流程的最终固化。

## 十、版权与合规

本仓库按现有业务授权范围使用第三方资源（图片/图标请确认版权归属）。  
请勿在生产环境写入明文支付密钥与第三方服务密钥。

## 十一、交接说明

当前仓库的进度、部署、验收和上线资料已补齐到以下文档：

- `docs/progress.md`
- `docs/runbook.md`
- `docs/deployment_guide.md`
- `docs/implementation_plan.md`
- `docs/go-live-checklist.md`

上线前建议先按 `docs/go-live-checklist.md` 执行一轮完整验收，再推进提审或正式上线。
