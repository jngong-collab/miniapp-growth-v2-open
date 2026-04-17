# 网页版后台部署说明

> 当前文档覆盖已上线的 Admin Identity Phase B，以及当前 shipped Phase C slice：订单详情里的履约/核销信息可见性、共享退款状态词汇与退款时间线，以及 `/verification` 网页核销台。Phase C4 在此基础上补齐了更丰富的核销筛选/分页合同，并让订单详情可回看履约记录；但当前核销 slice 仍然不是完整的履约报表中心。

## 1. 准备 CloudBase Web 登录与前端环境变量

在 CloudBase 控制台启用 `UserNameLogin`，并确认当前环境可获取 `publishable key`。

在 `admin-web` 目录复制 `.env.example` 为 `.env.local`，再填写以下变量：

```env
VITE_CLOUDBASE_ENV=your-env-id
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_PUBLISHABLE_KEY=your-publishable-key
```

需要准备并填入：

- `CloudBase Env ID`
- `Region`
- `Publishable Key`

> 不要让项目依赖已提交的生产环境文件；本地和预发布环境都应从 `.env.example` 派生自己的 `.env.local`。

## 2. 引导首个可登录后台账号

要进入 `/staff` 页面管理其他账号，仍然需要先准备一个首个可登录的老板后台账号。这一步是初始化动作，不是 UI 自举：

1. 通过 CloudBase Web Auth 创建一个用户名密码用户
2. 获取该用户登录后的 `uid`
3. 在 `admin_accounts` 集合插入一条记录
4. 确认该记录绑定了有效 `storeId`
5. 将 `status` 设为 `active`，否则 `auth.me` 会拒绝后台会话

示例文档：

```json
{
  "uid": "cloudbase-web-uid",
  "username": "boss-demo",
  "storeId": "stores collection doc id",
  "role": "owner",
  "status": "active",
  "permissions": [
    "dashboard.view",
    "orders.view",
    "orders.refund.review",
    "catalog.manage",
    "campaigns.manage",
    "crm.view",
    "settings.manage",
    "staff.manage",
    "audit.view"
  ],
  "displayName": "老板",
  "lastLoginAt": null,
  "createdAt": "serverDate",
  "updatedAt": "serverDate"
}
```

权限是拒绝优先的：`permissions` 为空时不会自动获得全部权限，前后端都只认点分权限键。首个账号准备完成后，再登录后台进入 `/staff` 页面做后续管理。

## 3. 准备角色模板（可选，但推荐）

`/staff` 页面里的“角色模板”卡片是读取与套用入口，不是模板创建入口。若希望创建后台账号时按模板回填角色和权限，需要先在 `admin_role_templates` 集合准备记录。

系统模板示例：

```json
{
  "roleKey": "store-owner",
  "roleName": "店长",
  "permissions": [
    "dashboard.view",
    "orders.view",
    "orders.refund.review",
    "catalog.manage",
    "campaigns.manage",
    "crm.view",
    "settings.manage",
    "staff.manage",
    "audit.view"
  ],
  "isSystem": true,
  "status": "active",
  "createdAt": "serverDate",
  "updatedAt": "serverDate"
}
```

门店模板示例：

```json
{
  "roleKey": "store-operator",
  "roleName": "运营负责人",
  "permissions": [
    "dashboard.view",
    "orders.view",
    "catalog.manage",
    "campaigns.manage",
    "crm.view"
  ],
  "storeId": "stores collection doc id",
  "isSystem": false,
  "status": "active",
  "createdAt": "serverDate",
  "updatedAt": "serverDate"
}
```

当前后端会合并：

- `isSystem=true` 的系统模板
- 当前管理员所属 `storeId` 的门店模板

如果系统模板和门店模板 `roleKey` 相同，当前返回逻辑会按 `roleKey` 去重后展示，部署时应主动避免冲突。

## 4. 使用 `/staff` 页面管理后台账号与权限

登录后台后进入 `/staff` 页面，当前已上线流程如下：

1. 在“角色模板”卡片确认模板内容是否正确
2. 在“后台账号管理”卡片点击“创建后台账号”
3. 可选套用角色模板，自动回填 `role` 与 `permissions`
4. 录入 `username`、`displayName`、`permissions`
5. 如果已经有 CloudBase 登录 UID，可一并填入 `uid` 并直接创建为 `active` 或 `disabled`
6. 如果还没有 UID，可创建待激活（`pending_activation`）记录作为占位
7. 已绑定 UID 的账号，可以在列表里继续“调整权限”或“启用/停用”

这部分要特别区分：

- 当前 UI 提供：后台账号记录创建、角色模板套用、权限调整、状态切换、登录日志查看、最近审计日志查看
- 当前 UI 不提供密码重置
- 当前 UI 不提供 CloudBase 用户开通 / 用户创建
- 当前 UI 不提供创建后的补绑 UID 编辑

如果你先创建了 `pending_activation` 记录，后续要让它变成可登录账号，仍需在当前 Phase B 之外完成 UID 绑定，然后才能把状态切到 `active`。

## 5. 校验会话、登录痕迹与审计基础

成功登录后，`adminApi.auth.me` 需要返回以下关键字段，前端路由守卫和侧边栏都依赖它们：

- `uid`
- `username`
- `displayName`
- `role`
- `status`
- `permissions`
- `routePermissions`
- `storeId`
- `storeName`
- `storeInfo`

同时确认：

- `admin_accounts.lastLoginAt` 会在成功建立会话时更新
- `/staff` 的“登录日志”读取的是 `admin_login_events`
- 当前 `auth.me` 不会自动写入 `admin_login_events`，因此该表是否有数据取决于额外登录链路或运维补录
- 写操作会写入 `admin_audit_logs`

## 6. Phase C 订单退款与网页核销

当前 Phase C 网页后台补齐的是退款审核共享词汇和首个网页核销 slice，不是完整履约中心。部署和验收时请按下面的共享合同理解：

- 订单退款相关状态词汇：`refund_requested` / `refunding` / `refunded`
- 退款申请状态词汇：`pending` / `refunding` / `refunded` / `rejected`
- 审核通过后的标准流转：`pending -> refunding -> refunded`
- `refunding` 是共享中间态，表示后台审核已通过、退款已进入执行，不再允许文档或 UI 按旧逻辑把 `pending` 直接写成 `refunded`
- 审核驳回时，退款申请写回 `rejected`，订单必须回退到 `previousStatus` 记录的原可支付订单状态，通常是 `paid` / `shipped` / `completed`

当前 Phase C 网页后台只提供：

- `/orders` 详情内查看退款时间线
- 查看订单项的核销码、剩余次数、有效期等履约字段
- `/verification` 路由下的网页核销台，侧边栏入口名称为“核销台”
- dashboard 上“待核销服务”卡片点击后直达 `/verification`
- `/verification` 页面内直接看到“待核销服务”列表；该列表走分页合同，并支持 `keyword`、`productType`、`dateRange` 这组筛选参数
- `/verification` 页面内查看“最近履约记录”；该列表同样走分页合同，并支持 `keyword`、`productType`、`serviceName`、`operatorOpenid`、`verifyCode`、`dateRange`
- 通过 `verifyCode` 直接查 `order_items` 里的服务/套餐订单项
- 展示套餐服务项、`packageRemaining` 剩余次数、套餐有效期与核销状态
- 从待核销列表里点击“使用该核销码”后回填并直查该订单项
- 在网页端直接执行单次核销扣次，并继续写入 `package_usage` 与 `admin_audit_logs`
- `/orders` 详情抽屉内可显示“履约记录”卡片，回看该订单已有的核销时间、服务项目、核销码、操作人和当前状态
- 继续沿用已有退款审核入口和审计日志

当前 Phase C 网页后台还不提供：

- 完整的履约报表中心
- 面向运营排班、批量处理或跨订单汇总的履约工作台
- 超出直接查码/核销范围的统计分析视图

## 7. 部署云函数

需要部署：

- `miniapp/cloudfunctions/adminApi`

依赖：

- `wx-server-sdk`
- `@cloudbase/node-sdk`

## 8. 构建并发布前端

在 `admin-web` 目录：

```bash
npm install
npm run build
```

将 `dist/` 发布到 CloudBase Hosting。

## 9. Hosting 路由回退

由于后台使用浏览器路由，需要将所有前端路由回退到 `index.html`，确保：

- `/dashboard`
- `/orders`
- `/verification`
- `/catalog`
- `/campaigns`
- `/leads`
- `/settings`
- `/staff`

都能直接访问。

## 10. Phase D 新增路由与权限映射

Phase D 在后台新增了以下页面， Hosting 路由回退同样需要覆盖：

- `/finance` — 财务与对账中心（支付流水、退款流水、对账概览）
  - 权限要求：`orders.refund.review`
- `/customers` — 客户与运营中心（客户列表、详情、跟进时间轴）
  - 权限要求：`crm.view`
- `/ops` — 审计运维台（系统健康、审计日志筛选）
  - 权限要求：`staff.manage`

此外，以下能力已在现有页面内补完：

- `/settings` 现已同时维护「通知配置」与「支付配置」。
- 支付配置支持维护 `mchId`、`API_V3_KEY`、证书序列号、`apiclient_key.pem` 私钥和证书文件；其中 `API_V3_KEY` 继续脱敏，私钥与证书内容按明文回显。
- 支付与退款运行时会按订单 `storeId` 读取对应门店的 `pay_config`，缺少商户号、API_V3_KEY、证书序列号或私钥时会直接阻止支付/退款。
- 通知配置数据写入 `notification_settings` 集合。
- `/catalog` 商品列表和编辑已补 `storeId` 隔离；后台新增 `catalog.getProductDetail` 用于详情抽屉反查。
- `/campaigns` 裂变活动已补 `storeId` 隔离；后台新增 `campaigns.getFissionDetail` 和 `campaigns.listFissionRecords` 用于活动详情与参与明细。

## 11. 上线前核查

- 能用账号密码登录
- `auth.me` 能读取 `uid` 对应的 `admin_accounts`
- `auth.me` 返回的 `routePermissions` 与前端路由守卫一致
- `admin_accounts.storeId` 已绑定真实门店，后台不会回退到首个门店
- `admin_accounts.status` 与实际目标一致：未准备好 UID 的账号保持待激活（`pending_activation`）
- `permissions` 为空或缺失时不会获得隐式全量权限
- `admin_role_templates` 的系统模板/门店模板能在 `/staff` 页面正常展示并套用
- `/staff` 页面创建后台账号时不会被误解为创建 CloudBase 用户；缺 UID 的记录不会被错误启用
- 当前流程未承诺密码重置或用户 provisioning，运维同学知道这两件事仍需在 UI 外处理
- `admin_login_events` 若有接入，会按门店展示；如果暂未接入，空表格属于当前实现预期
- 订单、商品、活动、设置、员工等写操作能落库到 `admin_audit_logs`
- 订单退款遵循 `pending -> refunding -> refunded`，不会再从 `pending` 直接跳到 `refunded`
- 退款申请驳回后，订单会回退到 `previousStatus` 对应的原可支付订单状态，而不是卡在 `refund_requested`
- 订单退款能真实落库并回写审计日志
- `/verification` 和侧边栏“核销台”可直接访问，且需要 `orders.view`
- dashboard 的“待核销服务”卡片会跳转到 `/verification`
- 核销台相关列表使用分页返回，不依赖一次性拉全量；待核销列表和履约记录列表都要按当前筛选条件稳定刷新
- 核销筛选合同至少覆盖关键字、商品类型、日期范围，履约记录额外支持服务项目、操作人和核销码过滤
- 网页核销台当前是直接查码和单次核销入口，不是完整的履约报表中心
- 网页核销后会扣减 `order_items.packageRemaining` 或标记单次服务已用，并新增 `package_usage` 记录
- 订单详情抽屉若存在履约数据，应能显示“履约记录”卡片并回看该订单下的核销历史
- 商品与活动修改后，小程序前台数据同步生效
- AI 配置字段依然脱敏回显；支付配置中仅 `API_V3_KEY` 脱敏
- 运营和门店同学知道：当前 slice 以直接查码/核销为主，后续若需要完整履约报表需另行规划
