import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import { downloadCsv } from '../lib/csv'
import type { LeadRecord } from '../types/admin'

export function LeadsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [followupForm] = Form.useForm()
  const [filters, setFilters] = useState({
    source: 'all',
    followupStatus: 'all',
    keyword: '',
    page: 1,
    pageSize: 20
  })
  const [activeLead, setActiveLead] = useState<LeadRecord | null>(null)

  const leadsQuery = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => adminApi.listLeads(filters)
  })

  const saveMutation = useMutation({
    mutationFn: (values: { status: string; note: string }) => adminApi.saveFollowup(String(activeLead?._openid || ''), values.status, values.note),
    onSuccess: () => {
      message.success('跟进已更新')
      setActiveLead(null)
      followupForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const exportMutation = useMutation({
    mutationFn: () => adminApi.exportLeads(filters),
    onSuccess: rows => {
      downloadCsv(`leads-${Date.now()}.csv`, rows)
      message.success('线索 CSV 已导出')
    },
    onError: (error: Error) => message.error(error.message)
  })

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">LEAD CRM</div>
          <Typography.Title level={2}>客户线索与跟进</Typography.Title>
          <Typography.Paragraph>把舌象、抽奖、下单和裂变入口沉淀成统一线索池，老板可以在这里安排跟进。</Typography.Paragraph>
        </div>
        <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>导出 CSV</Button>
      </div>

      <Card className="panel-card" bordered={false}>
        <Space wrap className="filter-bar">
          <Select value={filters.source} style={{ width: 160 }} onChange={value => setFilters(prev => ({ ...prev, source: value, page: 1 }))} options={[
            { label: '全部来源', value: 'all' },
            { label: 'AI 舌象', value: 'tongue' },
            { label: '幸运抽奖', value: 'lottery' },
            { label: '下单客户', value: 'order' },
            { label: '分享裂变', value: 'fission' }
          ]} />
          <Select value={filters.followupStatus} style={{ width: 160 }} onChange={value => setFilters(prev => ({ ...prev, followupStatus: value, page: 1 }))} options={[
            { label: '全部跟进状态', value: 'all' },
            { label: '待跟进', value: 'pending' },
            { label: '已联系', value: 'contacted' },
            { label: '已到店', value: 'visited' },
            { label: '已成交', value: 'converted' }
          ]} />
          <Input.Search allowClear placeholder="搜索昵称、手机号、备注、openid" style={{ width: 320 }} onSearch={value => setFilters(prev => ({ ...prev, keyword: value, page: 1 }))} />
        </Space>
        <Table
          rowKey="_openid"
          loading={leadsQuery.isLoading}
          dataSource={leadsQuery.data?.list || []}
          columns={[
            {
              title: '客户',
              render: (_, record) => (
                <div>
                  <div>{record.nickName || '未授权昵称'}</div>
                  <Typography.Text type="secondary">{record.phone || record._openid}</Typography.Text>
                </div>
              )
            },
            { title: '主要来源', dataIndex: 'primarySourceLabel', width: 120 },
            { title: '来源轨迹', render: (_, record) => record.tracksLabel.map((item: string) => <Tag key={item}>{item}</Tag>) },
            { title: '跟进状态', dataIndex: 'followupStatusLabel', width: 120 },
            { title: '备注', dataIndex: 'followupNote' },
            { title: '最近活跃', render: (_, record) => dayjs(record.lastActivityAt as string).format('YYYY-MM-DD HH:mm'), width: 160 },
            {
              title: '操作',
              width: 100,
              render: (_, record) => (
                <Button
                  size="small"
                  onClick={() => {
                    setActiveLead(record)
                    followupForm.setFieldsValue({
                      status: record.followupStatus,
                      note: record.followupNote
                    })
                  }}
                >
                  跟进
                </Button>
              )
            }
          ]}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: leadsQuery.data?.total || 0,
            onChange: (page, pageSize) => setFilters(prev => ({ ...prev, page, pageSize }))
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Drawer
        title="更新跟进"
        width={420}
        open={Boolean(activeLead)}
        onClose={() => setActiveLead(null)}
        destroyOnClose
      >
        <Form form={followupForm} layout="vertical" onFinish={values => saveMutation.mutate(values)}>
          <Form.Item label="客户" extra={activeLead?.phone || activeLead?._openid}>
            <Input value={activeLead?.nickName || '未授权昵称'} disabled />
          </Form.Item>
          <Form.Item name="status" label="跟进状态" rules={[{ required: true }]}>
            <Select options={[
              { label: '待跟进', value: 'pending' },
              { label: '已联系', value: 'contacted' },
              { label: '已到店', value: 'visited' },
              { label: '已成交', value: 'converted' }
            ]} />
          </Form.Item>
          <Form.Item name="note" label="跟进备注">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saveMutation.isPending}>保存跟进</Button>
        </Form>
      </Drawer>
    </div>
  )
}
