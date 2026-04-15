import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import type { GenericCampaign } from '../types/admin'

export function CampaignsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [fissionForm] = Form.useForm()
  const [lotteryForm] = Form.useForm()
  const [fissionOpen, setFissionOpen] = useState(false)
  const [lotteryOpen, setLotteryOpen] = useState(false)
  const campaignsQuery = useQuery({ queryKey: ['campaigns'], queryFn: adminApi.listCampaigns })
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: adminApi.listProducts })

  const saveFissionMutation = useMutation({
    mutationFn: adminApi.saveFission,
    onSuccess: () => {
      message.success('裂变活动已保存')
      setFissionOpen(false)
      fissionForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const saveLotteryMutation = useMutation({
    mutationFn: adminApi.saveLottery,
    onSuccess: () => {
      message.success('抽奖活动已保存')
      setLotteryOpen(false)
      lotteryForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const toggleMutation = useMutation({
    mutationFn: ({ campaignType, campaignId, status }: { campaignType: 'fission' | 'lottery'; campaignId: string; status: string }) =>
      adminApi.toggleCampaignStatus(campaignType, campaignId, status),
    onSuccess: () => {
      message.success('活动状态已更新')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const productOptions = (productsQuery.data || [])
    .filter(item => item.type !== 'package')
    .map(item => ({ label: item.name, value: item._id }))

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">GROWTH CAMPAIGNS</div>
          <Typography.Title level={2}>活动管理</Typography.Title>
          <Typography.Paragraph>统一维护裂变活动和抽奖活动，直接联动前台活动位与增长链路。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => { lotteryForm.resetFields(); setLotteryOpen(true) }}>新增抽奖活动</Button>
          <Button type="primary" onClick={() => { fissionForm.resetFields(); setFissionOpen(true) }}>新增裂变活动</Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'fission',
            label: '裂变活动',
            children: (
              <Card className="panel-card" bordered={false}>
                <Table
                  rowKey="_id"
                  loading={campaignsQuery.isLoading}
                  dataSource={campaignsQuery.data?.fissionCampaigns || []}
                  columns={[
                    { title: '活动商品', dataIndex: 'productName' },
                    { title: '活动价', dataIndex: 'activityPrice', render: value => `¥${(Number(value || 0) / 100).toFixed(2)}` },
                    { title: '返现金额', dataIndex: 'cashbackAmount', render: value => `¥${(Number(value || 0) / 100).toFixed(2)}` },
                    { title: '成交', dataIndex: 'soldCount', width: 90 },
                    { title: '状态', dataIndex: 'status', width: 100, render: value => <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag> },
                    {
                      title: '操作',
                      width: 220,
                      render: (_, record: GenericCampaign) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              fissionForm.setFieldsValue({
                                ...record,
                                dateRange: [dayjs(record.startTime as string | number | Date | undefined), dayjs(record.endTime as string | number | Date | undefined)]
                              })
                              setFissionOpen(true)
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="small"
                            onClick={() => toggleMutation.mutate({ campaignType: 'fission', campaignId: record._id, status: record.status === 'active' ? 'paused' : 'active' })}
                          >
                            {record.status === 'active' ? '暂停' : '启用'}
                          </Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </Card>
            )
          },
          {
            key: 'lottery',
            label: '抽奖活动',
            children: (
              <Card className="panel-card" bordered={false}>
                <Table
                  rowKey="_id"
                  loading={campaignsQuery.isLoading}
                  dataSource={campaignsQuery.data?.lotteryCampaigns || []}
                  columns={[
                    { title: '活动名称', dataIndex: 'name' },
                    { title: '参与', dataIndex: 'entryCount', width: 100 },
                    { title: '中奖', dataIndex: 'winCount', width: 100 },
                    { title: '状态', dataIndex: 'status', width: 100, render: value => <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag> },
                    {
                      title: '操作',
                      width: 220,
                      render: (_, record: GenericCampaign) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              lotteryForm.setFieldsValue({
                                ...record,
                                rulesText: Array.isArray(record.rules) ? record.rules.join('\n') : '',
                                dateRange: [dayjs(record.startTime as string | number | Date | undefined), dayjs(record.endTime as string | number | Date | undefined)]
                              })
                              setLotteryOpen(true)
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="small"
                            onClick={() => toggleMutation.mutate({ campaignType: 'lottery', campaignId: record._id, status: record.status === 'active' ? 'paused' : 'active' })}
                          >
                            {record.status === 'active' ? '暂停' : '启用'}
                          </Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </Card>
            )
          }
        ]}
      />

      <Modal
        open={fissionOpen}
        title="裂变活动"
        width={760}
        onCancel={() => setFissionOpen(false)}
        onOk={() => fissionForm.submit()}
        confirmLoading={saveFissionMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={fissionForm}
          layout="vertical"
          onFinish={values => {
            const [startTime, endTime] = values.dateRange || []
            saveFissionMutation.mutate({ ...values, startTime, endTime })
          }}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>
          <Form.Item name="productId" label="关联商品" rules={[{ required: true }]}><Select options={productOptions} /></Form.Item>
          <Space.Compact block>
            <Form.Item name="activityPrice" label="活动价（分）" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="cashbackAmount" label="返现金额（分）" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="limitPerUser" label="每人限购" style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="totalStock" label="活动库存" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="status" label="状态"><Select options={[{ label: '草稿', value: 'draft' }, { label: '启用', value: 'active' }, { label: '暂停', value: 'paused' }]} /></Form.Item>
          <Form.Item name="dateRange" label="活动时间" rules={[{ required: true }]}><DatePicker.RangePicker showTime style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={lotteryOpen}
        title="抽奖活动"
        width={820}
        onCancel={() => setLotteryOpen(false)}
        onOk={() => lotteryForm.submit()}
        confirmLoading={saveLotteryMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={lotteryForm}
          layout="vertical"
          onFinish={values => {
            const [startTime, endTime] = values.dateRange || []
            saveLotteryMutation.mutate({
              ...values,
              rules: values.rulesText,
              startTime,
              endTime
            })
          }}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>
          <Form.Item name="name" label="活动名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space.Compact block>
            <Form.Item name="dailyLimitPerUser" label="每日次数" style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="status" label="状态" style={{ flex: 1 }}><Select options={[{ label: '草稿', value: 'draft' }, { label: '启用', value: 'active' }, { label: '暂停', value: 'paused' }]} /></Form.Item>
          </Space.Compact>
          <Form.Item name="dateRange" label="活动时间" rules={[{ required: true }]}><DatePicker.RangePicker showTime style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="rulesText" label="活动规则（每行一条）"><Input.TextArea rows={4} /></Form.Item>
          <Form.List name="prizes" initialValue={[{ name: '', weight: 1, stock: 1, description: '' }]}>
            {(fields, { add, remove }) => (
              <div className="form-list-block">
                {fields.map(field => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 12 }}>
                    <Form.Item {...field} name={[field.name, 'name']} label="奖品名" rules={[{ required: true }]} style={{ minWidth: 180 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'weight']} label="权重" rules={[{ required: true }]} style={{ minWidth: 120 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'stock']} label="库存" style={{ minWidth: 120 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'description']} label="说明" style={{ minWidth: 180 }}>
                      <Input />
                    </Form.Item>
                    <Button danger onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ name: '', weight: 1, stock: 1, description: '' })}>新增奖品</Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
