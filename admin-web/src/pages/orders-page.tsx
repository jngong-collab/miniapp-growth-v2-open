import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, DatePicker, Descriptions, Drawer, Input, Select, Space, Table, Tag, Timeline, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import { downloadCsv } from '../lib/csv'
import type { OrderDetail, OrderItemDetail, OrderSummary } from '../types/admin'

function statusColor(status: string) {
  if (status === 'paid' || status === 'completed') return 'green'
  if (status === 'refunded') return 'default'
  if (status === 'refund_requested' || status === 'refunding') return 'orange'
  return 'blue'
}

function formatMoneyCent(value: number) {
  return `¥${(Number(value || 0) / 100).toFixed(2)}`
}

function getRemainingCountText(item: OrderItemDetail) {
  const { packageRemaining } = item

  if (typeof packageRemaining === 'number' && Number.isFinite(packageRemaining)) {
    return `${packageRemaining} 次`
  }

  if (!packageRemaining || typeof packageRemaining !== 'object') {
    return '-'
  }

  const remainingEntries = Object.entries(packageRemaining)
    .map(([name, count]) => {
      const normalizedCount = typeof count === 'number'
        ? count
        : typeof count === 'string' && count.trim() !== '' && Number.isFinite(Number(count))
          ? Number(count)
          : null

      return normalizedCount === null ? null : { name, count: normalizedCount }
    })
    .filter((entry): entry is { name: string; count: number } => Boolean(entry))

  if (!remainingEntries.length) {
    return '-'
  }

  const totalRemaining = remainingEntries.reduce((sum, entry) => sum + entry.count, 0)
  const detailText = remainingEntries.map(entry => `${entry.name} ${entry.count}`).join('，')

  return `${totalRemaining} 次（${detailText}）`
}

function normalizeDateValue(value: unknown) {
  if (!value) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return dayjs(value)
  }
  if (typeof value === 'object' && value && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds)
    if (Number.isFinite(seconds)) {
      return dayjs(seconds * 1000)
    }
  }
  return null
}

function getExpireAtText(value: unknown) {
  const parsed = normalizeDateValue(value)
  return parsed?.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '-'
}

function getVerificationStatusTag(item: OrderItemDetail) {
  switch (item.verificationStatus) {
    case 'unused':
      return { color: 'processing', label: '待核销' }
    case 'partially_used':
      return { color: 'orange', label: '部分使用' }
    case 'used':
      return { color: 'default', label: '已使用' }
    case 'expired':
      return { color: 'red', label: '已过期' }
    case 'verified':
      return { color: 'green', label: '已核销' }
    default:
      return { color: 'default', label: item.verificationStatus || '未配置' }
  }
}

export function OrdersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    status: 'all',
    productType: 'all',
    source: 'all',
    keyword: '',
    page: 1,
    pageSize: 20,
    dateRange: [] as string[]
  })
  const [activeOrderId, setActiveOrderId] = useState<string>('')

  const ordersQuery = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => adminApi.listOrders(filters)
  })
  const detailQuery = useQuery({
    queryKey: ['order-detail', activeOrderId],
    queryFn: () => adminApi.getOrderDetail(activeOrderId),
    enabled: Boolean(activeOrderId)
  })

  const reviewMutation = useMutation({
    mutationFn: ({ requestId, orderId, status }: { requestId: string; orderId: string; status: 'approved' | 'rejected' }) =>
      adminApi.reviewRefund(requestId, orderId, status),
    onSuccess: (_, variables) => {
      message.success(variables.status === 'approved' ? '退款已完成' : '已驳回退款申请')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      if (activeOrderId) {
        queryClient.invalidateQueries({ queryKey: ['order-detail', activeOrderId] })
      }
    },
    onError: (error: Error) => {
      message.error(error.message)
    }
  })

  const exportMutation = useMutation({
    mutationFn: () => adminApi.exportOrders(filters),
    onSuccess: rows => {
      downloadCsv(`orders-${Date.now()}.csv`, rows)
      message.success('订单 CSV 已导出')
    },
    onError: (error: Error) => message.error(error.message)
  })

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 180
    },
    {
      title: '用户 / 联系方式',
      render: (_: unknown, record: OrderSummary) => (
        <div>
          <div>{record.userLabel}</div>
          <Typography.Text type="secondary">{record.userPhone || '未留手机号'}</Typography.Text>
        </div>
      )
    },
    {
      title: '商品',
      render: (_: unknown, record: OrderSummary) => (
        <div>
          <div>{record.productName}</div>
          <Typography.Text type="secondary">{record.itemsSummary || '单商品订单'}</Typography.Text>
        </div>
      )
    },
    {
      title: '来源',
      dataIndex: 'leadSourceLabel',
      width: 100
    },
    {
      title: '金额',
      dataIndex: 'totalAmountYuan',
      width: 110,
      render: (value: string) => `¥${value}`
    },
    {
      title: '状态',
      width: 130,
      render: (_: unknown, record: OrderSummary) => <Tag color={statusColor(record.status)}>{record.statusLabel}</Tag>
    },
    {
      title: '下单时间',
      dataIndex: 'createdAtText',
      width: 170
    },
    {
      title: '操作',
      width: 220,
      render: (_: unknown, record: OrderSummary) => (
        <Space wrap>
          <Button size="small" onClick={() => setActiveOrderId(record._id)}>详情</Button>
          {record.refundRequest?.status === 'pending' ? (
            <>
              <Button
                size="small"
                type="primary"
                loading={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ requestId: record.refundRequest!._id, orderId: record._id, status: 'approved' })}
              >
                同意退款
              </Button>
              <Button
                size="small"
                danger
                loading={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ requestId: record.refundRequest!._id, orderId: record._id, status: 'rejected' })}
              >
                驳回
              </Button>
            </>
          ) : null}
        </Space>
      )
    }
  ]

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">ORDER & REFUND CENTER</div>
          <Typography.Title level={2}>订单与退款中心</Typography.Title>
          <Typography.Paragraph>
            统一查看支付订单、退款申请、商品来源和客户信息，老板可以直接在这里处理退款。
          </Typography.Paragraph>
        </div>
        <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
          导出 CSV
        </Button>
      </div>

      <Card className="panel-card" bordered={false}>
        <Space wrap className="filter-bar">
          <Select value={filters.status} onChange={value => setFilters(prev => ({ ...prev, status: value, page: 1 }))} style={{ width: 160 }} options={[
            { label: '全部状态', value: 'all' },
            { label: '待支付', value: 'pending' },
            { label: '已支付', value: 'paid' },
            { label: '退款相关', value: 'refund' },
            { label: '已退款', value: 'refunded' }
          ]} />
          <Select value={filters.productType} onChange={value => setFilters(prev => ({ ...prev, productType: value, page: 1 }))} style={{ width: 160 }} options={[
            { label: '全部商品类型', value: 'all' },
            { label: '实物', value: 'physical' },
            { label: '服务', value: 'service' },
            { label: '套餐', value: 'package' }
          ]} />
          <Select value={filters.source} onChange={value => setFilters(prev => ({ ...prev, source: value, page: 1 }))} style={{ width: 160 }} options={[
            { label: '全部来源', value: 'all' },
            { label: '自然到店', value: 'order' },
            { label: '裂变活动', value: 'fission' }
          ]} />
          <DatePicker.RangePicker
            value={filters.dateRange.length === 2 ? [dayjs(filters.dateRange[0]), dayjs(filters.dateRange[1])] : null}
            onChange={values => setFilters(prev => ({
              ...prev,
              page: 1,
              dateRange: values ? values.map(item => item?.format('YYYY-MM-DD') || '') : []
            }))}
          />
          <Input.Search
            allowClear
            placeholder="搜索订单号、商品、用户、手机号"
            style={{ width: 320 }}
            onSearch={value => setFilters(prev => ({ ...prev, keyword: value, page: 1 }))}
          />
        </Space>

        <Table
          rowKey="_id"
          loading={ordersQuery.isLoading}
          dataSource={ordersQuery.data?.list || []}
          columns={columns}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: ordersQuery.data?.total || 0,
            onChange: (page, pageSize) => setFilters(prev => ({ ...prev, page, pageSize }))
          }}
          scroll={{ x: 1280 }}
        />
      </Card>

      <Drawer
        title="订单详情"
        width={820}
        open={Boolean(activeOrderId)}
        onClose={() => setActiveOrderId('')}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="订单号">{detailQuery.data?.orderNo}</Descriptions.Item>
            <Descriptions.Item label="订单状态">{detailQuery.data?.statusLabel}</Descriptions.Item>
            <Descriptions.Item label="用户">{detailQuery.data?.userLabel}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detailQuery.data?.userPhone || '未留手机号'}</Descriptions.Item>
            <Descriptions.Item label="订单来源">{detailQuery.data?.leadSourceLabel}</Descriptions.Item>
            <Descriptions.Item label="支付金额">{detailQuery.data ? `¥${detailQuery.data.totalAmountYuan}` : '-'}</Descriptions.Item>
          </Descriptions>

          <Card className="panel-card" title="商品明细" bordered={false}>
            <Table
              rowKey={record => String(record._id)}
              pagination={false}
              dataSource={(detailQuery.data as OrderDetail | undefined)?.items || []}
              columns={[
                { title: '商品', dataIndex: 'productName' },
                { title: '类型', dataIndex: 'productType', width: 100 },
                { title: '数量', dataIndex: 'quantity', width: 90 },
                { title: '单价', dataIndex: 'price', width: 120, render: value => formatMoneyCent(Number(value || 0)) },
                { title: '小计', dataIndex: 'totalAmount', width: 120, render: value => formatMoneyCent(Number(value || 0)) },
                {
                  title: '核销码',
                  dataIndex: 'verifyCode',
                  width: 140,
                  render: (value: string | undefined) => value || '-'
                },
                {
                  title: '剩余次数',
                  width: 220,
                  render: (_: unknown, record: OrderItemDetail) => getRemainingCountText(record)
                },
                {
                  title: '有效期',
                  dataIndex: 'packageExpireAt',
                  width: 170,
                  render: (value: unknown) => getExpireAtText(value)
                },
                {
                  title: '使用状态',
                  width: 120,
                  render: (_: unknown, record: OrderItemDetail) => {
                    const status = getVerificationStatusTag(record)
                    return <Tag color={status.color}>{status.label}</Tag>
                  }
                }
              ]}
              scroll={{ x: 1380 }}
            />
          </Card>

          {(detailQuery.data as OrderDetail | undefined)?.refundTimeline?.length ? (
            <Card className="panel-card" title="退款时间线" bordered={false}>
              <Timeline
                items={detailQuery.data!.refundTimeline.map(item => ({
                  children: (
                    <div>
                      <div>{item.label}</div>
                      <Typography.Text type="secondary">{item.note}</Typography.Text>
                    </div>
                  ),
                  label: item.at ? dayjs(item.at as string).format('YYYY-MM-DD HH:mm') : ''
                }))}
              />
            </Card>
          ) : null}

          {(detailQuery.data as OrderDetail | undefined)?.verificationRecords?.length ? (
            <Card className="panel-card" title="履约记录" bordered={false}>
              <Table
                rowKey={record => record.usageId}
                pagination={false}
                dataSource={detailQuery.data!.verificationRecords || []}
                columns={[
                  {
                    title: '核销时间',
                    dataIndex: 'createdAtText',
                    width: 170
                  },
                  {
                    title: '服务项目',
                    dataIndex: 'serviceName',
                    width: 180,
                    render: (value: string) => value || '未命名服务'
                  },
                  {
                    title: '核销码',
                    dataIndex: 'verifyCode',
                    width: 140
                  },
                  {
                    title: '操作人',
                    dataIndex: 'operatorOpenid',
                    width: 180,
                    render: (value: string) => value || '系统'
                  },
                  {
                    title: '当前状态',
                    width: 120,
                    render: (_: unknown, record: NonNullable<OrderDetail['verificationRecords']>[number]) => (
                      <Tag color={record.verificationStatus === 'verified' ? 'green' : record.verificationStatus === 'expired' ? 'red' : 'orange'}>
                        {record.verificationStatusLabel || record.verificationStatus}
                      </Tag>
                    )
                  }
                ]}
                scroll={{ x: 980 }}
              />
            </Card>
          ) : null}
        </Space>
      </Drawer>
    </div>
  )
}
