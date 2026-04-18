import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card, Space, Statistic, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'


export function OpsPage() {
  const [auditPage, setAuditPage] = useState(1)
  const pageSize = 20

  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: adminApi.getSystemHealth
  })

  const auditQuery = useQuery({
    queryKey: ['audit-logs', auditPage],
    queryFn: () => adminApi.listAuditLogs(auditPage, pageSize)
  })

  const health = healthQuery.data

  const auditColumns = [
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: unknown) => v ? dayjs(String(v)).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '操作人', dataIndex: 'actorName', width: 140 },
    { title: '模块', dataIndex: 'module', width: 120 },
    { title: '动作', dataIndex: 'action', width: 180 },
    { title: '摘要', dataIndex: 'summary', ellipsis: true }
  ]

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">OPS CENTER</div>
          <Typography.Title level={2}>系统配置与运维中心</Typography.Title>
          <Typography.Paragraph>
            查看系统健康状态、最近审计日志，以及运维筛选入口。
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="panel-card" title="系统健康" bordered={false}>
        <Space size="large" wrap>
          <Statistic
            title="adminApi"
            valueRender={() => <Badge status={health?.adminApi === 'ok' ? 'success' : 'error'} text={health?.adminApi || 'unknown'} />}
          />
          <Statistic
            title="数据库"
            valueRender={() => <Badge status={health?.database === 'ok' ? 'success' : 'error'} text={health?.database || 'unknown'} />}
          />
          <Statistic
            title="云存储"
            valueRender={() => <Badge status={health?.storage === 'ok' ? 'success' : 'error'} text={health?.storage || 'unknown'} />}
          />
          <Statistic
            title="检测时间"
            value={health?.timestamp ? dayjs(String(health.timestamp)).format('YYYY-MM-DD HH:mm:ss') : '-'}
          />
        </Space>
      </Card>

      <Card className="panel-card" title="审计日志" bordered={false}>
        <Table
          rowKey="_id"
          loading={auditQuery.isLoading}
          dataSource={auditQuery.data?.list || []}
          columns={auditColumns}
          pagination={{
            current: auditPage,
            pageSize,
            total: auditQuery.data?.total || 0,
            onChange: setAuditPage
          }}
          scroll={{ x: 980 }}
        />
      </Card>
    </div>
  )
}
