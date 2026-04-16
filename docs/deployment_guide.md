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

- 当前仓库中的 `cloudbaserc.json` 只声明了 `adminApi`，不能直接视为全部云函数已纳入统一部署配置。
- 上线前应明确其他业务函数的部署方式，是手工部署、CI 上传，还是补全到统一 CloudBase 配置中。

### 3. 网页后台配置

在 `admin-web/` 下创建 `.env.local`：

```env
VITE_CLOUDBASE_ENV=your-cloud-env-id
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_PUBLISHABLE_KEY=your-publishable-key
```

## 四、数据库与基础数据

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

## 五、必须部署的云函数

当前业务链路至少需要以下云函数在线：

- `contentApi`
- `growthApi`
- `commerceApi`
- `opsApi`
- `payApi`
- `adminApi`

`tmpDbFix` 只应在受控运维场景下临时启用，默认必须关闭。

## 六、建议部署顺序

1. 部署 `contentApi`
2. 部署 `growthApi`
3. 部署 `commerceApi`
4. 部署 `opsApi`
5. 部署 `payApi`
6. 部署 `adminApi`
7. 构建并发布 `admin-web`
8. 用微信开发者工具验证 `miniapp`

## 七、部署检查项

### 云函数

- 依赖已安装
- 运行时版本正确
- 环境变量齐全
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

## 八、部署后首轮验收

### 小程序

1. 首页加载
2. 用户登录
3. AI 舌象
4. 商城浏览
5. 购物车
6. 下单支付
7. 订单查询
8. 退款申请
9. 裂变分享进入
10. 套餐核销码与剩余次数展示
11. 工作台权限与核销

### 网页后台

1. 登录成功
2. 路由权限正常
3. 订单详情可查看履约和退款信息
4. `/verification` 可查码、核销、回看记录
5. `/staff` 可查看模板、账号、权限
6. `/settings` 可读取支付、AI、通知配置
7. `/finance`、`/customers`、`/ops` 可访问

## 九、已知限制

当前部署完成后，也不应默认视为以下能力已经完整上线：

- 完整履约报表中心
- 自动化 CI/CD 发布流水线
- 后台 UI 内用户 provisioning
- 后台密码重置
- 真实生产支付与退款的书面验收记录

## 十、推荐配套文档

- `docs/progress.md`
- `docs/runbook.md`
- `docs/admin-web-deploy.md`
- `docs/database_schema.md`
- `docs/go-live-checklist.md`
