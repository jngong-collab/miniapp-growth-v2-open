import { Card, Col, Row, Segmented, Table, Typography } from 'antd'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import * as echarts from 'echarts/core'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../lib/admin-api'
import { StatCard } from '../components/stat-card'

echarts.use([
  TooltipComponent,
  LegendComponent,
  GridComponent,
  LineChart,
  BarChart,
  CanvasRenderer
])

function formatMoney(fen: number) {
  return `¥${(Number(fen || 0) / 100).toFixed(2)}`
}

export function DashboardPage() {
  const [range, setRange] = useState<'7d' | '30d'>('7d')
  const navigate = useNavigate()
  const overviewQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: adminApi.getDashboardOverview
  })
  const trendsQuery = useQuery({
    queryKey: ['dashboard-trends', range],
    queryFn: () => adminApi.getDashboardTrends(range)
  })

  const metrics = overviewQuery.data?.metrics
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#5b4c45' } },
    xAxis: {
      type: 'category',
      data: (trendsQuery.data || []).map(item => item.label)
    },
    yAxis: [
      { type: 'value', name: '订单 / 线索' },
      { type: 'value', name: 'GMV', axisLabel: { formatter: (value: number) => `¥${value / 100}` } }
    ],
    series: [
      {
        name: '支付订单',
        type: 'line',
        smooth: true,
        data: (trendsQuery.data || []).map(item => item.orders)
      },
      {
        name: '线索数',
        type: 'bar',
        data: (trendsQuery.data || []).map(item => item.leads)
      },
      {
        name: 'GMV',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: (trendsQuery.data || []).map(item => item.gmv)
      }
    ]
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">OWNER OVERVIEW</div>
          <Typography.Title level={2}>经营看板</Typography.Title>
          <Typography.Paragraph>
            把过去 7 天和 30 天的成交、退款、裂变和线索集中在一个视图里。
          </Typography.Paragraph>
        </div>
        <Segmented
          options={[
            { label: '近 7 天', value: '7d' },
            { label: '近 30 天', value: '30d' }
          ]}
          value={range}
          onChange={value => setRange(value as '7d' | '30d')}
        />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><StatCard label="今日 GMV" value={formatMoney(metrics?.gmvToday || 0)} hint={`近 7 天 ${formatMoney(metrics?.gmv7d || 0)}`} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard label="近 30 天 GMV" value={formatMoney(metrics?.gmv30d || 0)} hint={`今日支付 ${metrics?.paidOrderToday || 0} 单`} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard label="待处理退款" value={String(metrics?.refundPending || 0)} hint={`退款链路中 ${metrics?.refundingCount || 0} 单`} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard label="线索转化率" value={`${metrics?.conversionRate7 || 0}%`} hint={`近 7 天线索 ${metrics?.leadEvents7 || 0}`} /></Col>
        <Col xs={24} md={12} xl={6}>
          <div
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/verification')}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                navigate('/verification')
              }
            }}
          >
            <StatCard label="待核销服务" value={String(metrics?.pendingVerifyCount || 0)} hint="点击进入网页核销台" />
          </div>
        </Col>
        <Col xs={24} md={12} xl={6}><StatCard label="裂变成交" value={String(metrics?.fissionPaid7 || 0)} hint="近 7 天裂变支付单" /></Col>
        <Col xs={24} md={12} xl={6}><StatCard label="客户总量" value={String(metrics?.customerCount || 0)} hint={`待跟进 ${metrics?.followupPending || 0}`} /></Col>
        <Col xs={24} md={12} xl={6}><StatCard label="近 7 天支付单" value={String(metrics?.paidOrder7d || 0)} hint="支付与完成订单汇总" /></Col>
      </Row>

      <Card className="panel-card" title="经营趋势" bordered={false} loading={overviewQuery.isLoading || trendsQuery.isLoading}>
        <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 360 }} />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="热销商品" bordered={false}>
            <Table
              pagination={false}
              rowKey="productId"
              dataSource={overviewQuery.data?.hotProducts || []}
              columns={[
                { title: '商品', dataIndex: 'productName' },
                { title: '销量', dataIndex: 'quantity', width: 90 },
                { title: 'GMV', dataIndex: 'revenue', render: value => formatMoney(value), width: 120 }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="裂变活动排行" bordered={false}>
            <Table
              pagination={false}
              rowKey="_id"
              dataSource={overviewQuery.data?.hotCampaigns || []}
              columns={[
                { title: '活动', dataIndex: 'name' },
                { title: '成交', dataIndex: 'soldCount', width: 90 },
                { title: '返现', dataIndex: 'totalCashback', render: value => formatMoney(value), width: 120 }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
