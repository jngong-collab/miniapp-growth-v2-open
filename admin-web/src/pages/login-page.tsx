import { App, Button, Card, Form, Input, Typography, Alert } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { adminApi } from '../lib/admin-api'
import { hasCloudbaseConfig, loginWithPassword } from '../lib/cloudbase'
import { getFirstAllowedRoute } from '../lib/routing'
import type { AdminSession } from '../types/admin'

export function LoginPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const loginMutation = useMutation({
    mutationFn: async (values: { username: string; password: string }) => {
      await loginWithPassword(values.username, values.password)
      return adminApi.me()
    },
    onSuccess: (session: AdminSession) => {
      message.success('登录成功')
      navigate(getFirstAllowedRoute(session) || '/dashboard', { replace: true })
    },
    onError: (error: Error) => {
      message.error(error.message)
    }
  })

  return (
    <div className="login-page">
      <div className="login-backdrop" />
      <Card className="login-card" bordered={false}>
        <div className="login-kicker">OWNER CONSOLE</div>
        <Typography.Title level={2}>门店网页版后台</Typography.Title>
        <Typography.Paragraph className="login-copy">
          适合老板和店长处理订单退款、商品活动、客户线索和门店配置。
        </Typography.Paragraph>
        {!hasCloudbaseConfig() ? (
          <Alert
            type="warning"
            showIcon
            message="缺少 CloudBase 环境变量"
            description="请先配置 VITE_CLOUDBASE_ENV、VITE_CLOUDBASE_REGION、VITE_CLOUDBASE_PUBLISHABLE_KEY。"
          />
        ) : null}
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => loginMutation.mutate(values)}
          className="login-form"
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入后台用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="请输入 CloudBase 用户名" size="large" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入后台密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入后台密码" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loginMutation.isPending}>
            登录老板后台
          </Button>
        </Form>
      </Card>
    </div>
  )
}
