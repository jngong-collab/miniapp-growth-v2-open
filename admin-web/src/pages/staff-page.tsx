import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import type {
  AdminAccount,
  AdminAccountForm,
  AdminAccountStatus,
  PermissionKey,
  StaffRecord
} from '../types/admin'

const miniappPermissionOptions = [
  { label: '核销服务', value: 'verify' },
  { label: '查看订单', value: 'viewOrders' },
  { label: '数据看板', value: 'viewDashboard' },
  { label: '管理商品', value: 'manageProducts' },
  { label: '管理活动', value: 'manageCampaigns' },
  { label: '门店设置', value: 'manageSettings' },
  { label: '员工管理', value: 'manageStaff' }
]

const adminPermissionOptions: Array<{ label: string; value: PermissionKey }> = [
  { label: '看板查看', value: 'dashboard.view' },
  { label: '订单查看', value: 'orders.view' },
  { label: '退款审核', value: 'orders.refund.review' },
  { label: '商品管理', value: 'catalog.manage' },
  { label: '活动管理', value: 'campaigns.manage' },
  { label: '客户查看（只读）', value: 'crm.view' },
  { label: '客户管理（可编辑）', value: 'crm.manage' },
  { label: '门店设置', value: 'settings.manage' },
  { label: '员工管理', value: 'staff.manage' },
  { label: '审计查看', value: 'audit.view' }
]

const adminStatusOptions: Array<{ label: string; value: AdminAccountStatus }> = [
  { label: '待激活', value: 'pending_activation' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' }
]

type RolePermissionFormValues = {
  role: string
  permissions: PermissionKey[]
}

function formatDateTime(value: unknown, fallback = '未记录') {
  if (!value) return fallback
  const parsed = dayjs(value as string)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : fallback
}

function renderPermissionTags(permissions: readonly string[]) {
  if (!permissions.length) {
    return <Typography.Text type="secondary">未分配</Typography.Text>
  }
  return (
    <Space size={[0, 8]} wrap>
      {permissions.map(item => <Tag key={item}>{item}</Tag>)}
    </Space>
  )
}

function renderAccountStatus(status: AdminAccountStatus) {
  if (status === 'active') return <Tag color="success">启用</Tag>
  if (status === 'disabled') return <Tag color="error">停用</Tag>
  return <Tag color="processing">待激活</Tag>
}

function renderLoginResult(result: string) {
  return result === 'success'
    ? <Tag color="success">成功</Tag>
    : <Tag color="error">{result || '失败'}</Tag>
}

function getNextAccountStatus(status: AdminAccountStatus): AdminAccountStatus {
  return status === 'active' ? 'disabled' : 'active'
}

export function StaffPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [permForm] = Form.useForm<{ permissions: string[] }>()
  const [accountForm] = Form.useForm<AdminAccountForm>()
  const [adminPermForm] = Form.useForm<{ role: string; permissions: PermissionKey[] }>()
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null)
  const [editingAdminAccount, setEditingAdminAccount] = useState<AdminAccount | null>(null)
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false)

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: adminApi.listStaff })
  const adminAccountsQuery = useQuery({ queryKey: ['admin-accounts'], queryFn: adminApi.listAdminAccounts })
  const roleTemplatesQuery = useQuery({ queryKey: ['role-templates'], queryFn: adminApi.listRoleTemplates })
  const loginEventsQuery = useQuery({ queryKey: ['admin-login-events'], queryFn: () => adminApi.listAdminLoginEvents(1, 30) })
  const auditLogsQuery = useQuery({ queryKey: ['audit-logs'], queryFn: () => adminApi.listAuditLogs(1, 30) })

  const refreshConsoleData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-login-events'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    ])
  }

  const updatePermMutation = useMutation({
    mutationFn: (values: { permissions: string[] }) =>
      adminApi.updateMiniappStaffPermissions(String(editingStaff?.openid || ''), values.permissions),
    onSuccess: async () => {
      message.success('员工权限已更新')
      setEditingStaff(null)
      permForm.resetFields()
      await refreshConsoleData()
    },
    onError: (error: Error) => message.error(error.message)
  })

  const createAdminAccountMutation = useMutation({
    mutationFn: (values: AdminAccountForm) => adminApi.createAdminAccount(values),
    onSuccess: async created => {
      message.success(created.uid ? '后台账号已创建' : '后台账号已创建，待绑定登录 UID 后可启用')
      setAccountDrawerOpen(false)
      accountForm.resetFields()
      await refreshConsoleData()
    },
    onError: (error: Error) => message.error(error.message)
  })

  const updateAdminStatusMutation = useMutation({
    mutationFn: (values: { uid: string; status: AdminAccountStatus }) =>
      adminApi.updateAdminAccountStatus(values.uid, values.status),
    onSuccess: async (_, variables) => {
      message.success(variables.status === 'active' ? '后台账号已启用' : '后台账号已停用')
      await refreshConsoleData()
    },
    onError: (error: Error) => message.error(error.message)
  })

  const updateAdminPermissionsMutation = useMutation({
    mutationFn: (values: { uid: string; role: string; permissions: PermissionKey[] }) =>
      adminApi.updateAdminAccountPermissions(values.uid, values.permissions, values.role),
    onSuccess: async () => {
      message.success('后台账号权限已更新')
      setEditingAdminAccount(null)
      adminPermForm.resetFields()
      await refreshConsoleData()
    },
    onError: (error: Error) => message.error(error.message)
  })

  const roleTemplateOptions = (roleTemplatesQuery.data || []).map(template => ({
    label: `${template.roleName} (${template.roleKey})`,
    value: template.roleKey
  }))

  const applyRoleTemplate = (
    roleKey: string,
    form: { setFieldsValue: (values: Partial<RolePermissionFormValues>) => void }
  ) => {
    const selected = roleTemplatesQuery.data?.find(template => template.roleKey === roleKey)
    if (!selected) return
    form.setFieldsValue({
      role: selected.roleKey,
      permissions: selected.permissions
    })
  }

  const openCreateAdminDrawer = () => {
    accountForm.setFieldsValue({
      uid: '',
      username: '',
      displayName: '',
      role: 'operator',
      permissions: [],
      status: 'pending_activation'
    })
    setAccountDrawerOpen(true)
  }

  const openAdminPermissionDrawer = (record: AdminAccount) => {
    setEditingAdminAccount(record)
    adminPermForm.setFieldsValue({
      role: record.role,
      permissions: record.permissions
    })
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">ADMIN IDENTITY</div>
          <Typography.Title level={2}>后台身份与员工权限</Typography.Title>
          <Typography.Paragraph>
            管理后台账号生命周期、角色模板、登录日志，同时保留小程序员工权限与最近审计日志视图。
            当前界面仅维护后台账号记录和权限，不提供密码重置或实际 CloudBase 用户开通。
          </Typography.Paragraph>
        </div>
      </div>

      <Card
        className="panel-card"
        title="后台账号管理"
        bordered={false}
        extra={<Button type="primary" onClick={openCreateAdminDrawer}>创建后台账号</Button>}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="要启用后台账号，必须先绑定登录 UID。未绑定 UID 的记录只能作为待激活账号占位。"
        />
        <Table
          rowKey={record => record._id || record.uid || record.username}
          loading={adminAccountsQuery.isLoading}
          dataSource={adminAccountsQuery.data || []}
          pagination={false}
          columns={[
            { title: '显示名', dataIndex: 'displayName', width: 140 },
            { title: '用户名', dataIndex: 'username', width: 160 },
            {
              title: '登录 UID',
              dataIndex: 'uid',
              width: 180,
              render: value => value || <Typography.Text type="secondary">待绑定</Typography.Text>
            },
            { title: '角色', dataIndex: 'role', width: 120 },
            {
              title: '权限',
              dataIndex: 'permissions',
              render: permissions => renderPermissionTags(permissions || [])
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: value => renderAccountStatus(value)
            },
            {
              title: '最近登录',
              dataIndex: 'lastLoginAt',
              width: 160,
              render: value => formatDateTime(value, '未登录')
            },
            {
              title: '操作',
              width: 220,
              render: (_, record) => (
                <Space wrap>
                  <Button
                    size="small"
                    onClick={() => openAdminPermissionDrawer(record)}
                    disabled={!record.uid}
                  >
                    调整权限
                  </Button>
                  <Button
                    size="small"
                    onClick={() => updateAdminStatusMutation.mutate({
                      uid: record.uid,
                      status: getNextAccountStatus(record.status)
                    })}
                    disabled={!record.uid || updateAdminStatusMutation.isPending}
                  >
                    {record.status === 'active' ? '停用' : '启用'}
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card className="panel-card" title="角色模板" bordered={false}>
        <Table
          rowKey={record => record._id || record.roleKey}
          loading={roleTemplatesQuery.isLoading}
          dataSource={roleTemplatesQuery.data || []}
          pagination={false}
          columns={[
            { title: '模板名', dataIndex: 'roleName', width: 180 },
            { title: '角色键', dataIndex: 'roleKey', width: 160 },
            {
              title: '来源',
              width: 120,
              render: (_, record) => record.isSystem
                ? <Tag color="blue">系统模板</Tag>
                : <Tag color="default">门店模板</Tag>
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: value => value || 'active'
            },
            {
              title: '权限',
              dataIndex: 'permissions',
              render: permissions => renderPermissionTags(permissions || [])
            }
          ]}
        />
      </Card>

      <Card className="panel-card" title="登录日志" bordered={false}>
        <Table
          rowKey={record => record._id || `${record.uid}-${String(record.createdAt || '')}`}
          loading={loginEventsQuery.isLoading}
          dataSource={loginEventsQuery.data?.list || []}
          pagination={false}
          columns={[
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 160,
              render: value => formatDateTime(value)
            },
            {
              title: '账号',
              width: 200,
              render: (_, record) => record.username || record.uid
            },
            {
              title: '事件',
              dataIndex: 'eventType',
              width: 160,
              render: value => value || 'login'
            },
            {
              title: '结果',
              dataIndex: 'result',
              width: 100,
              render: value => renderLoginResult(value)
            },
            {
              title: 'IP',
              dataIndex: 'ip',
              width: 160,
              render: value => value || '-'
            }
          ]}
        />
      </Card>

      <Card className="panel-card" title="小程序员工权限" bordered={false}>
        <Table
          rowKey="openid"
          loading={staffQuery.isLoading}
          dataSource={staffQuery.data || []}
          pagination={false}
          columns={[
            { title: '员工', dataIndex: 'name', width: 120 },
            { title: '手机号', dataIndex: 'phone', width: 160 },
            {
              title: '权限',
              render: (_, record) => renderPermissionTags(record.permissions || [])
            },
            {
              title: '操作',
              width: 100,
              render: (_, record) => (
                <Button
                  size="small"
                  onClick={() => {
                    setEditingStaff(record)
                    permForm.setFieldsValue({ permissions: record.permissions || [] })
                  }}
                >
                  编辑权限
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Card className="panel-card" title="最近审计日志" bordered={false}>
        <Table
          rowKey={record => record._id || `${record.action}-${String(record.createdAt || '')}`}
          loading={auditLogsQuery.isLoading}
          dataSource={auditLogsQuery.data?.list || []}
          pagination={false}
          columns={[
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 160,
              render: value => formatDateTime(value)
            },
            { title: '操作者', dataIndex: 'actorName', width: 120 },
            { title: '模块', dataIndex: 'module', width: 120 },
            { title: '动作', dataIndex: 'action', width: 220 },
            { title: '摘要', dataIndex: 'summary' }
          ]}
        />
      </Card>

      <Drawer
        title="创建后台账号"
        width={460}
        open={accountDrawerOpen}
        onClose={() => setAccountDrawerOpen(false)}
        destroyOnClose
      >
        <Form
          form={accountForm}
          layout="vertical"
          onFinish={values => createAdminAccountMutation.mutate({
            ...values,
            uid: values.uid?.trim() || undefined,
            username: values.username.trim(),
            displayName: values.displayName.trim()
          })}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="这里只维护后台账号记录。若没有现成的登录 UID，请先创建待激活账号，后续绑定 UID 后再启用。"
          />
          <Form.Item label="角色模板">
            <Select
              allowClear
              placeholder="按模板回填角色和权限"
              options={roleTemplateOptions}
              onChange={value => value && applyRoleTemplate(value, accountForm)}
            />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="例如 boss-demo" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input placeholder="例如 店长 / 运营负责人" />
          </Form.Item>
          <Form.Item name="uid" label="登录 UID">
            <Input placeholder="已有登录身份时填写，留空则创建为待激活账号" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Input placeholder="例如 owner / operator / finance" />
          </Form.Item>
          <Form.Item name="status" label="账号状态" rules={[{ required: true, message: '请选择账号状态' }]}>
            <Select options={adminStatusOptions} />
          </Form.Item>
          <Form.Item name="permissions" label="权限项" rules={[{ required: true, message: '请至少选择一个权限项' }]}>
            <Select mode="multiple" options={adminPermissionOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createAdminAccountMutation.isPending}>
            创建后台账号
          </Button>
        </Form>
      </Drawer>

      <Drawer
        title="调整后台账号权限"
        width={460}
        open={Boolean(editingAdminAccount)}
        onClose={() => setEditingAdminAccount(null)}
        destroyOnClose
      >
        <Form
          form={adminPermForm}
          layout="vertical"
          onFinish={values => updateAdminPermissionsMutation.mutate({
            uid: String(editingAdminAccount?.uid || ''),
            role: values.role.trim(),
            permissions: values.permissions
          })}
        >
          <Form.Item label="账号">
            <Typography.Text>
              {editingAdminAccount?.displayName || editingAdminAccount?.username}
            </Typography.Text>
          </Form.Item>
          <Form.Item label="角色模板">
            <Select
              allowClear
              placeholder="按模板覆盖角色和权限"
              options={roleTemplateOptions}
              onChange={value => value && applyRoleTemplate(value, adminPermForm)}
            />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请输入角色' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="permissions" label="权限项" rules={[{ required: true, message: '请至少选择一个权限项' }]}>
            <Select mode="multiple" options={adminPermissionOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={updateAdminPermissionsMutation.isPending}>
            保存后台权限
          </Button>
        </Form>
      </Drawer>

      <Drawer
        title="编辑员工权限"
        width={420}
        open={Boolean(editingStaff)}
        onClose={() => setEditingStaff(null)}
        destroyOnClose
      >
        <Form form={permForm} layout="vertical" onFinish={values => updatePermMutation.mutate(values)}>
          <Form.Item label="员工名称">
            <Typography.Text>{editingStaff?.name}</Typography.Text>
          </Form.Item>
          <Form.Item name="permissions" label="权限项" rules={[{ required: true, message: '请选择权限项' }]}>
            <Select mode="multiple" options={miniappPermissionOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={updatePermMutation.isPending}>
            保存权限
          </Button>
        </Form>
      </Drawer>
    </div>
  )
}
