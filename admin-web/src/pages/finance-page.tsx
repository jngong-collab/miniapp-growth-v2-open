import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, DatePicker, Input, Space, Statistic, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import type { PaymentRecord, RefundRecord } from '../types/admin'

export function FinancePage() {
  const [dateRange, setDateRange] = useState<string[]>([])
  const [paymentKeyword, setPaymentKeyword] = useState('')
  const [refundKeyword, setRefundKeyword] = useState('')
  const [paymentPage, setPaymentPage] = useState(1)
  const [refundPage, setRefundPage] = useState(1)
  const pageSize = 20

  const summaryQuery = useQuery({
    queryKey: ['finance-summary', dateRange],
    queryFn: () => adminApi.getReconciliationSummary(dateRange)
  })

  const paymentQuery = useQuery({
    queryKey: ['finance-payments', paymentKeyword, dateRange, paymentPage],
    queryFn: () => adminApi.listPaymentRecords({ keyword: paymentKeyword, dateRange, page: paymentPage, pageSize })
  })

  const refundQuery = useQuery({
    queryKey: ['finance-refunds', refundKeyword, dateRange, refundPage],
    queryFn: () => adminApi.listRefundRecords({ keyword: refundKeyword, dateRange, page: refundPage, pageSize })
  })

  const summary = summaryQuery.data

  const paymentColumns = useMemo(() => [
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    {
      title: '用户 / 联系方式',
      render: (_: unknown, record: PaymentRecord) => (
        <div>
          <div>{record.userLabel}</div>
          <Typography.Text type="secondary">{record.userPhone || '未留手机号'}</Typography.Text>
        </div>
      )
    },
    { title: '微信支付单号', dataIndex: 'paymentId', width: 220 },
    { title: '实付金额', dataIndex: 'payAmountYuan', width: 120, render: (v: string) => `¥${v}` },
    { title: '余额抵扣', dataIndex: 'balanceUsedYuan', width: 120, render: (v: string) => `¥${v}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: string) => {
        const color = status === 'refunded' ? 'default' : status === 'refunding' || status === 'refund_requested' ? 'orange' : 'green'
        const label = status === 'paid' ? '已支付' : status === 'completed' ? '已完成' : status === 'refund_requested' ? '退款申请中' : status === 'refunding' ? '退款处理中' : status === 'refunded' ? '已退款' : status
        return <Tag color={color}>{label}</Tag>
      }
    },
    { title: '支付时间', dataIndex: 'paidAt', width: 170, render: (v: unknown) => v ? dayjs(String(v)).format('YYYY-MM-DD HH:mm') : '-' }
  ], [])

  const refundColumns = useMemo(() => [
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    {
      title: '用户 / 联系方式',
      render: (_: unknown, record: RefundRecord) => (
        <div>
          <div>{record.userLabel}</div>
          <Typography.Text type="secondary">{record.userPhone || '未留手机号'}</Typography.Text>
        </div>
      )
    },
    { title: '退款金额', dataIndex: 'refundAmountYuan', width: 120, render: (v: string) => `¥${v}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: string) => {
        const color = status === 'refunded' ? 'green' : status === 'rejected' ? 'red' : 'orange'
        const label = status === 'pending' ? '待处理' : status === 'refunding' ? '退款中' : status === 'refunded' ? '已退款' : status === 'rejected' ? '已驳回' : status
        return <Tag color={color}>{label}</Tag>
      }
    },
    { title: '退款原因', dataIndex: 'reason', ellipsis: true },
    { title: '微信退款单号', dataIndex: 'outRefundNo', width: 220 },
    { title: '申请时间', dataIndex: 'createdAt', width: 170, render: (v: unknown) => v ? dayjs(String(v)).format('YYYY-MM-DD HH:mm') : '-' }
  ], [])

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">FINANCE CENTER</div>
          <Typography.Title level={2}>财务与对账中心</Typography.Title>
          <Typography.Paragraph>
            查看支付流水、退款流水与对账汇总，支持按日期范围筛选。
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="panel-card" title="对账概览" bordered={false}>
        <Space wrap className="filter-bar">
          <DatePicker.RangePicker
            value={dateRange.length === 2 ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
            onChange={values => {
              const next = values ? values.map(item => item?.format('YYYY-MM-DD') || '') : []
              setDateRange(next)
              setPaymentPage(1)
              setRefundPage(1)
            }}
          />
        </Space>
        <Space size="large" wrap style={{ marginTop: 16 }}>
          <Statistic title="GMV（元）" value={summary?.gmvYuan || '0.00'} />
          <Statistic title="净收入（元）" value={summary?.netRevenueYuan || '0.00'} />
          <Statistic title="退款总额（元）" value={summary?.refundTotalYuan || '0.00'} />
          <Statistic title="订单数" value={summary?.orderCount || 0} />
          <Statistic title="退款笔数" value={summary?.refundCount || 0} />
        </Space>
      </Card>

      <Card className="panel-card" title="支付流水" bordered={false}>
        <Space wrap className="filter-bar">
          <Input.Search
            allowClear
            placeholder="搜索订单号、用户、手机号、支付单号"
            style={{ width: 320 }}
            onSearch={value => { setPaymentKeyword(value); setPaymentPage(1) }}
          />
        </Space>
        <Table
          rowKey="orderId"
          loading={paymentQuery.isLoading}
          dataSource={paymentQuery.data?.list || []}
          columns={paymentColumns}
          pagination={{
            current: paymentPage,
            pageSize,
            total: paymentQuery.data?.total || 0,
            onChange: setPaymentPage
          }}
          scroll={{ x: 1280 }}
        />
      </Card>

      <Card className="panel-card" title="退款流水" bordered={false}>
        <Space wrap className="filter-bar">
          <Input.Search
            allowClear
            placeholder="搜索订单号、用户、手机号、退款原因"
            style={{ width: 320 }}
            onSearch={value => { setRefundKeyword(value); setRefundPage(1) }}
          />
        </Space>
        <Table
          rowKey="requestId"
          loading={refundQuery.isLoading}
          dataSource={refundQuery.data?.list || []}
          columns={refundColumns}
          pagination={{
            current: refundPage,
            pageSize,
            total: refundQuery.data?.total || 0,
            onChange: setRefundPage
          }}
          scroll={{ x: 1280 }}
        />
      </Card>
    </div>
  )
}
