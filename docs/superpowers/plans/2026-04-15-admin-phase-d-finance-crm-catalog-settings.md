# Admin Phase D — 财务、客户、商品营销补完与系统配置

> **目标**：在不动现有权限合同、退款状态机、admin-web / adminApi 结构的前提下，补齐四大模块：财务与对账中心、客户与运营中心、商品与营销中心补完、系统配置与运维中心。

## 设计约束

- **不修改现有 dotted permission keys**：新页面复用现有权限守卫：
  - 财务中心 → `orders.refund.review`
  - 客户中心 → `crm.view`（与 `/leads` 同权限域）
  - 商品/营销中心 → `catalog.manage` / `campaigns.manage`
  - 系统配置/运维 → `settings.manage` / `staff.manage`
- **不改 auth.me / routePermissions 契约**：`routePermissions` 保持现有映射，新增路由直接写死权限键到 `PermissionRoute` 和菜单。
- **不改退款状态机词汇**：继续用 `pending -> refunding -> refunded` / `rejected`。
- **沿用现有结构**：`adminApi` 按 `modules-<domain>.js` 组织；`admin-web` 页面放在 `src/pages/`；类型在 `src/types/admin.ts`；API 客户端在 `src/lib/admin-api.ts`。

## 模块 1：财务与对账中心

### 后端
- 新建 `miniapp/cloudfunctions/adminApi/lib/modules-finance.js`
- `finance.listPaymentRecords`：读取 `orders` 的已支付/已退款记录，按分页返回支付流水。
- `finance.listRefundRecords`：读取 `refund_requests`，返回退款流水。
- `finance.getReconciliationSummary`：按日期范围聚合 GMV、实收、退款、订单数。
- `index.js` 注册上述 action，权限用 `orders.refund.review`。

### 前端
- 新建 `admin-web/src/pages/finance-page.tsx`
- 三区域：支付流水、退款流水、对账概览。
- `admin.ts` 增加 `PaymentRecord`、`RefundRecord`、`ReconciliationSummary` 类型。
- `admin-api.ts` 增加 `listPaymentRecords`、`listRefundRecords`、`getReconciliationSummary`。
- `App.tsx` 增加 `/finance` 路由，`admin-shell.tsx` 增加菜单项（权限 `orders.refund.review`）。

## 模块 2：客户与运营中心

### 后端
- 扩展 `miniapp/cloudfunctions/adminApi/lib/modules-leads.js`
- `leads.listCustomers`：基于 `users` 集合的客户列表（含余额、会员等级、邀请关系）。
- `leads.getCustomerDetail`：单客户详情 + 最近订单 + 跟进记录。
- `leads.listFollowupEvents`：按 `leadOpenid` 读取 `customer_followups` 历史（支持时间轴）。
- `index.js` 注册，权限用 `crm.view`。

### 前端
- 新建 `admin-admin/src/pages/customers-page.tsx`
- 客户列表 + 详情抽屉（展示最近订单、跟进时间轴）。
- `/leads` 页面保留现有线索列表，侧边栏将“客户线索”改为“客户运营”并指向 `/customers`。
- `admin.ts` 增加 `CustomerRecord`、`CustomerDetail`、`FollowupEvent` 类型。
- `admin-api.ts` 增加 `listCustomers`、`getCustomerDetail`、`listFollowupEvents`。
- `App.tsx` 增加 `/customers` 路由（`crm.view`）。

## 模块 3：商品与营销中心补完

### 后端
- `modules-catalog.js`：
  - 给 `listProducts` 增加 `storeId` 过滤（补全门店隔离）。
  - 新增 `catalog.getProductDetail(id)` 供详情抽屉反查。
- `modules-campaigns.js`：
  - 给 `listCampaigns` 增加 `storeId` 过滤。
  - 新增 `campaigns.getFissionDetail(id)` 返回活动详情 + 参与记录简要统计。
  - 新增 `campaigns.listFissionRecords(campaignId)` 返回裂变参与明细。

### 前端
- `catalog-page.tsx`：商品列表增加搜索和类型筛选；点击商品打开详情抽屉（含编辑入口）。
- `campaigns-page.tsx`：活动卡片增加“查看详情”抽屉，展示参与统计和最近参与记录。
- `admin.ts` 增加 `ProductDetail`、`CampaignDetail`、`FissionRecord` 类型。
- `admin-api.ts` 增加 `getProductDetail`、`getFissionDetail`、`listFissionRecords`。

## 模块 4：系统配置与运维中心

### 后端
- 扩展 `modules-settings.js`：
  - `settings.updateNotificationConfig`：保存/更新 `notification_settings`。
  - `settings.getSystemHealth`：返回云函数、数据库、存储状态摘要（轻量可用性检查）。
- 扩展 `modules-staff.js`：
  - `audit.list` 增加 `module` / `action` / `dateRange` 筛选。

### 前端
- `settings-page.tsx`：新增“通知配置”卡片。
- 新建 `admin-web/src/pages/ops-page.tsx`：运维台，含系统健康状态、最近审计日志带筛选。
- `App.tsx` 增加 `/ops` 路由（权限 `staff.manage`）。
- `admin-shell.tsx` 增加“审计运维”菜单（权限 `staff.manage`），指向 `/ops`。
- `admin.ts` 增加 `NotificationConfig`、`SystemHealth` 类型。
- `admin-api.ts` 增加 `updateNotificationConfig`、`getSystemHealth`、`listAuditLogsWithFilters`。

## 测试与文档要求

每完成一个模块，同步更新：
- `tests/admin-web.test.js`：添加对应契约断言（API 暴露、页面包含关键 UI 文本、类型定义）。
- `docs/database_schema.md`：补充新集合/字段说明（如 `notification_settings`）。
- `docs/admin-web-deploy.md`：补充新页面路由、权限映射、部署注意事项。

最终验证：
```powershell
node --test tests/admin-web.test.js tests/refund-state-machine.test.js
cd admin-web && npm run build
```
