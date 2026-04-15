# Phase C4 - 履约中心列表增强与订单详情反查

## 背景

Phase C3 已把 `/verification` 从单次核销入口扩成了“待核销服务 + 最近履约记录 + 核销码直查”的工作台，但仍有两个明显缺口：

- 列表筛选不完整，无法按日期、操作人、服务项稳定筛查；
- 订单详情无法直接回看该订单已经发生过的履约记录。

## 目标

1. 补齐 `/verification` 的分页和多维筛选。
2. 让订单详情能够直接展示该订单相关的履约记录。
3. 不新增新的权限键，继续复用 `orders.view`。

## 后端

### 文件

- `miniapp/cloudfunctions/adminApi/lib/modules-orders.js`

### 改动

1. `orders.listPendingVerification`
   - 保持现有分页合同
   - 支持 `dateRange`
   - 继续支持 `keyword`、`productType`

2. `orders.listVerificationRecords`
   - 支持：
     - `keyword`
     - `productType`
     - `serviceName`
     - `operatorOpenid`
     - `verifyCode`
     - `orderId`
     - `dateRange`
   - 继续分页返回

3. `orders.getDetail`
   - 新增 `verificationRecords`
   - 数据取该订单下所有 `order_items` 对应的 `package_usage`

## 前端

### 文件

- `admin-web/src/types/admin.ts`
- `admin-web/src/pages/verification-page.tsx`
- `admin-web/src/pages/orders-page.tsx`

### 改动

1. `/verification`
   - 待核销列表补分页和日期筛选
   - 履约记录补分页、日期筛选、操作人/服务项筛选

2. `/orders` 详情抽屉
   - 增加“履约记录”卡片
   - 展示核销时间、服务项、核销码、操作人、当前状态

## 测试与文档

- 更新 `tests/admin-web.test.js`
- 更新 `docs/admin-web-deploy.md`
- 更新 `docs/database_schema.md`
