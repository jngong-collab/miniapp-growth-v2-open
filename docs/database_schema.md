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
| `reviewConfig` | object | 审核模式配置对象 |
| `reviewConfig.enabled` | boolean | 是否启用审核模式 |
| `reviewConfig.entryTitle` | string | 审核态首页/Tab 入口文案 |
| `reviewConfig.pageTitle` | string | 审核态舌象页标题 |
| `reviewConfig.historyTitle` | string | 审核态历史列表标题 |
| `reviewConfig.reportTitle` | string | 审核态详情标题 |
| `reviewConfig.submitText` | string | 审核态提交按钮文案 |
| `reviewConfig.shareTitle` | string | 审核态分享标题 |
| `reviewConfig.emptyText` | string | 审核态空状态文案 |
| `reviewConfig.listTagText` | string | 非审核态下审核期记录的列表标签文案 |
| `reviewConfig.safeBannerUrl` | string | 审核态安全 Banner 素材地址 |
| `reviewConfig.safeShareImageUrl` | string | 审核态安全分享图地址 |
| `reviewConfig.hideHistoryAiRecords` | boolean | 审核态是否只展示审核期照片记录 |
| `reviewConfig.allowReanalyzeAfterReview` | boolean | 审核结束后是否允许对审核期记录补发 AI 分析 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## pay_config（支付配置）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `mchId` | string | 微信支付商户号 |
| `apiV3Key` | string | API_V3_KEY（后台只脱敏回显） |
| `certSerialNo` | string | 商户 API 证书序列号 |
| `privateKey` | string | `apiclient_key.pem` 私钥内容（后台明文回显） |
| `privateKeyFileName` | string | 私钥文件名 |
| `certificatePem` | string | `apiclient_cert.pem` 证书内容（后台明文回显） |
| `certificateFileName` | string | 证书文件名 |
| `notifyUrl` | string | 兼容旧数据的遗留字段，当前云支付回调链路不再使用 |
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
| `status` | string | 状态：`pending` / `paid` / `shipped` / `completed` / `cancelled` / `refund_requested` / `refunding` / `refunded` |
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

> **Phase C 退款状态说明**：订单使用共享退款状态词汇。可支付/可履约状态通常是 `paid` / `shipped` / `completed`；用户发起申请后订单先进入 `refund_requested`，审核通过后进入 `refunding`，退款完成后进入 `refunded`。

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
| `packageExpireAt` | date | 套餐有效期截止时间（套餐类） |
| `verifyCode` | string | 核销码（6 位，仅服务/套餐类） |
| `createdAt` | date | 创建时间 |

> **网页核销台数据来源（Phase C 已上线）**：`/verification` 会按 `verifyCode` 直接查 `order_items`，仅处理 `productType=service/package` 的订单项。服务类订单项直接依赖该行的核销码和使用状态；套餐类订单项同时读取 `packageItems`、`packageRemaining` 与 `packageExpireAt`，用于展示可选服务项、剩余次数和有效期。Phase C4 在这条链路上继续使用分页合同：待核销列表基于 `order_items + orders + users` 组合，并支持关键字、商品类型、日期范围筛选；最近履约记录基于 `package_usage + order_items + orders + users` 组合，并支持关键字、商品类型、服务项目、操作人、核销码、日期范围筛选。当前 slice 仍然不是完整的履约报表中心。

---

## refund_requests（退款申请）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `orderId` | string | 关联订单 |
| `status` | string | 状态：`pending` / `refunding` / `refunded` / `rejected` |
| `previousStatus` | string | 记录申请前订单的原可支付订单状态，如 `paid` / `shipped` / `completed` |
| `reason` | string | 退款原因 |
| `reviewedBy` | string | 审核人 openid |
| `reviewedAt` | date | 审核时间 |
| `outRefundNo` | string | 微信退款单号 |
| `refundId` | string | 微信退款流水 ID |
| `refundProcessedAt` | date | 退款完成时间 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

> **共享退款状态词汇（Phase C 已上线）**：
> - 订单状态：`refund_requested` 表示已提交退款申请，`refunding` 表示退款已审核通过并进入打款中间态，`refunded` 表示退款完成。
> - 退款申请状态：`pending -> refunding -> refunded` 是唯一成功路径，其中 `refunding` 是共享的中间状态，不再直接从 `pending` 跳到 `refunded`。
> - 驳回路径：若审核阶段驳回申请，退款申请写回 `rejected`，订单回退到 `previousStatus` 记录的原可支付订单状态，而不是停留在 `refund_requested`。

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
| `isReviewMode` | boolean | 是否为审核期保存的照片记录 |
| `reviewSavedAt` | date | 审核态下保存记录时间，可与 `createdAt` 同步 |
| `reanalyzedAt` | date | 审核结束后补发 AI 分析的时间 |
| `shareCount` | number | 分享次数 |
| `createdAt` | date | 创建时间 |

> **审核模式说明**：审核期产生的“仅图片记录”与正常 AI 报告共用 `tongue_reports` 集合，不额外拆表。审核态写入时应标记 `isReviewMode: true`，并且 `result` 为空；非审核态下可对这类记录补发正式 AI 分析，并写回 `reanalyzedAt` 等补分析字段。

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
| `memberLevel` | string | 会员等级：`normal` / `vip` / `svip` |
| `memberNote` | string | 后台备注（管理员填写） |
| `memberTags` | array\<string\> | 会员标签，如 `["AI舌象", "待回访"]` |
| `registerSource` | string | 首次登录/建档来源，如 `profile` / `tongue` / `checkout` / `invite` |
| `memberOwnerStaffOpenid` | string | 会员负责人 OpenID（可空） |
| `memberOwnerStaffName` | string | 会员负责人展示名称（可空） |
| `phoneBoundAt` | date | 手机号绑定时间 |
| `profileCompleted` | boolean | 基础资料是否完善（至少绑定了手机号） |
| `loginStatus` | string | 登录状态快照：`logged_in` / `logged_out` / `inactive` |
| `lastLoginAt` | date | 最近一次登录时间 |
| `firstTongueAt` | date | 首次完成 AI 舌象/照片记录的时间 |
| `lastTongueAt` | date | 最近一次 AI 舌象/照片记录时间 |
| `tongueCount` | number | 累计 AI 舌象/照片记录次数 |
| `lastFollowupAt` | date | 最近一次人工跟进时间 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

> **余额规则**：余额可用于购买小程序内所有商品，暂不支持提现。

## auth_sessions（前端登录会话）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `token` | string | 会话令牌 |
| `_openid` | string | 绑定用户 openid |
| `userId` | string | 用户文档 `_id`（冗余） |
| `phone` | string | 会话绑定手机号 |
| `storeId` | string | 会话所属门店 |
| `status` | string | 会话状态：`active` / `revoked` / `expired` |
| `createdAt` | date | 会话创建时间 |
| `lastActiveAt` | date | 最近刷新时间 |
| `expiresAt` | date | 过期时间（默认 30 天后） |
| `revokedAt` | date | 手动注销时间 |
| `expiredAt` | date | 系统过期时间 |
| `updatedAt` | date | 更新时间 |
| `ip` | string | 可选，接入侧可写 |
| `userAgent` | string | 可选，接入侧可写 |

> **会话生命周期**：`opsApi` 在手机号绑定/登录时调用 `rotateSession` 生成新会话，写入 `active`；同一 openid 会先将历史 `active` 会话置为 `revoked`。`ensureAuth` 会校验 `status=active` 且 `expiresAt` 未过期；过期会写入 `expired`，随后返回登录提示。`logout` 会将会话置为 `revoked` 并附带 `revokedAt`。

## customer_events（会员行为事件）

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `_openid` | string | 用户 openid |
| `userId` | string | 用户文档 `_id`（冗余） |
| `storeId` | string | 所属门店 |
| `eventType` | string | 事件类型：`login` / `logout` / `phone_bound` / `tongue_analyzed` / `tongue_reanalyzed` / `order_created` / `order_paid` / `followup_created` / `member_updated` |
| `eventSource` | string | 事件来源页面或链路，如 `profile` / `tongue` / `cart` / `orders` / `admin` |
| `sessionToken` | string | 关联会话令牌（可空，通常只在登录事件写入） |
| `relatedId` | string | 关联业务单据 ID，如 `reportId` / `orderId` / `followupId` |
| `summary` | string | 面向后台的摘要说明 |
| `detail` | object | 结构化事件详情，如登录来源、会员等级变更前后、舌象结果摘要 |
| `staffOpenid` | string | 操作员工 OpenID（可空） |
| `staffName` | string | 操作员工展示名称（可空） |
| `createdAt` | date | 事件创建时间 |

> **用途说明**：该集合用于串联“首次手机号登录、自动恢复登录、手动退出、AI 舌象分析、下单支付、后台跟进、会员资料编辑”等关键会员行为，供后台客户详情页时间线与后续运营筛选使用。它不是订单、舌象、跟进表的替代品，而是跨模块事件流。

## miniapp 登录态（本地）

> 小程序端会把会话恢复状态写入本地缓存键 `miniapp_user_session`（`openid / isLoggedIn / manualLogout`）。`onLaunch` 时通过 `_initLoginSession` 读取该键并恢复 `manualLogout`/`isLoggedIn`；`setCustomerLoginSuccess` 与 `logoutCustomer` 会更新该键。该键用于控制“未手动退出时页面可恢复登录态”以及“手动退出后不自动恢复手机号状态”。

> **恢复策略**：`isLoggedIn` 仅作为会话恢复标记；最终可见态仍以 `userInfo.phone` 是否存在为准，确保“手动退出后即使本地存在旧会话仍不恢复手机号状态”。

## 后台会员与 AI 舌象列表展示字段映射（客户管理页）

> `leads.listCustomers` / `leads.getCustomerDetail` 输出会补齐以下展示字段：  
> - 手机与绑定态：`phone`、`phoneBound`
> - 登录态：`loginStatus`、`loginStatusLabel`、`isLoggedIn`、`lastLoginAt`  
> - 会员信息：`memberLevel`、`memberLevelLabel`（普通会员 / VIP / SVIP）、`memberNote`、`memberTags`、`memberTagsText`、`memberOwnerStaffOpenid`、`memberOwnerStaffName`
> - AI 舌象：`tongueCount`、`lastTongueAt`
> - 跟进信息：`followupStatus`、`followupStatusLabel`、`followupLastAt`、`followupLastNote`
> - 详情页附加：`recentTongueReports`（含 `isReviewMode` / `conclusion` / `analysisDetails`）、`recentOrders`、`followupEvents`

## 测试回归矩阵（可回归）

| 序号 | 用例 | 校验点 |
|---|---|---|
| 1 | 未登录访问 AI 舌象（/tongue、/tongue-report） | 页面入口与关键动作（历史/再次分析）必须命中 `requireCustomerLogin` 并不触发 `growthApi`/`analyzeTongue` |
| 2 | 未登录访问订单与支付（/orders） | `onShow`、列表加载、支付动作、退款动作均需被拦截 |
| 3 | 首次登录后自动恢复 | 手机号绑定成功后写入 `miniapp_user_session`，再次启动应恢复登录态并继续走业务态（前置鉴权通过） |
| 4 | 手动退出登录 | `logoutCustomer` 标记 `manualLogout=true` 并清空手机号；后续不会因旧 session 自动恢复 |
| 5 | 后台会员字段展示与筛选 | 客户页必须展示手机号绑定状态、会员等级、AI 舌象、登录状态、备注/负责人，并支持关键词搜索（昵称、手机号、OpenID、标签）筛选 |
| 6 | 后台门店隔离 | 客户列表与详情均通过 `storeId` 查询用户与舌象/跟进数据，不可跨店读取 |
| 7 | AI 舌象权限边界 | 同一用户不同页面（舌象首页、报告页、历史页）均执行同一登录门槛，确保登录链路闭环 |

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

> **与 `order_items` 的关联**：每次网页核销台或其他核销链路成功执行单次核销时，都会新增一条 `package_usage` 记录，并通过 `orderItemId` 回链到被核销的 `order_items` 行。套餐类订单项会同步扣减 `order_items.packageRemaining.<serviceName>`；单次服务类订单项会在对应 `order_items` 上标记已使用。Phase C4 的订单详情“履约记录”卡片就是基于这条回链关系，先从订单下的 `order_items` 找到对应 `package_usage`，再按订单维度汇总核销时间、服务项目、核销码、操作人和当前状态。这个集合记录的是逐次核销明细，不单独承担完整履约报表中心的聚合职责。

---

## admin_role_templates（后台角色模板）

> Phase B 的后台角色模板集合。`staff.listRoleTemplates` 会合并 `isSystem=true` 的系统模板与当前 `storeId` 下的门店模板，按 `roleKey` 去重后返回给 `/staff` 页面用于“按模板回填角色和权限”。当前已上线能力是**查看和套用模板**，不是在 UI 内创建模板。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `roleKey` | string | 模板键，当前合并逻辑按此字段去重，建议在系统模板和门店模板内保持稳定 |
| `roleName` | string | 模板展示名称，如“店长”“运营负责人” |
| `permissions` | array\<string\> | 点分权限列表；读取时会按后台权限合同过滤为合法值 |
| `isSystem` | boolean | 是否为系统模板；`true` 表示跨门店共用模板 |
| `storeId` | string | 门店模板所属门店；系统模板通常留空 |
| `status` | string | 模板状态；当前 UI 仅展示该字段，不在前端执行额外状态判断 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

> **模板使用说明**：后台账号创建抽屉和“调整后台账号权限”抽屉都可以直接套用模板，把 `role` 和 `permissions` 一起回填到表单；保存后真正落库的是 `admin_accounts` 中的角色和权限快照。

---

## admin_accounts（老板后台账号）

> Phase B 继续沿用该集合作为老板后台账号主表。`auth.me`、后台账号列表、状态切换、权限调整都要求记录绑定明确 `storeId`，不会回退到其他门店。当前 `/staff` 页面只维护账号记录与权限，不负责创建 CloudBase 用户、重置密码或补绑 UID。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `uid` | string | CloudBase Web 登录用户 UID；当前创建流程会全局校验唯一，空字符串表示尚未绑定登录身份 |
| `username` | string | 后台登录用户名；当前创建流程按 `storeId + username` 校验不重复 |
| `displayName` | string | 后台展示名称 |
| `role` | string | 角色标识；Phase B UI 可直接录入，也可先由角色模板回填 |
| `permissions` | array\<string\> | 权限点列表，当前使用点分格式：`dashboard.view`、`orders.view`、`orders.refund.review`、`catalog.manage`、`campaigns.manage`、`crm.view`、`settings.manage`、`staff.manage`、`audit.view` |
| `storeId` | string | 必填，绑定门店 ID；后台所有读写和权限判断都按该字段隔离 |
| `status` | string | 生命周期状态：`pending_activation` / `active` / `disabled` |
| `lastLoginAt` | date \| null | 最近一次成功建立后台会话的时间，由 `auth.me` 更新 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

> **生命周期说明**：
> - `pending_activation`：可先创建后台账号记录，但尚未形成可登录会话；没有 UID 的记录会保持在该状态。
> - `active`：允许 `auth.me` 建立后台会话；若记录没有 UID，后端会拒绝切换到该状态。
> - `disabled`：保留账号记录与权限快照，但 `auth.me` 会拒绝访问。
>
> **门店绑定说明**：Phase B 的 `staff.listAdminAccounts`、`staff.createAdminAccount`、`staff.updateAdminAccountStatus`、`staff.updateAdminAccountPermissions` 都只处理当前管理员所属 `storeId` 的记录。
>
> **会话说明**：`auth.me` 响应会返回 `permissions`、`routePermissions`、`storeId`、`storeName`、`storeInfo`。`routePermissions` 来源于后端共享合同，不单独存库。

---

## admin_login_events（老板后台登录事件）

> Phase B `/staff` 页面新增“登录日志”表格，读取的就是该集合。当前实现**只提供按门店查询与展示**；成功建立后台会话时，`auth.me` 会更新 `admin_accounts.lastLoginAt`，但不会自动写入 `admin_login_events`，因此该集合需要由额外登录链路或运维脚本补充写入。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `uid` | string | CloudBase Web 用户 UID |
| `username` | string | 尝试登录的后台用户名 |
| `storeId` | string | 目标门店 ID；若未绑定可为空字符串 |
| `eventType` | string | 事件类型，如 `login`、`logout`、`session.refresh` |
| `result` | string | 事件结果，如 `success`、`denied`、`expired` |
| `ip` | string | 客户端出口 IP，可选 |
| `userAgent` | string | 浏览器 UA，可选 |
| `detail` | object | 扩展诊断信息，如失败原因、权限命中结果 |
| `createdAt` | date | 事件创建时间 |

> **当前行为说明**：`staff.listAdminLoginEvents` 只按当前管理员的 `storeId` 读取最近记录，并在前端做分页切片；如果集合为空，UI 会显示空表格而不会回退到别的来源。

---

## admin_audit_logs（老板后台操作审计）

> Phase A 已落地的后台审计集合。订单退款、商品/活动编辑、配置变更、员工权限调整等写操作应统一写入此集合。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `actorUid` | string | 操作人 UID |
| `actorName` | string | 操作人展示名称，默认可回退为“管理员” |
| `action` | string | 操作动作标识，如 `catalog.saveProduct` |
| `module` | string | 业务模块，如 `catalog`、`orders`、`settings` |
| `targetType` | string | 目标对象类型，如 `product`、`order`、`adminAccount` |
| `targetId` | string | 目标对象 ID |
| `summary` | string | 面向后台的简要说明 |
| `detail` | object | 结构化详情，推荐存储 before/after 或业务上下文 |
| `storeId` | string | 操作所属门店 ID |
| `createdAt` | date | 审计记录创建时间 |

---

## notification_settings（通知配置）

> Phase D 新增的通知配置集合，按门店隔离。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 文档 ID |
| `storeId` | string | 关联门店 |
| `orderNotifyEnabled` | boolean | 是否开启订单通知 |
| `refundNotifyEnabled` | boolean | 是否开启退款通知 |
| `followupNotifyEnabled` | boolean | 是否开启跟进通知 |
| `notifyChannels` | array\<string\> | 通知渠道，如 `["sms"]` |
| `adminPhones` | array\<string\> | 接收通知的管理员手机号列表 |
| `createdAt` | date | 创建时间 |
| `updatedAt` | date | 更新时间 |

---

## 索引建议

```
users:          _openid (唯一)
auth_sessions:  token (唯一), _openid + status, expiresAt
customer_events: _openid + createdAt, storeId + createdAt, eventType + createdAt
orders:         _openid + status, orderNo (唯一), createdAt
order_items:    orderId, _openid + productType, verifyCode
fission_records: inviterOpenid, inviteeOpenid, campaignId
tongue_reports: _openid + createdAt, _openid + isReviewMode + createdAt
fission_campaigns: status + startTime + endTime
products:       storeId + status + sortOrder
package_usage:  orderItemId
admin_accounts: uid (唯一), username, storeId + status
admin_login_events: uid + createdAt, username + createdAt, storeId + createdAt
admin_audit_logs: storeId + createdAt, actorUid + createdAt, module + createdAt
notification_settings: storeId
```
