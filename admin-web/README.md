# 门店网页版后台

`admin-web` 是本仓库新增的老板后台前端，技术栈为 `Vite + React + TypeScript + Ant Design + TanStack Query + ECharts`。

## 本地开发

1. 复制 `.env.example` 为 `.env.local`
2. 填入 CloudBase 环境变量
3. 安装依赖并启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物位于 `admin-web/dist`，可部署到 CloudBase Hosting。

## 当前功能

- 老板账号密码登录
- 经营看板
- 订单与退款中心
- 商品与套餐管理
- 裂变/抽奖活动管理
- 客户线索与跟进
- 门店、支付、AI 配置
- 小程序员工权限查看/调整
- Web 管理员列表与审计日志

## 依赖条件

- CloudBase 已开启 Web `用户名/密码` 登录
- 已配置 `publishable key`
- `admin_accounts` 集合中存在当前登录用户的 `uid` 映射
