import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Card, Descriptions, Drawer, Form, Input, message, Select, Space, Table, Tag, Timeline, Typography } from 'antd'
import dayjs from 'dayjs'
import { useOutletContext } from 'react-router-dom'
import { adminApi } from '../lib/admin-api'
import type { CustomerDetail, CustomerRecord, AdminSession, CustomerUpdatePayload, CustomerTongueReport } from '../types/admin'

interface AdminOutletContext {
  session: AdminSession
}

const MEMBER_LEVEL_OPTIONS = [
  { value: 'normal', label: '普通会员' },
  { value: 'vip', label: 'VIP' },
  { value: 'svip', label: 'SVIP' }
]

function formatDateTime(value: unknown) {
  return value ? dayjs(String(value)).format('YYYY-MM-DD HH:mm') : '-'
}

function loginStatusTagProps(loginStatus: string) {
  if (loginStatus === 'active') {
    return { color: 'green', text: '在线' }
  }
  if (loginStatus === 'never') {
    return { color: 'default', text: '未登录' }
  }
  return { color: 'orange', text: '未活跃' }
}

function parseTagText(value?: string | string[]) {
  const source = Array.isArray(value) ? value.join(',') : String(value || '')
  return source
    .split(/[，,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function renderTagList(tags: string[] = [], max = 3) {
  if (!tags.length) return <span>未设置</span>
  const visible = tags.slice(0, max)
  return (
    <Space size={[0, 8]} wrap>
      {visible.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      {tags.length > max ? <Tag>+{tags.length - max}</Tag> : null}
    </Space>
  )
}

export function CustomersPage() {
  const { session } = useOutletContext<AdminOutletContext>()
  const canManage = session.permissions.includes('crm.manage')
  const queryClient = useQueryClient()

  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [activeOpenid, setActiveOpenid] = useState('')
  const [editForm] = Form.useForm<CustomerUpdatePayload>()
  const [isEditing, setIsEditing] = useState(false)
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

  const updateMutation = useMutation({
    mutationFn: (payload: CustomerUpdatePayload) => adminApi.updateCustomer(payload),
    onSuccess: () => {
      message.success('更新成功')
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['customer-detail', activeOpenid] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: Error) => {
      message.error(err.message || '更新失败')
    }
  })

  const detail = detailQuery.data as CustomerDetail | undefined
  const loginTag = loginStatusTagProps(detail?.loginStatus || '')

  const handleOpenDetail = useCallback((openid: string) => {
    setActiveOpenid(openid)
    setIsEditing(false)
    editForm.resetFields()
  }, [editForm])

  const columns = useMemo(() => [
    {
      title: '用户',
      render: (_: unknown, record: CustomerRecord) => (
        <Space>
          <Avatar src={record.avatarUrl} size="small" />
          <span>{record.nickName || '匿名用户'}</span>
        </Space>
      )
    },
    {
      title: '手机号',
      width: 180,
      render: (_: unknown, record: CustomerRecord) => (
        <Space>
          <span>{record.phone || '-'}</span>
          {record.phoneBound ? <Tag color="success">已绑定</Tag> : <Tag>未绑定</Tag>}
        </Space>
      )
    },
    {
      title: '登录状态',
      width: 110,
      render: (_: unknown, record: CustomerRecord) => {
        const props = loginStatusTagProps(record.loginStatus)
        return <Tag color={props.color}>{props.text}</Tag>
      }
    },
    { title: '会员等级', dataIndex: 'memberLevelLabel', width: 100 },
    {
      title: 'AI舌象',
      width: 150,
      render: (_: unknown, record: CustomerRecord) => (
        <Space direction="vertical" size={0}>
          <span>调用：{record.tongueCount || 0} 次</span>
          <span style={{ color: '#666' }}>{record.lastTongueAt ? `最近：${formatDateTime(record.lastTongueAt)}` : '未检测'}</span>
        </Space>
      )
    },
    {
      title: '负责人',
      dataIndex: 'memberOwnerStaffName',
      width: 120,
      render: (value: string) => value || '-'
    },
    {
      title: '跟进',
      width: 140,
      render: (_: unknown, record: CustomerRecord) => (
        <Space direction="vertical" size={0}>
          <Tag color="processing">{record.followupStatusLabel}</Tag>
          <span style={{ color: '#666' }}>
            {record.followupLastAt ? formatDateTime(record.followupLastAt) : '未跟进'}
          </span>
        </Space>
      )
    },
    { title: '注册时间', dataIndex: 'createdAt', width: 170, render: formatDateTime },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: CustomerRecord) => (
        <Button size="small" onClick={() => handleOpenDetail(record._openid)}>详情</Button>
      )
    }
  ], [handleOpenDetail])

  const handleClose = () => {
    setActiveOpenid('')
    setIsEditing(false)
    editForm.resetFields()
  }

  const handleStartEdit = () => {
    if (!detail) return
    editForm.setFieldsValue({
      openid: detail._openid,
      memberLevel: detail.memberLevel,
      memberNote: detail.memberNote,
      memberTags: detail.memberTagsText,
      memberOwnerStaffOpenid: detail.memberOwnerStaffOpenid,
      memberOwnerStaffName: detail.memberOwnerStaffName
    })
    setIsEditing(true)
  }

  const handleSave = async () => {
    const values = await editForm.validateFields()
    updateMutation.mutate({
      openid: activeOpenid,
      memberLevel: values.memberLevel || '',
      memberNote: values.memberNote || '',
      memberTags: parseTagText(values.memberTags || ''),
      memberOwnerStaffOpenid: values.memberOwnerStaffOpenid || '',
      memberOwnerStaffName: values.memberOwnerStaffName || ''
    })
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">CUSTOMER CENTER</div>
          <Typography.Title level={2}>客户与运营中心</Typography.Title>
          <Typography.Paragraph>
            查看小程序注册用户、登录状态、AI舌象行为与跟进信息，并支持会员标签与运营信息维护。
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="panel-card" bordered={false}>
        <Space wrap className="filter-bar">
          <Input.Search
            allowClear
            placeholder="搜索昵称、手机号、OpenID、负责人、标签"
            style={{ width: 360 }}
            onSearch={value => {
              setKeyword(value)
              setPage(1)
            }}
          />
        </Space>
        <Table<CustomerRecord>
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
          scroll={{ x: 1220 }}
        />
      </Card>

      <Drawer
        title="客户详情"
        width={820}
        open={Boolean(activeOpenid)}
        onClose={handleClose}
        destroyOnClose
        extra={
          canManage && (
            isEditing ? (
              <Space>
                <Button onClick={() => setIsEditing(false)}>取消</Button>
                <Button type="primary" loading={updateMutation.isPending} onClick={handleSave}>保存</Button>
              </Space>
            ) : (
              <Button onClick={handleStartEdit}>编辑资料</Button>
            )
          )
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {isEditing ? (
            <Form form={editForm} layout="vertical">
              <Form.Item name="openid" hidden>
                <Input disabled />
              </Form.Item>
              <Form.Item name="memberLevel" label="会员等级" rules={[{ required: true }]}>
                <Select options={MEMBER_LEVEL_OPTIONS} />
              </Form.Item>
              <Form.Item name="memberTags" label="会员标签">
                <Input.TextArea rows={2} placeholder="中文逗号、英文逗号或换行分隔，如：高频回访, 重点育儿, 复购客户" />
              </Form.Item>
              <Form.Item name="memberOwnerStaffOpenid" label="负责人OpenID">
                <Input placeholder="可从门店员工OpenID中选择" />
              </Form.Item>
              <Form.Item name="memberOwnerStaffName" label="负责人姓名">
                <Input placeholder="可选：用于列表展示（未设置自动根据OpenID回填）" />
              </Form.Item>
              <Form.Item name="memberNote" label="备注">
                <Input.TextArea rows={3} placeholder="可填写客户偏好、跟进要点等" />
              </Form.Item>
            </Form>
          ) : (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="昵称">{detail?.nickName || '-'}</Descriptions.Item>
              <Descriptions.Item label="手机号">
                <Space>
                  {detail?.phone || '-'}
                  {detail?.phoneBound ? <Tag color="success">已绑定</Tag> : <Tag>未绑定</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="会员等级">
                <Tag color={detail?.memberLevel === 'vip' ? 'gold' : detail?.memberLevel === 'svip' ? 'red' : 'default'}>
                  {detail?.memberLevelLabel || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="登录状态">
                <Tag color={loginTag.color}>{loginTag.text}</Tag>
                <span style={{ marginLeft: 8 }}>{detail?.lastLoginAt ? `最近登录：${formatDateTime(detail.lastLoginAt)}` : '未登录'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="AI舌象行为">
                <div>累计{detail?.tongueCount || 0}次</div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  {detail?.lastTongueAt ? `最后一次：${formatDateTime(detail.lastTongueAt)}` : '未检测'}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="余额">¥{detail?.balanceYuan || '0.00'}</Descriptions.Item>
              <Descriptions.Item label="累计赚取">¥{detail?.totalEarnedYuan || '0.00'}</Descriptions.Item>
              <Descriptions.Item label="累计邀请">{detail?.totalInvited || 0}</Descriptions.Item>
              <Descriptions.Item label="会员标签" span={2}>
                {renderTagList(detail?.memberTags || [])}
              </Descriptions.Item>
              <Descriptions.Item label="负责人">
                {detail?.memberOwnerStaffName || '-'}
                <Typography.Text type="secondary"> {detail?.memberOwnerStaffOpenid || ''}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="最近跟进">
                <div>{detail?.followupStatusLabel || '未跟进'}</div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  {detail?.followupLastAt ? `${formatDateTime(detail.followupLastAt)} · ${detail.followupLastNote || '无备注'}` : '未跟进'}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{detail?.memberNote || '-'}</Descriptions.Item>
            </Descriptions>
          )}

          <Card className="panel-card" title="AI舌象记录" bordered={false}>
            <Table<CustomerTongueReport>
              rowKey="_id"
              pagination={false}
              dataSource={detail?.recentTongueReports || []}
              columns={[
                { title: '时间', dataIndex: 'createdAt', width: 170, render: (value: unknown) => formatDateTime(value) },
                {
                  title: '类型',
                  dataIndex: 'isReviewMode',
                  width: 90,
                  render: (value: boolean) => value ? <Tag color="purple">复核</Tag> : <Tag>识别</Tag>
                },
                { title: '结论', dataIndex: 'conclusion', width: 220 },
                {
                  title: '分析摘要',
                  dataIndex: 'analysisDetails',
                  render: (text: string) => text ? <Typography.Text ellipsis>{text}</Typography.Text> : '未提炼'
                }
              ]}
            />
          </Card>

          <Card className="panel-card" title="最近订单" bordered={false}>
            <Table
              rowKey="_id"
              pagination={false}
              dataSource={detail?.recentOrders || []}
              columns={[
                { title: '订单号', dataIndex: 'orderNo' },
                { title: '金额', dataIndex: 'totalAmountYuan', width: 120, render: (v: string) => `¥${v}` },
                { title: '状态', dataIndex: 'statusLabel', width: 120 },
                { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: unknown) => formatDateTime(v) }
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
                label: item.updatedAt ? formatDateTime(item.updatedAt) : ''
              }))}
            />
          </Card>
        </Space>
      </Drawer>
    </div>
  )
}
