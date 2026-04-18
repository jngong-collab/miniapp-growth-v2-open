import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, DatePicker, Descriptions, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { adminApi } from '../lib/admin-api'
import type {
  VerificationLookup,
  VerificationQueueFilters,
  VerificationQueueItem,
  VerificationRecord,
  VerificationRecordFilters,
  VerificationUsageRecord
} from '../types/admin'

interface FeedbackState {
  type: 'success' | 'error' | 'info'
  message: string
  description?: string
}

interface PackageServiceOption {
  label: string
  value: string
  totalCount: number
  remainingCount: number | null
}

type VerificationProductFilter = 'all' | 'service' | 'package'
type VerificationStatusFilter = 'all' | 'pending' | 'unused' | 'partially_used' | 'expired'

const DEFAULT_PENDING_PAGE_SIZE = 10
const DEFAULT_RECORDS_PAGE_SIZE = 10

function formatDateRange(values: [dayjs.Dayjs, dayjs.Dayjs] | null) {
  if (!values) {
    return []
  }

  return values.map(item => item.format('YYYY-MM-DD'))
}

function parseDateRange(values?: string[]) {
  if (!values || values.length !== 2) {
    return null
  }

  const parsed = values.map(value => dayjs(value))
  return parsed.every(item => item.isValid()) ? [parsed[0], parsed[1]] as [dayjs.Dayjs, dayjs.Dayjs] : null
}

function normalizePendingFilters(filters: VerificationQueueFilters): VerificationQueueFilters {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    keyword: filters.keyword?.trim() || undefined,
    productType: filters.productType && filters.productType !== 'all' ? filters.productType : undefined,
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    dateRange: filters.dateRange?.length ? filters.dateRange : undefined
  }
}

function normalizeRecordFilters(filters: VerificationRecordFilters): VerificationRecordFilters {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    keyword: filters.keyword?.trim() || undefined,
    productType: filters.productType && filters.productType !== 'all' ? filters.productType : undefined,
    serviceName: filters.serviceName?.trim() || undefined,
    operatorOpenid: filters.operatorOpenid?.trim() || undefined,
    verifyCode: filters.verifyCode?.trim() || undefined,
    dateRange: filters.dateRange?.length ? filters.dateRange : undefined
  }
}

function normalizeCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }

  return null
}

function getPackageServiceOptions(lookup: VerificationLookup | null): PackageServiceOption[] {
  if (!lookup?.packageItems?.length) {
    return []
  }

  const remainingMap = lookup.packageRemaining && typeof lookup.packageRemaining === 'object'
    ? lookup.packageRemaining
    : null

  return lookup.packageItems.map(item => ({
    label: `${item.name}（剩余 ${normalizeCount(remainingMap?.[item.name]) ?? 0} / ${item.count}）`,
    value: item.name,
    totalCount: item.count,
    remainingCount: normalizeCount(remainingMap?.[item.name])
  }))
}

function getDefaultServiceName(lookup: VerificationLookup | null) {
  const options = getPackageServiceOptions(lookup)
  const availableOption = options.find(option => (option.remainingCount ?? 0) > 0)
  return availableOption?.value ?? options[0]?.value
}

function formatDateText(value: unknown) {
  if (!value) {
    return '未设置'
  }

  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const parsed = dayjs(value)
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '未设置'
  }

  if (typeof value === 'object' && value && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds)
    if (Number.isFinite(seconds)) {
      return dayjs(seconds * 1000).format('YYYY-MM-DD HH:mm')
    }
  }

  return '未设置'
}

function getVerificationStatusTag(status: string, label?: string) {
  switch (status) {
    case 'unused':
    case 'pending':
      return <Tag color="processing">{label || '待核销'}</Tag>
    case 'partially_used':
    case 'partially_verified':
      return <Tag color="orange">{label || '部分使用'}</Tag>
    case 'used':
    case 'verified':
      return <Tag color="green">{label || '已核销'}</Tag>
    case 'expired':
      return <Tag color="red">{label || '已过期'}</Tag>
    default:
      return <Tag>{label || status || '未配置'}</Tag>
  }
}

export function VerificationPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const queryCardRef = useRef<HTMLDivElement | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [lookup, setLookup] = useState<VerificationLookup | null>(null)
  const [selectedServiceName, setSelectedServiceName] = useState<string>()
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [queueKeywordInput, setQueueKeywordInput] = useState('')
  const [pendingFilters, setPendingFilters] = useState<VerificationQueueFilters>({
    keyword: '',
    productType: 'all',
    status: 'all',
    dateRange: [],
    page: 1,
    pageSize: DEFAULT_PENDING_PAGE_SIZE
  })
  const [recordsKeywordInput, setRecordsKeywordInput] = useState('')
  const [recordsServiceInput, setRecordsServiceInput] = useState('')
  const [recordsOperatorInput, setRecordsOperatorInput] = useState('')
  const [recordFilters, setRecordFilters] = useState<VerificationRecordFilters>({
    keyword: '',
    serviceName: '',
    operatorOpenid: '',
    dateRange: [],
    page: 1,
    pageSize: DEFAULT_RECORDS_PAGE_SIZE
  })

  const packageServiceOptions = useMemo(() => getPackageServiceOptions(lookup), [lookup])
  const pendingQueryFilters = useMemo(() => normalizePendingFilters(pendingFilters), [pendingFilters])
  const recordsQueryFilters = useMemo(() => normalizeRecordFilters(recordFilters), [recordFilters])

  const pendingQuery = useQuery({
    queryKey: ['verification-pending', pendingQueryFilters],
    queryFn: () => adminApi.listPendingVerification(pendingQueryFilters)
  })

  const recordsQuery = useQuery({
    queryKey: ['verification-records', recordsQueryFilters],
    queryFn: () => adminApi.listVerificationRecords(recordsQueryFilters)
  })

  const queryMutation = useMutation({
    mutationFn: (code: string) => adminApi.queryVerifyCode(code),
    onSuccess: result => {
      setLookup(result)
      setSelectedServiceName(getDefaultServiceName(result))
      setFeedback({
        type: 'success',
        message: '核销码查询成功',
        description: result.packageItems.length ? '已加载套餐服务项，可选择本次要核销的服务。' : '已加载服务详情，可直接执行核销。'
      })
    },
    onError: (error: Error) => {
      setLookup(null)
      setSelectedServiceName(undefined)
      setFeedback({
        type: 'error',
        message: '核销码查询失败',
        description: error.message
      })
    }
  })

  const verifyMutation = useMutation({
    mutationFn: ({ code, serviceName }: { code: string; serviceName?: string }) => adminApi.verifyOrderItem(code, serviceName),
    onSuccess: async (result: VerificationUsageRecord, variables) => {
      message.success('核销成功')
      setFeedback({
        type: 'success',
        message: '核销成功',
        description: `${result.serviceName || variables.serviceName || lookup?.productName || '本次服务'} 已登记核销。`
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['verification-pending'] })
      queryClient.invalidateQueries({ queryKey: ['verification-records'] })

      try {
        const refreshed = await adminApi.queryVerifyCode(variables.code)
        setLookup(refreshed)
        setSelectedServiceName(getDefaultServiceName(refreshed))
      } catch (refreshError) {
        if (refreshError instanceof Error) {
          setFeedback({
            type: 'info',
            message: '核销已完成',
            description: `核销成功，但刷新详情失败：${refreshError.message}`
          })
        }
      }
    },
    onError: (error: Error) => {
      message.error(error.message)
      setFeedback({
        type: 'error',
        message: '核销失败',
        description: error.message
      })
    }
  })

  const handleQuery = useCallback((input?: string) => {
    const trimmedCode = (input ?? verifyCode).trim()
    if (!trimmedCode) {
      message.warning('请输入核销码后再查询')
      return
    }

    setVerifyCode(trimmedCode)
    queryMutation.mutate(trimmedCode)
  }, [verifyCode, message, queryMutation])

  const handleVerify = () => {
    if (!lookup) {
      message.warning('请先查询核销码')
      return
    }

    if (packageServiceOptions.length && !selectedServiceName) {
      message.warning('请选择本次要核销的套餐服务项')
      return
    }

    verifyMutation.mutate({
      code: lookup.verifyCode,
      serviceName: packageServiceOptions.length ? selectedServiceName : undefined
    })
  }

  const jumpToVerification = useCallback((item: VerificationQueueItem) => {
    setVerifyCode(item.verifyCode)
    queryCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    handleQuery(item.verifyCode)
  }, [handleQuery])

  const applyPendingSearch = () => {
    setPendingFilters(prev => ({
      ...prev,
      keyword: queueKeywordInput.trim(),
      page: 1
    }))
  }

  const applyRecordsSearch = () => {
    setRecordFilters(prev => ({
      ...prev,
      keyword: recordsKeywordInput.trim(),
      serviceName: recordsServiceInput.trim(),
      operatorOpenid: recordsOperatorInput.trim(),
      page: 1
    }))
  }

  const pendingColumns = useMemo((): ColumnsType<VerificationQueueItem> => [
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    {
      title: '用户',
      dataIndex: 'userLabel',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.userLabel}</span>
          <Typography.Text type="secondary">{record.userPhone || '未留手机号'}</Typography.Text>
        </Space>
      )
    },
    {
      title: '商品',
      dataIndex: 'productName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.productName}</span>
          <Typography.Text type="secondary">
            {record.productType === 'package' ? '套餐服务' : '单次服务'}
          </Typography.Text>
        </Space>
      )
    },
    { title: '核销码', dataIndex: 'verifyCode', width: 120 },
    { title: '待核销内容', dataIndex: 'pendingSummary' },
    {
      title: '状态',
      dataIndex: 'verificationStatus',
      width: 120,
      render: (_, record) => getVerificationStatusTag(record.verificationStatus, record.verificationStatusLabel)
    },
    {
      title: '有效期',
      dataIndex: 'packageExpireAt',
      width: 160,
      render: (value) => formatDateText(value)
    },
    { title: '下单时间', dataIndex: 'createdAtText', width: 160 },
    {
      title: '操作',
      dataIndex: 'action',
      width: 140,
      render: (_, record) => (
        <Button type="link" onClick={() => jumpToVerification(record)}>
          使用该核销码
        </Button>
      )
    }
  ], [jumpToVerification])

  const recordColumns = useMemo((): ColumnsType<VerificationRecord> => [
    { title: '核销时间', dataIndex: 'createdAtText', width: 160 },
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    { title: '商品', dataIndex: 'productName' },
    { title: '服务项目', dataIndex: 'serviceName', width: 160 },
    { title: '核销码', dataIndex: 'verifyCode', width: 120 },
    { title: '用户', dataIndex: 'userLabel', width: 140 },
    {
      title: '当前状态',
      dataIndex: 'verificationStatus',
      width: 120,
      render: (_, record) => getVerificationStatusTag(record.verificationStatus, record.verificationStatusLabel)
    },
    {
      title: '操作人',
      dataIndex: 'operatorOpenid',
      width: 180,
      render: (value) => value || '系统'
    }
  ], [])

  const packageColumns = useMemo((): ColumnsType<PackageServiceOption> => [
    { title: '服务项目', dataIndex: 'value' },
    { title: '套餐次数', dataIndex: 'totalCount', width: 120 },
    {
      title: '剩余次数',
      dataIndex: 'remainingCount',
      width: 120,
      render: (value: number | null) => (value ?? 0)
    }
  ], [])

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">VERIFICATION WORKSPACE</div>
          <Typography.Title level={2}>核销台</Typography.Title>
          <Typography.Paragraph>
            先看待核销服务和最近履约记录，再按核销码直查并执行单次核销。
          </Typography.Paragraph>
        </div>
      </div>

      <Card className="panel-card" title="待核销服务" bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Input.Search
              allowClear
              value={queueKeywordInput}
              placeholder="搜索订单号 / 用户 / 商品 / 核销码"
              enterButton="搜索"
              style={{ width: 360 }}
              onChange={event => setQueueKeywordInput(event.target.value)}
              onSearch={() => applyPendingSearch()}
            />
            <Select
              value={(pendingFilters.productType as VerificationProductFilter) || 'all'}
              style={{ width: 180 }}
              options={[
                { label: '全部类型', value: 'all' },
                { label: '单次服务', value: 'service' },
                { label: '套餐服务', value: 'package' }
              ]}
              onChange={value => setPendingFilters(prev => ({ ...prev, productType: value, page: 1 }))}
            />
            <Select
              value={(pendingFilters.status as VerificationStatusFilter) || 'all'}
              style={{ width: 180 }}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '待核销', value: 'pending' },
                { label: '未使用', value: 'unused' },
                { label: '部分使用', value: 'partially_used' },
                { label: '已过期', value: 'expired' }
              ]}
              onChange={value => setPendingFilters(prev => ({ ...prev, status: value, page: 1 }))}
            />
            <DatePicker.RangePicker
              value={parseDateRange(pendingFilters.dateRange)}
              onChange={values => setPendingFilters(prev => ({
                ...prev,
                dateRange: values ? formatDateRange(values as [dayjs.Dayjs, dayjs.Dayjs]) : [],
                page: 1
              }))}
            />
          </Space>

          <Table<VerificationQueueItem>
            rowKey={record => `${record.orderId}-${record.verifyCode}`}
            loading={pendingQuery.isLoading}
            pagination={{
              current: pendingQuery.data?.page || pendingFilters.page || 1,
              pageSize: pendingQuery.data?.pageSize || pendingFilters.pageSize || DEFAULT_PENDING_PAGE_SIZE,
              total: pendingQuery.data?.total || 0,
              showSizeChanger: true,
              showTotal: total => `共 ${total} 条`,
              onChange: (page, pageSize) => setPendingFilters(prev => ({
                ...prev,
                page,
                pageSize
              }))
            }}
            dataSource={pendingQuery.data?.list || []}
            columns={pendingColumns}
            locale={{ emptyText: '当前没有待核销服务' }}
          />
        </Space>
      </Card>

      <Card className="panel-card" title="最近履约记录" bordered={false}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Input.Search
              allowClear
              value={recordsKeywordInput}
              placeholder="搜索订单号 / 用户 / 商品 / 核销码"
              enterButton="搜索"
              style={{ width: 320 }}
              onChange={event => setRecordsKeywordInput(event.target.value)}
              onSearch={() => applyRecordsSearch()}
            />
            <Input
              allowClear
              value={recordsServiceInput}
              placeholder="服务项目筛选"
              style={{ width: 220 }}
              onChange={event => setRecordsServiceInput(event.target.value)}
              onPressEnter={applyRecordsSearch}
            />
            <Input
              allowClear
              value={recordsOperatorInput}
              placeholder="操作人 OpenID 筛选"
              style={{ width: 260 }}
              onChange={event => setRecordsOperatorInput(event.target.value)}
              onPressEnter={applyRecordsSearch}
            />
            <DatePicker.RangePicker
              value={parseDateRange(recordFilters.dateRange)}
              onChange={values => setRecordFilters(prev => ({
                ...prev,
                dateRange: values ? formatDateRange(values as [dayjs.Dayjs, dayjs.Dayjs]) : [],
                page: 1
              }))}
            />
            <Button onClick={applyRecordsSearch}>应用筛选</Button>
          </Space>

          <Table<VerificationRecord>
            rowKey="usageId"
            loading={recordsQuery.isLoading}
            pagination={{
              current: recordsQuery.data?.page || recordFilters.page || 1,
              pageSize: recordsQuery.data?.pageSize || recordFilters.pageSize || DEFAULT_RECORDS_PAGE_SIZE,
              total: recordsQuery.data?.total || 0,
              showSizeChanger: true,
              showTotal: total => `共 ${total} 条`,
              onChange: (page, pageSize) => setRecordFilters(prev => ({
                ...prev,
                page,
                pageSize
              }))
            }}
            dataSource={recordsQuery.data?.list || []}
            columns={recordColumns}
            locale={{ emptyText: '当前没有履约记录' }}
          />
        </Space>
      </Card>

      <div ref={queryCardRef}>
        <Card className="panel-card" title="核销码直查" bordered={false}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Input.Search
              value={verifyCode}
              placeholder="输入核销码"
              enterButton="查询"
              size="large"
              loading={queryMutation.isPending}
              onChange={event => setVerifyCode(event.target.value)}
              onSearch={handleQuery}
            />

            {feedback ? (
              <Alert
                type={feedback.type === 'error' ? 'error' : feedback.type === 'info' ? 'info' : 'success'}
                showIcon
                message={feedback.message}
                description={feedback.description}
              />
            ) : null}
          </Space>
        </Card>
      </div>

      {lookup ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card className="panel-card" title="核销详情" bordered={false}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="订单号">{lookup.orderNo}</Descriptions.Item>
              <Descriptions.Item label="订单状态">{lookup.orderStatus}</Descriptions.Item>
              <Descriptions.Item label="商品名称">{lookup.productName}</Descriptions.Item>
              <Descriptions.Item label="商品类型">{lookup.productType}</Descriptions.Item>
              <Descriptions.Item label="核销码">{lookup.verifyCode}</Descriptions.Item>
              <Descriptions.Item label="核销状态">{getVerificationStatusTag(lookup.verificationStatus)}</Descriptions.Item>
              <Descriptions.Item label="过期时间">{formatDateText(lookup.expiry)}</Descriptions.Item>
              <Descriptions.Item label="套餐有效期">{formatDateText(lookup.packageExpireAt)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card className="panel-card" title="服务与余次" bordered={false}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {packageServiceOptions.length ? (
                <>
                  <Select
                    value={selectedServiceName}
                    placeholder="选择本次核销服务项"
                    options={packageServiceOptions}
                    onChange={value => setSelectedServiceName(value)}
                    style={{ width: '100%' }}
                  />
                  <Table
                    rowKey="value"
                    pagination={false}
                    dataSource={packageServiceOptions}
                    columns={packageColumns}
                  />
                </>
              ) : (
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="本次服务">{lookup.productName}</Descriptions.Item>
                </Descriptions>
              )}

              <Button
                type="primary"
                size="large"
                loading={verifyMutation.isPending}
                onClick={handleVerify}
              >
                立即核销
              </Button>
            </Space>
          </Card>
        </Space>
      ) : null}
    </div>
  )
}
