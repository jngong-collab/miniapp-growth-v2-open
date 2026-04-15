import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Card, Descriptions, Drawer, Input, Space, Table, Tag, Timeline, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import type { CustomerDetail, CustomerRecord } from '../types/admin'

export function CustomersPage() {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [activeOpenid, setActiveOpenid] = useState('')
  const pageSize = 20

  const listQuery = useQuery({
    queryKey: ['customers', keyword, page],
    queryFn: () => adminApi.listCustomers({ keyword, page, pageSize })
  })

  const detailQuery = useQuery({
    queryKey: ['customer-detail', activeOpenid],
    queryFn: () => adminApi.getCustomerDetail(activeOpenid),
    enabled: Boolean(activeOpenid)
  })

  const columns = [
    {
      title: '用户',
      render: (_: unknown, record: CustomerRecord) => (
        <Space>
          <Avatar src={record.avatarUrl} size="small" />
          <span>{record.nickName || '匿名用户'}</span>
        </Space>
      )
    },
    { title: '手机号', dataIndex: 'phone', width: 140 },
    { title: '会员等级', dataIndex: 'memberLevelLabel', width: 120 },
    { title: '余额', dataIndex: 'balanceYuan', width: 120, render: (v: string) => `¥${v}` },
    { title: '累计邀请', dataIndex: 'totalInvited', width: 100 },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: unknown) => v ? dayjs(String(v)).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: CustomerRecord) => (
        <Button size="small" onClick={() => setActiveOpenid(record._openid)}>详情</Button>
      )
    }
  ]

  const detail = detailQuery.data as CustomerDetail | undefined

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">CUSTOMER CENTER</div>
          <Typography.Title level={2}>客户与运营中心</Typography.Title>
          <Typography.Paragraph>
            查看小程序注册用户、余额、会员等级，以及最近订单和跟进时间轴。
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="panel-card" bordered={false}>
        <Space wrap className="filter-bar">
          <Input.Search
            allowClear
            placeholder="搜索昵称、手机号、OpenID"
            style={{ width: 320 }}
            onSearch={value => { setKeyword(value); setPage(1) }}
          />
        </Space>
        <Table
          rowKey="_openid"
          loading={listQuery.isLoading}
          dataSource={listQuery.data?.list || []}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total: listQuery.data?.total || 0,
            onChange: setPage
          }}
          scroll={{ x: 980 }}
        />
      </Card>

      <Drawer
        title="客户详情"
        width={760}
        open={Boolean(activeOpenid)}
        onClose={() => setActiveOpenid('')}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="昵称">{detail?.nickName || '-'}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detail?.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="会员等级">
              <Tag color={detail?.memberLevel === 'vip' ? 'gold' : 'default'}>{detail?.memberLevelLabel || '-'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="余额">¥{detail?.balanceYuan || '0.00'}</Descriptions.Item>
            <Descriptions.Item label="累计赚取">¥{detail?.totalEarnedYuan || '0.00'}</Descriptions.Item>
            <Descriptions.Item label="累计邀请">{detail?.totalInvited || 0}</Descriptions.Item>
          </Descriptions>

          <Card className="panel-card" title="最近订单" bordered={false}>
            <Table
              rowKey="_id"
              pagination={false}
              dataSource={detail?.recentOrders || []}
              columns={[
                { title: '订单号', dataIndex: 'orderNo' },
                { title: '金额', dataIndex: 'totalAmountYuan', width: 120, render: (v: string) => `¥${v}` },
                { title: '状态', dataIndex: 'statusLabel', width: 120 },
                { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: unknown) => v ? dayjs(String(v)).format('YYYY-MM-DD HH:mm') : '-' }
              ]}
            />
          </Card>

          <Card className="panel-card" title="跟进时间轴" bordered={false}>
            <Timeline
              items={(detail?.followupEvents || []).map(item => ({
                children: (
                  <div>
                    <div>{item.statusLabel} {item.operatorName ? `· ${item.operatorName}` : ''}</div>
                    <Typography.Text type="secondary">{item.note || '无备注'}</Typography.Text>
                  </div>
                ),
                label: item.updatedAt ? dayjs(String(item.updatedAt)).format('YYYY-MM-DD HH:mm') : ''
              }))}
            />
          </Card>
        </Space>
      </Drawer>
    </div>
  )
}
