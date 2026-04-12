# 门店部署指南

> 每个门店拥有独立的小程序和云开发环境

---

## 一、部署前准备

| 准备项 | 说明 | 获取方式 |
|---|---|---|
| 微信小程序 AppID | 门店自己的小程序账号 | [mp.weixin.qq.com](https://mp.weixin.qq.com) |
| 云开发环境 ID | 云函数 + 文档型数据库 + 云存储 | 微信开发者工具中开通 |
| 微信支付商户号 | 收款用 | [pay.weixin.qq.com](https://pay.weixin.qq.com) |
| AI API 密钥 | 舌象分析用 | 门店自行申请 |

---

## 二、代码配置（只需改 2 处）

### `miniapp/config.js`
```javascript
cloudEnv: 'your-cloud-env-id',   // ← 改这里
```

### `miniapp/project.config.json`
```json
"appid": "your-app-id"           // ← 改这里
```

---

## 三、数据库配置

在云开发控制台 → 数据库 → 创建以下 **12 个集合**：

```
stores, ai_config, pay_config, users,
products, packages, orders, order_items,
fission_campaigns, fission_records,
tongue_reports, package_usage
```

> 字段定义见 `docs/database_schema.md`

---

## 四、部署步骤

1. **复制代码** → 改 `config.js` 和 `project.config.json`
2. **开通云开发** → 创建 12 个集合
3. **上传云函数** → 右键每个云函数目录 → 上传并部署（云端安装依赖）
4. **初始化门店** → 在管理后台填写门店信息
5. **提交审核**

---

## 五、离线开发

公众号认证未完成前：
- ✅ 所有页面 UI 可开发预览
- ✅ 云函数代码可编写
- ❌ 云函数不能部署和调用
- ❌ 数据库不能创建

> 认证完成 → 开通云开发 → 创建集合 → 部署云函数 → 运行
