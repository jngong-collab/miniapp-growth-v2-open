# Phase C3 - 核销工作台列表化

## 背景

Phase C2 已经把网页版 `/verification` 落成了“按核销码直接查询并执行单次核销”的工作入口，但现在仍然缺少两类日常运营视图：

- 待核销列表：运营/店员无法从后台直接看到哪些服务或套餐仍待履约。
- 履约记录：后台无法按订单项回看已经发生过的核销记录。

这一片的目标不是新建完整履约中心，而是在现有核销台基础上补齐“待办 + 历史”两块列表视图，把核销从一次性动作提升为可管理的工作台。

## 目标

1. 在 `adminApi` 提供待核销列表接口和履约记录接口。
2. 在 `admin-web` 的核销台中增加两个列表区域：
   - 待核销服务/套餐列表
   - 最近履约记录
3. 让 `/dashboard` 的“待核销服务”入口跳到可直接查看待核销列表的核销台，而不只是空白查询框。
4. 保持当前权限模型不变，继续复用 `orders.view` 作为列表和核销入口权限。

## 非目标

- 不在这一片单独新增新的一级导航。
- 不实现扫码能力、批量核销、撤销核销。
- 不实现完整履约报表、员工绩效统计或多维导出。
- 不改动共享退款状态机、权限合同或后台登录流程。

## 后端改动

### 文件

- `miniapp/cloudfunctions/adminApi/index.js`
- `miniapp/cloudfunctions/adminApi/lib/modules-orders.js`
- 仅在必要时补充 `miniapp/cloudfunctions/adminApi/lib/helpers.js`

### 新接口

1. `orders.listPendingVerification`
   - 输入：
     - `keyword?: string`
     - `productType?: 'all' | 'service' | 'package'`
     - `page?: number`
     - `pageSize?: number`
   - 输出：
     - 待核销订单项分页列表
   - 数据来源：
     - `order_items`
     - `orders`
     - `users`
   - 过滤规则：
     - 仅 `productType in ['service', 'package']`
     - 仅订单状态为 `paid` 或 `completed`
     - 服务类：`packageRemaining.used !== true`
     - 套餐类：`packageRemaining` 仍有剩余次数

2. `orders.listVerificationRecords`
   - 输入：
     - `keyword?: string`
     - `page?: number`
     - `pageSize?: number`
   - 输出：
     - 履约记录分页列表
   - 数据来源：
     - `package_usage`
     - `order_items`
     - `orders`
     - `users`

### 列表字段约束

待核销列表每行至少返回：

- `orderItemId`
- `orderId`
- `orderNo`
- `verifyCode`
- `productName`
- `productType`
- `verificationStatus`
- `packageExpireAt`
- `pendingSummary`
- `userLabel`
- `userPhone`
- `createdAt`

履约记录每行至少返回：

- `recordId`
- `orderItemId`
- `orderId`
- `orderNo`
- `serviceName`
- `verifyCode`
- `productName`
- `userLabel`
- `operatorOpenid`
- `remark`
- `createdAt`

## 前端改动

### 文件

- `admin-web/src/lib/admin-api.ts`
- `admin-web/src/types/admin.ts`
- `admin-web/src/pages/verification-page.tsx`
- `tests/admin-web.test.js`

### 页面形态

核销台保持单页，但拆成三个区域：

1. 核销码查询与即时核销
2. 待核销服务列表
3. 最近履约记录

交互要求：

- 页面初始化时就拉取待核销列表和履约记录。
- 待核销列表支持：
  - 关键字搜索
  - 商品类型筛选
  - 点击“使用该核销码”后自动回填查询框并滚动/聚焦到查询区
- 履约记录默认展示最近记录，支持关键字筛选。
- 成功核销后：
  - 刷新待核销列表
  - 刷新履约记录
  - 刷新看板 overview
  - 刷新订单列表缓存

## 测试与验证

### 自动化验证

- `node --test tests/admin-web.test.js tests/refund-state-machine.test.js`
- `npm run build`（目录：`admin-web`）

### 重点断言

- 新接口 action 已注册。
- `adminApi` 新增待核销和履约记录客户端方法。
- `/verification` 页面包含待核销列表和履约记录区域。
- 看板入口仍指向 `/verification`。
- 文档更新包含 Phase C3 的列表化工作台说明。

## Ownership

- Controller：
  - 计划、共享契约确认、最终整合、验证
- Backend worker：
  - `modules-orders.js` 及 `index.js` 新接口
- Frontend worker：
  - `verification-page.tsx`、`admin-api.ts`、`types/admin.ts`
- Controller：
  - 测试收口、必要的文档修订
