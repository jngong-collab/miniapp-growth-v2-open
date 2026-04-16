# 门店部署指南 2.0

> 更新日期：2026-04-16
> 本文档用于替代早期初始化阶段的简化部署说明，内容以当前 2.0 仓库结构为准。

## 一、部署目标

当前交付物包含三部分：

- 微信小程序：`miniapp/`
- 云函数：`miniapp/cloudfunctions/`
- 网页管理后台：`admin-web/`

每个门店应使用：

- 自己的小程序 `AppID`
- 自己的 CloudBase 环境
- 自己的支付商户配置
- 自己的后台管理员账号与权限数据

## 二、部署前准备

| 准备项 | 说明 | 备注 |
|---|---|---|
| 微信小程序 AppID | 门店自己的小程序账号 | 对应 `miniapp/project.config.json` |
| CloudBase 环境 ID | 小程序、云函数、数据库、存储共用 | 对应 `miniapp/config.js` 与 `cloudbaserc.json` |
| CloudBase Web Publishable Key | 网页后台登录用 | 对应 `admin-web/.env.local` |
| 微信支付商户号与证书 | 下单、回调、退款用 | 对应 `pay_config` 与云函数环境变量 |
| AI 服务配置 | 舌象相关接口调用 | 对应 `ai_config` |
| 首个后台管理员账号 | 网页后台登录入口 | 对应 `admin_accounts` |

## 三、代码配置

### 1. 小程序配置

修改 `miniapp/config.js`：

```javascript
module.exports = {
  cloudEnv: 'your-cloud-env-id'
}
```

修改 `miniapp/project.config.json`：

```json
{
  "appid": "your-app-id"
}
```

### 2. CloudBase CLI 配置

核对 `cloudbaserc.json`：

```json
{
  "envId": "your-cloud-env-id",
  "appid": "your-app-id",
  "miniprogramRoot": "miniapp/",
  "cloudfunctionRoot": "miniapp/cloudfunctions/"
}
```

注意：

- 当前仓库已经补齐 2.0 核心函数的统一部署清单：`contentApi`、`growthApi`、`commerceApi`、`opsApi`、`payApi`、`adminApi`。
- 上线前仍需确认目标环境中的运行时、超时、内存和实际部署版本与仓库配置一致。

### 3. 网页后台配置

在 `admin-web/` 下创建 `.env.local`：

```env
VITE_CLOUDBASE_ENV=your-cloud-env-id
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_PUBLISHABLE_KEY=your-publishable-key
```

## 四、微信支付与退款配置

### 1. 支付架构原则

生产环境必须先明确收款架构，再录入任何商户凭证：

- 单门店独立收款：每个门店使用自己的微信支付商户号，订单、退款、对账都按门店商户独立闭环。
- 多门店统一平台运营：不要使用“平台代收后再二次清分”的二清模式。应优先采用微信支付服务商模式，或在直营主体下使用官方分账能力。

强制要求：

- **不要使用单商户为多门店做统收统付后二清代发。**
- 若门店主体独立，优先申请 **微信支付服务商模式**。
- 若门店由同一经营主体直营管理，至少应评估并落地 **官方分账接口**，而不是在仓库外做非官方二清。

### 2. 4 个核心支付凭证

生产环境至少需要准备以下 4 个核心支付凭证：

1. `MCH_ID`
   - 含义：微信支付商户号。
   - 获取方式：微信商户平台开通商户后，在商户平台首页或账户中心查看。
   - 推荐配置位置：
     - `pay_config.mchId`：按门店存储商户号，方便后台读取和展示。
     - 如有多门店独立收款，`pay_config.storeId + mchId` 必须一一对应。

2. `API_V3_KEY`
   - 含义：API v3 密钥，用于回调报文解密等敏感支付能力。
   - 获取方式：微信商户平台 -> API 安全 -> 设置 API v3 密钥。
   - 推荐配置位置：
     - **只放在 `payApi` 云函数环境变量中**，不要写入 `pay_config` 集合，也不要提交到仓库。

3. `CERT_SERIAL_NO`
   - 含义：商户 API 证书序列号。
   - 获取方式：在微信商户平台生成 API 证书后，从证书信息中获取。
   - 推荐配置位置：
     - **只放在 `payApi` 云函数环境变量中**。
     - 后台如需展示证书状态，建议只展示脱敏信息，不回显完整序列号。

4. `PRIVATE_KEY` / `apiclient_key.pem`
   - 含义：商户 API 私钥，对退款、分账、敏感支付签名至关重要。
   - 获取方式：生成 API 证书时同步下载 `apiclient_key.pem`。
   - 推荐配置位置：
     - **只放在 `payApi` 云函数环境变量中，或通过云函数可访问的密钥管理方案加载。**
     - 严禁写入 `pay_config` 集合、前端环境变量或仓库文件。
   - 必须强调：
     - **退款必须依赖商户 API 私钥。**
     - 如采用服务商模式或直营分账，分账签名同样依赖该私钥。

### 3. 推荐的配置分层

建议按“门店业务参数”和“敏感支付密钥”分层：

- `pay_config` 集合存储：
  - `storeId`
  - `mchId`
  - `notifyUrl`
  - `enabled`
  - 以及必要的脱敏描述字段
- `payApi` 云函数环境变量存储：
  - `API_V3_KEY`
  - `CERT_SERIAL_NO`
  - `PRIVATE_KEY`
  - 以及内部回调鉴权使用的 `PAY_CALLBACK_SECRET`

这样做的原因：

- `pay_config` 需要被后台读取和维护，适合存储“可运营配置”。
- API v3 密钥、证书序列号、私钥都属于高敏凭证，必须限制在服务端运行时环境。

### 4. 推荐环境变量命名

`payApi` 生产环境建议至少配置：

```env
API_V3_KEY=your-api-v3-key
CERT_SERIAL_NO=your-cert-serial-no
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
PAY_CALLBACK_SECRET=your-internal-callback-secret
```

如生产环境使用多门店独立商户：

- `pay_config` 中的 `mchId` 应按 `storeId` 逐店维护。
- 如需根据门店切换不同 API 证书与私钥，需在运行时建立明确的“门店 -> 商户密钥材料”映射，不能让多个门店共享一套不对应的私钥。

### 5. 回调与退款配置提醒

- `JSAPI` 支付回调能力、回调地址或云函数内网能力必须在生产环境实测。
- 退款联调不止是代码状态流转，还必须确认：
  - 商户平台已开通退款能力
  - API 证书可用
  - 私钥和证书序列号匹配
  - 真实退款后订单与退款申请能从 `refunding -> refunded`
  - 商户平台账单与本地记录一致
## 五、数据库与基础数据

### 1. 业务集合

至少准备并核对以下集合：

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

字段定义与状态词汇参考：

- `docs/database_schema.md`
- `docs/admin-web-deploy.md`
- `docs/runbook.md`

### 2. 首个后台管理员

当前 2.0 后台仍需要手工准备首个管理员，不是纯 UI 自举：

1. 在 CloudBase Web Auth 创建用户名密码用户
2. 获取用户 `uid`
3. 插入 `admin_accounts` 记录
4. 绑定真实 `storeId`
5. 设置 `status=active`
6. 配置合法点分权限键

### 3. 角色模板

如需在 `/staff` 页面使用模板，需预先插入：

- 系统模板：`isSystem=true`
- 或门店模板：包含 `storeId`

## 六、必须部署的云函数

当前业务链路至少需要以下云函数在线：

- `contentApi`
- `growthApi`
- `commerceApi`
- `opsApi`
- `payApi`
- `adminApi`

`tmpDbFix` 只应在受控运维场景下临时启用，默认必须关闭。

## 七、建议部署顺序

1. 部署 `contentApi`
2. 部署 `growthApi`
3. 部署 `commerceApi`
4. 部署 `opsApi`
5. 部署 `payApi`
6. 部署 `adminApi`
7. 构建并发布 `admin-web`
8. 用微信开发者工具验证 `miniapp`

## 八、部署检查项

### 云函数

- 依赖已安装
- 运行时版本正确
- 环境变量齐全
- `payApi` 已配置 `API_V3_KEY`、`CERT_SERIAL_NO`、`PRIVATE_KEY`
- 支付回调密钥显式配置
- 没有依赖默认 Secret 或回退放行路径

### 小程序

- `cloudEnv` 和 `appid` 正确
- 分享、登录、支付、核销等权限可用
- 真机可访问云函数

### 网页后台

- `npm run build` 成功
- Hosting 已配置路由回退到 `index.html`
- 以下路由可直达：
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

## 九、部署后首轮验收

### 小程序

1. 首页加载
2. 用户登录
3. AI 舌象
4. 商城浏览
5. 购物车
6. 下单支付
7. 订单查询
8. 使用真实微信账号完成 0.01 元支付
9. 完成一笔真实退款并观察 `refunding -> refunded`
10. 退款申请
11. 裂变分享进入
12. 套餐核销码与剩余次数展示
13. 工作台权限与核销

### 网页后台

1. 登录成功
2. 路由权限正常
3. 订单详情可查看履约和退款信息
4. `/verification` 可查码、核销、回看记录
5. `/staff` 可查看模板、账号、权限
6. `/settings` 可读取支付、AI、通知配置
7. `/finance`、`/customers`、`/ops` 可访问

## 十、已知限制

当前部署完成后，也不应默认视为以下能力已经完整上线：

- 完整履约报表中心
- 自动化 CI/CD 发布流水线
- 后台 UI 内用户 provisioning
- 后台密码重置
- 真实生产支付与退款的书面验收记录之外，不应把“代码测试通过”当成商户配置完成的证据

## 十一、推荐配套文档

- `docs/progress.md`
- `docs/runbook.md`
- `docs/admin-web-deploy.md`
- `docs/database_schema.md`
- `docs/go-live-checklist.md`
