import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Switch, Typography } from 'antd'
import { adminApi } from '../lib/admin-api'

export function SettingsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [storeForm] = Form.useForm()
  const [payForm] = Form.useForm()
  const [aiForm] = Form.useForm()
  const [notifyForm] = Form.useForm()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: adminApi.getSettings
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    storeForm.setFieldsValue(settingsQuery.data.storeInfo || {})
    payForm.setFieldsValue(settingsQuery.data.payConfig || {})
    aiForm.setFieldsValue(settingsQuery.data.aiConfig || {})
    notifyForm.setFieldsValue(settingsQuery.data.notificationConfig || {})
  }, [settingsQuery.data, storeForm, payForm, aiForm])

  const updateStoreMutation = useMutation({
    mutationFn: adminApi.updateStore,
    onSuccess: () => {
      message.success('门店信息已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updatePayMutation = useMutation({
    mutationFn: adminApi.updatePayConfig,
    onSuccess: () => {
      message.success('支付配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updateAiMutation = useMutation({
    mutationFn: adminApi.updateAiConfig,
    onSuccess: () => {
      message.success('AI 配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updateNotifyMutation = useMutation({
    mutationFn: adminApi.updateNotificationConfig,
    onSuccess: () => {
      message.success('通知配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">STORE SETTINGS</div>
          <Typography.Title level={2}>门店与系统设置</Typography.Title>
          <Typography.Paragraph>这里保存的是小程序前台和后台共用的配置，敏感字段继续以脱敏形式回显。</Typography.Paragraph>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="门店基础信息" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={storeForm} layout="vertical" onFinish={values => updateStoreMutation.mutate(values)}>
              <Form.Item name="name" label="门店名称"><Input /></Form.Item>
              <Form.Item name="phone" label="联系电话"><Input /></Form.Item>
              <Form.Item name="address" label="门店地址"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item name="description" label="门店简介"><Input.TextArea rows={3} /></Form.Item>
              <Form.Item name="logo" label="Logo 地址"><Input /></Form.Item>
              <Form.Item name="banners" label="Banner 地址（每行一个）"><Input.TextArea rows={3} /></Form.Item>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="latitude" label="纬度"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="longitude" label="经度"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={updateStoreMutation.isPending}>保存门店信息</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="支付配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={payForm} layout="vertical" onFinish={values => updatePayMutation.mutate(values)}>
              <Form.Item name="mchId" label="商户号"><Input /></Form.Item>
              <Form.Item name="mchKey" label="商户密钥"><Input.Password placeholder="保持脱敏值代表不修改" /></Form.Item>
              <Form.Item name="notifyUrl" label="支付回调地址"><Input /></Form.Item>
              <Button type="primary" htmlType="submit" loading={updatePayMutation.isPending}>保存支付配置</Button>
            </Form>
          </Card>
          <Card className="panel-card" title="AI 配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={aiForm} layout="vertical" onFinish={values => updateAiMutation.mutate(values)}>
              <Form.Item name="enabled" label="启用说明"><Input placeholder="可留空，沿用已有配置" /></Form.Item>
              <Form.Item name="apiUrl" label="AI 接口地址"><Input /></Form.Item>
              <Form.Item name="apiKey" label="API Key"><Input.Password placeholder="保持脱敏值代表不修改" /></Form.Item>
              <Form.Item name="model" label="模型名称"><Input /></Form.Item>
              <Form.Item name="dailyLimit" label="每日总限制"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="userDailyLimit" label="用户每日限制"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="systemPrompt" label="系统 Prompt"><Input.TextArea rows={4} /></Form.Item>
              <Button type="primary" htmlType="submit" loading={updateAiMutation.isPending}>保存 AI 配置</Button>
            </Form>
          </Card>
          <Card className="panel-card" title="通知配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={notifyForm} layout="vertical" onFinish={values => updateNotifyMutation.mutate(values)}>
              <Form.Item name="orderNotifyEnabled" label="订单通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="refundNotifyEnabled" label="退款通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="followupNotifyEnabled" label="跟进通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="adminPhones" label="管理员手机号（每行一个）">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={updateNotifyMutation.isPending}>保存通知配置</Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
