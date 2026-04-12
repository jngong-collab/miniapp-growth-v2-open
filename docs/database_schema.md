# 云数据库字段设计

> 所有金额字段统一使用 **分** 为单位（整数），避免浮点精度问题。
> 例：¥19.9 → 存储为 `1990`

---

## stores（门店信息）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `name` | string | 门店名称 |
| `logo` | string | Logo 图片 URL（云存储） |
| `address` | string | 地址 |
| `latitude` | number | 纬度 |
| `longitude` | number | 经度 |
| `phone` | string | 联系电话 |
| `banners` | array\<string\> | Banner 图片 URL 列表 |
| `description` | string | 门店描述 |
| `adminOpenids` | array\<string\> | 管理员 openid 列表 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## ai_config（AI 舌象配置）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `apiUrl` | string | AI API 地址 |
| `apiKey` | string | API 密钥 |
| `model` | string | 模型名称 |
| `systemPrompt` | string | 系统提示词 |
| `dailyLimit` | number | 每日全局额度 |
| `userDailyLimit` | number | 每用户每日额度 |
| `enabled` | boolean | 是否启用 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## pay_config（支付配置）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `mchId` | string | 微信支付商户号 |
| `mchKey` | string | 商户 API 密钥（加密存储） |
| `certFileId` | string | 证书文件 ID（云存储） |
| `notifyUrl` | string | 支付回调地址 |
| `enabled` | boolean | 是否启用 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## products（商品）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `name` | string | 商品名称 |
| `type` | string | 类型：`physical` / `service` / `package` |
| `price` | number | 价格（分） |
| `originalPrice` | number | 原价（分），用于划线价 |
| `description` | string | 商品描述 |
| `images` | array\<string\> | 商品图片 URL 列表 |
| `detail` | string | 富文本详情 |
| `stock` | number | 库存（-1 为无限） |
| `soldCount` | number | 已售数量 |
| `sortOrder` | number | 排序序号（越小越靠前） |
| `status` | string | 状态：`on` / `off`（上架/下架） |
| `tags` | array\<string\> | 标签，如 `["热卖", "推荐"]` |
| `efficacy` | string | 功效说明 |
| `deliveryType` | string | 交付方式：`express` / `pickup` / `instore` |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## packages（套餐明细）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `productId` | string | 关联商品（type=package 的商品） |
| `items` | array | 套餐服务项列表 |
| `items[].name` | string | 服务名称，如 "推拿" |
| `items[].count` | number | 次数，如 6 |
| `validDays` | number | 有效天数（从购买日起算） |
| `createdAt` | date | 创建时间 |

---

## orders（订单）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `orderNo` | string | 订单号（唯一，如 `ORD20260317120000001`） |
| `storeId` | string | 关联门店 |
| `totalAmount` | number | 订单总金额（分） |
| `payAmount` | number | 实付金额（分）（余额抵扣后） |
| `balanceUsed` | number | 使用余额（分） |
| `status` | string | 状态：`pending` / `paid` / `shipped` / `completed` / `cancelled` / `refunded` |
| `paymentId` | string | 微信支付交易 ID |
| `inviterOpenid` | string | 邀请人 openid（通过谁的链接来的） |
| `fissionCampaignId` | string | 关联裂变活动 ID（如有） |
| `address` | object | 收货地址（实物商品） |
| `address.name` | string | 收件人 |
| `address.phone` | string | 联系电话 |
| `address.province` | string | 省 |
| `address.city` | string | 市 |
| `address.district` | string | 区 |
| `address.detail` | string | 详细地址 |
| `remark` | string | 订单备注 |
| `createdAt` | date | 创建时间 |
| `paidAt` | date | 支付时间 |
| `completedAt` | date | 完成时间 |
| `cancelledAt` | date | 取消时间 |
| `expireAt` | date | 未支付过期时间（创建后 30 分钟） |

---

## order_items（订单明细）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `orderId` | string | 关联订单 |
| `productId` | string | 关联商品 |
| `productName` | string | 商品名称（快照） |
| `productImage` | string | 商品图片（快照） |
| `productType` | string | 商品类型（快照） |
| `price` | number | 单价（分） |
| `quantity` | number | 数量 |
| `subtotal` | number | 小计（分） |
| `packageItems` | array | 套餐服务项（快照，仅套餐类） |
| `packageRemaining` | object | 套餐剩余次数，如 `{"推拿": 4, "泡浴": 3}` |
| `verifyCode` | string | 核销码（6 位，仅服务/套餐类） |
| `createdAt` | date | 创建时间 |

---

## fission_campaigns（裂变活动）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `productId` | string | 关联商品 |
| `productName` | string | 商品名称（快照） |
| `activityPrice` | number | 活动价（分） |
| `cashbackAmount` | number | 返现金额（分） |
| `limitPerUser` | number | 每人限购（默认 1） |
| `totalStock` | number | 活动总库存 |
| `soldCount` | number | 已售数量 |
| `newCustomers` | number | 新增客户数 |
| `totalCashback` | number | 累计返现金额（分） |
| `startTime` | date | 活动开始时间 |
| `endTime` | date | 活动结束时间 |
| `status` | string | 状态：`active` / `paused` / `ended` |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## fission_records（裂变返现记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `campaignId` | string | 关联裂变活动 |
| `inviterOpenid` | string | 邀请人 openid |
| `inviteeOpenid` | string | 被邀请人 openid |
| `orderId` | string | 关联订单 |
| `cashbackAmount` | number | 返现金额（分） |
| `status` | string | 状态：`paid` / `cancelled` |
| `createdAt` | date | 创建时间 |

> **退款回收规则**：被邀请人退款时，如对应的返现记录状态改为 `cancelled`，同时扣减邀请人余额。

---

## tongue_reports（舌象报告）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `imageFileId` | string | 舌象照片（云存储 fileID） |
| `result` | object | AI 分析结果 |
| `result.tongueColor` | string | 舌色分析 |
| `result.tongueCoating` | string | 舌苔分析 |
| `result.tongueShape` | string | 舌形分析 |
| `result.moisture` | string | 润燥分析 |
| `result.conclusion` | string | 综合结论 |
| `result.suggestions` | array\<string\> | 调理建议 |
| `result.recommendProducts` | array\<string\> | 推荐商品 ID |
| `shareCount` | number | 分享次数 |
| `createdAt` | date | 创建时间 |

---

## users（用户信息）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 微信 openid |
| `nickName` | string | 昵称 |
| `avatarUrl` | string | 头像 URL |
| `phone` | string | 手机号 |
| `invitedBy` | string | 邀请人 openid |
| `balance` | number | 余额（分） |
| `totalEarned` | number | 累计赚取返现（分） |
| `totalInvited` | number | 累计邀请人数 |
| `memberLevel` | string | 会员等级：`normal` / `vip` |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

> **余额规则**：余额可用于购买小程序内所有商品，暂不支持提现。

---

## package_usage（套餐核销记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `orderItemId` | string | 关联订单明细 |
| `serviceName` | string | 核销的服务名称，如 "推拿" |
| `operatorOpenid` | string | 操作人 openid（门店工作人员） |
| `remark` | string | 备注 |
| `createdAt` | date | 核销时间 |

---

## 索引建议

```
users:          _openid (唯一)
orders:         _openid + status, orderNo (唯一), createdAt
order_items:    orderId, _openid + productType, verifyCode
fission_records: inviterOpenid, inviteeOpenid, campaignId
tongue_reports: _openid + createdAt
fission_campaigns: status + startTime + endTime
products:       storeId + status + sortOrder
package_usage:  orderItemId
```
