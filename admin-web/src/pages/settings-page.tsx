import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Switch, Typography } from 'antd'
import L from 'leaflet'
import { adminApi } from '../lib/admin-api'
import { getTempFileUrl, uploadFileToCloud } from '../lib/cloudbase'

const DEFAULT_MAP_CENTER: [number, number] = [23.1291, 113.2644]

function LocationMapPreview(props: {
  center: [number, number]
  marker?: [number, number] | null
  interactive?: boolean
  onPick?: (coords: [number, number]) => void
}) {
  const mapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

    const map = L.map(mapRef.current, {
      center: props.center,
      zoom: 16,
      zoomControl: Boolean(props.interactive),
      dragging: Boolean(props.interactive),
      scrollWheelZoom: Boolean(props.interactive),
      doubleClickZoom: Boolean(props.interactive),
      attributionControl: false
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    let marker: L.CircleMarker | null = null
    if (props.marker) {
      marker = L.circleMarker(props.marker, {
        radius: 10,
        color: '#bf3f31',
        fillColor: '#bf3f31',
        fillOpacity: 0.9
      }).addTo(map)
    }

    if (props.interactive && props.onPick) {
      map.on('click', (event: L.LeafletMouseEvent) => {
        const next: [number, number] = [event.latlng.lat, event.latlng.lng]
        if (marker) {
          marker.setLatLng(next)
        } else {
          marker = L.circleMarker(next, {
            radius: 10,
            color: '#bf3f31',
            fillColor: '#bf3f31',
            fillOpacity: 0.9
          }).addTo(map)
        }
        props.onPick?.(next)
      })
    }

    return () => {
      map.remove()
    }
  }, [props.center, props.interactive, props.marker, props.onPick])

  return <div className="settings-leaflet-map" ref={mapRef} />
}

export function SettingsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [storeForm] = Form.useForm()
  const [payForm] = Form.useForm()
  const [aiForm] = Form.useForm()
  const [notifyForm] = Form.useForm()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftLocation, setDraftLocation] = useState<[number, number] | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')
  const latitude = Number(Form.useWatch('latitude', storeForm) || 0)
  const longitude = Number(Form.useWatch('longitude', storeForm) || 0)
  const logoValue = String(Form.useWatch('logo', storeForm) || '')

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: adminApi.getSettings
  })
  const hasMapLocation = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude > 0 && longitude > 0
  const currentLocation = hasMapLocation ? ([latitude, longitude] as [number, number]) : null
  const mapOpenUrl = hasMapLocation ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}` : ''
  const pickerCenter = useMemo<[number, number]>(() => {
    if (draftLocation) return draftLocation
    if (currentLocation) return currentLocation
    return DEFAULT_MAP_CENTER
  }, [draftLocation, currentLocation])

  useEffect(() => {
    if (!settingsQuery.data) return
    storeForm.setFieldsValue(settingsQuery.data.storeInfo || {})
    payForm.setFieldsValue(settingsQuery.data.payConfig || {})
    aiForm.setFieldsValue(settingsQuery.data.aiConfig || {})
    notifyForm.setFieldsValue(settingsQuery.data.notificationConfig || {})
  }, [settingsQuery.data, storeForm, payForm, aiForm, notifyForm])

  useEffect(() => {
    let disposed = false
    if (!logoValue) {
      setLogoPreviewUrl('')
      return
    }
    if (!logoValue.startsWith('cloud://')) {
      setLogoPreviewUrl(logoValue)
      return
    }
    getTempFileUrl(logoValue)
      .then(url => {
        if (!disposed) {
          setLogoPreviewUrl(url || '')
        }
      })
      .catch(() => {
        if (!disposed) {
          setLogoPreviewUrl('')
        }
      })
    return () => {
      disposed = true
    }
  }, [logoValue])

  const updateStoreMutation = useMutation({
    mutationFn: adminApi.updateStore,
    onSuccess: () => {
      message.success('门店信息已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updatePayMutation = useMutation({
    mutationFn: adminApi.updatePayConfig,
    onSuccess: () => {
      message.success('支付配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updateAiMutation = useMutation({
    mutationFn: adminApi.updateAiConfig,
    onSuccess: () => {
      message.success('AI 配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const updateNotifyMutation = useMutation({
    mutationFn: adminApi.updateNotificationConfig,
    onSuccess: () => {
      message.success('通知配置已更新')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => message.error(error.message)
  })
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const storeName = String(storeForm.getFieldValue('name') || 'store').trim() || 'store'
      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
      const safeName = storeName.replace(/[^\u4e00-\u9fa5\w-]+/g, '-').replace(/-+/g, '-')
      const cloudPath = `stores/logos/${safeName}-${Date.now()}${ext}`
      const result = await uploadFileToCloud(cloudPath, file)
      const fileID = result.fileID || ''
      if (!fileID) {
        throw new Error('Logo 上传成功但未返回文件地址')
      }
      const tempUrl = await getTempFileUrl(fileID)
      return { fileID, tempUrl }
    },
    onSuccess: ({ fileID, tempUrl }) => {
      storeForm.setFieldValue('logo', fileID)
      setLogoPreviewUrl(tempUrl || '')
      const currentValues = storeForm.getFieldsValue()
      updateStoreMutation.mutate({ ...currentValues, logo: fileID })
    },
    onError: (error: Error) => message.error(error.message || 'Logo 上传失败')
  })

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">STORE SETTINGS</div>
          <Typography.Title level={2}>门店与系统设置</Typography.Title>
          <Typography.Paragraph>
            这里保存的是小程序前台和后台共用的配置。每个功能模块独立成卡片，单独保存，避免互相干扰。
          </Typography.Paragraph>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="门店基础信息" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={storeForm} layout="vertical" onFinish={values => updateStoreMutation.mutate(values)}>
              <div className="settings-card-copy">
                <Typography.Text strong>前台展示素材</Typography.Text>
                <Typography.Paragraph type="secondary">
                  用于首页、门店介绍和导航信息展示。这里的内容会直接影响用户看到的门店形象。
                </Typography.Paragraph>
              </div>
              <Form.Item name="name" label="门店名称"><Input /></Form.Item>
              <Form.Item name="phone" label="联系电话"><Input /></Form.Item>
              <Form.Item
                name="address"
                label="门店地址"
                extra="先输入完整门店地址，再点击“一键解析地址”自动定位门店位置。"
              >
                <Input.TextArea rows={2} />
              </Form.Item>
              <div className="settings-inline-actions">
                <Button
                  onClick={() => {
                    const address = String(storeForm.getFieldValue('address') || '').trim()
                    if (!address) {
                      message.warning('请先输入门店地址')
                      return
                    }
                    setDraftLocation(currentLocation)
                    setPickerOpen(true)
                    message.info('请在地图上点击门店位置')
                  }}
                >
                  一键解析地址
                </Button>
                <Button
                  onClick={() => {
                    setDraftLocation(currentLocation)
                    setPickerOpen(true)
                  }}
                >
                  地图选点
                </Button>
              </div>
              <Form.Item name="latitude" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="longitude" hidden>
                <Input />
              </Form.Item>
              <div className="settings-map-preview">
                <div className="settings-map-copy">
                  <Typography.Text strong>门店地图位置</Typography.Text>
                  <Typography.Paragraph type="secondary">
                    {hasMapLocation
                      ? '当前已定位到门店地图位置，保存后小程序可直接导航到这里。'
                      : '还没有地图位置。请先输入门店地址并点击“一键解析地址”。'}
                  </Typography.Paragraph>
                </div>
                {hasMapLocation ? (
                  <div className="settings-map-frame">
                    <LocationMapPreview center={currentLocation as [number, number]} marker={currentLocation} />
                  </div>
                ) : (
                  <div className="settings-map-empty">等待地址解析后显示地图位置</div>
                )}
                {hasMapLocation && (
                  <a className="settings-map-link" href={mapOpenUrl} target="_blank" rel="noreferrer">
                    在新窗口查看地图位置
                  </a>
                )}
              </div>
              <Form.Item name="description" label="门店简介"><Input.TextArea rows={3} /></Form.Item>
              <Form.Item name="logo" hidden>
                <Input />
              </Form.Item>
              <div className="settings-upload-block">
                <div className="settings-upload-copy">
                  <Typography.Text strong>门店 Logo</Typography.Text>
                  <Typography.Paragraph type="secondary">
                    直接上传到当前云开发环境，保存后小程序会使用这张 Logo。
                  </Typography.Paragraph>
                </div>
                <div className="settings-upload-actions">
                  <label className="settings-upload-trigger">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async event => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        uploadLogoMutation.mutate(file)
                        event.currentTarget.value = ''
                      }}
                    />
                    <span>{uploadLogoMutation.isPending ? '上传中...' : '上传 Logo'}</span>
                  </label>
                  {logoValue ? (
                    <Button
                      onClick={() => {
                        storeForm.setFieldValue('logo', '')
                        setLogoPreviewUrl('')
                      }}
                    >
                      清空 Logo
                    </Button>
                  ) : null}
                </div>
                {logoPreviewUrl ? (
                  <div className="settings-upload-preview">
                    <img src={logoPreviewUrl} alt="门店 Logo 预览" />
                  </div>
                ) : (
                  <div className="settings-upload-empty">尚未上传 Logo</div>
                )}
              </div>
              <Form.Item name="banners" label="Banner 地址（每行一个）"><Input.TextArea rows={3} /></Form.Item>
              <div className="settings-actions">
                <Space>
                  <Button
                    onClick={() => {
                      setDraftLocation(currentLocation)
                      setPickerOpen(true)
                      message.info('请在地图上点击门店位置')
                    }}
                  >
                    重新解析位置
                  </Button>
                  <Button
                    onClick={() => {
                      setDraftLocation(currentLocation)
                      setPickerOpen(true)
                    }}
                  >
                    手动调整位置
                  </Button>
                  <Button type="primary" htmlType="submit" loading={updateStoreMutation.isPending}>保存门店信息</Button>
                </Space>
              </div>
            </Form>
          </Card>

          <Card className="panel-card" title="通知配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={notifyForm} layout="vertical" onFinish={values => updateNotifyMutation.mutate(values)}>
              <div className="settings-card-copy">
                <Typography.Text strong>管理员提醒</Typography.Text>
                <Typography.Paragraph type="secondary">
                  控制订单、退款和跟进通知。适合分开管理老板和运营同学的消息接收范围。
                </Typography.Paragraph>
              </div>
              <Form.Item name="orderNotifyEnabled" label="订单通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="refundNotifyEnabled" label="退款通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="followupNotifyEnabled" label="跟进通知" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="adminPhones" label="管理员手机号（每行一个）">
                <Input.TextArea rows={3} />
              </Form.Item>
              <div className="settings-actions">
                <Button type="primary" htmlType="submit" loading={updateNotifyMutation.isPending}>保存通知配置</Button>
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="panel-card" title="支付配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={payForm} layout="vertical" onFinish={values => updatePayMutation.mutate(values)}>
              <div className="settings-card-copy">
                <Typography.Text strong>交易基础参数</Typography.Text>
                <Typography.Paragraph type="secondary">
                  支付回调、商户号和密钥都在这里维护。敏感值继续支持脱敏回显。
                </Typography.Paragraph>
              </div>
              <Form.Item name="mchId" label="商户号"><Input /></Form.Item>
              <Form.Item name="mchKey" label="商户密钥"><Input.Password placeholder="保持脱敏值代表不修改" /></Form.Item>
              <Form.Item name="notifyUrl" label="支付回调地址"><Input /></Form.Item>
              <div className="settings-actions">
                <Button type="primary" htmlType="submit" loading={updatePayMutation.isPending}>保存支付配置</Button>
              </div>
            </Form>
          </Card>

          <Card className="panel-card" title="AI 基础配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={aiForm} layout="vertical" onFinish={values => updateAiMutation.mutate(values)}>
              <div className="settings-card-copy">
                <Typography.Text strong>正式分析链路</Typography.Text>
                <Typography.Paragraph type="secondary">
                  控制 AI 接口、模型和调用额度。这里只负责正常模式的分析能力。
                </Typography.Paragraph>
              </div>
              <Form.Item name="enabled" label="启用 AI 分析" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="apiUrl" label="AI 接口地址"><Input /></Form.Item>
              <Form.Item name="apiKey" label="API Key"><Input.Password placeholder="保持脱敏值代表不修改" /></Form.Item>
              <Form.Item name="model" label="模型名称"><Input /></Form.Item>
              <Form.Item name="dailyLimit" label="每日总限制"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="userDailyLimit" label="用户每日限制"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="systemPrompt" label="系统 Prompt"><Input.TextArea rows={4} /></Form.Item>
              <div className="settings-actions">
                <Button type="primary" htmlType="submit" loading={updateAiMutation.isPending}>保存 AI 基础配置</Button>
              </div>
            </Form>
          </Card>

          <Card className="panel-card" title="审核模式" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={aiForm} layout="vertical" onFinish={values => updateAiMutation.mutate(values)}>
              <div className="settings-card-copy">
                <Typography.Text strong>提审安全配置</Typography.Text>
                <Typography.Paragraph type="secondary">
                  开启后，前台读取 <code>reviewConfig</code> 降级舌象能力，切换安全文案和安全素材。
                </Typography.Paragraph>
              </div>
              <Form.Item name={['reviewConfig', 'enabled']} label="启用审核模式" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'entryTitle']} label="入口标题">
                    <Input placeholder="例如：宝宝日常" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'pageTitle']} label="页面标题">
                    <Input placeholder="例如：健康打卡" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'historyTitle']} label="历史标题">
                    <Input placeholder="例如：照片记录" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'reportTitle']} label="详情标题">
                    <Input placeholder="例如：记录详情" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'submitText']} label="提交按钮文案">
                    <Input placeholder="例如：保存记录" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'shareTitle']} label="分享文案">
                    <Input placeholder="例如：记录宝宝健康每一天" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'emptyText']} label="空状态文案">
                    <Input placeholder="例如：暂无照片记录" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'listTagText']} label="列表标签文案">
                    <Input placeholder="例如：待AI分析" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name={['reviewConfig', 'safeBannerUrl']} label="审核态 Banner 地址">
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item name={['reviewConfig', 'safeShareImageUrl']} label="审核态分享图地址">
                <Input placeholder="https://..." />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name={['reviewConfig', 'hideHistoryAiRecords']} label="审核态隐藏旧 AI 历史" valuePropName="checked">
                    <Switch checkedChildren="隐藏" unCheckedChildren="显示" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name={['reviewConfig', 'allowReanalyzeAfterReview']}
                    label="审核结束后允许补分析"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="允许" unCheckedChildren="禁止" />
                  </Form.Item>
                </Col>
              </Row>
              <div className="settings-actions">
                <Button type="primary" htmlType="submit" loading={updateAiMutation.isPending}>保存审核模式</Button>
              </div>
            </Form>
          </Card>
        </Col>
      </Row>

      <Modal
        title="门店地图选点"
        open={pickerOpen}
        width={760}
        onCancel={() => setPickerOpen(false)}
        onOk={() => {
          if (!draftLocation) {
            message.warning('请先在地图上点击门店位置')
            return
          }
          storeForm.setFieldsValue({
            latitude: draftLocation[0],
            longitude: draftLocation[1]
          })
          setPickerOpen(false)
          message.success('门店位置已更新，请记得保存门店信息')
        }}
        okText="使用这个位置"
        cancelText="取消"
      >
        <Typography.Paragraph type="secondary">
          自动解析不到时，直接在地图上点击门店位置即可。红点会标记当前选择的位置。
        </Typography.Paragraph>
        <div className="settings-map-modal">
          <LocationMapPreview
            center={pickerCenter}
            marker={draftLocation || currentLocation}
            interactive
            onPick={coords => setDraftLocation(coords)}
          />
        </div>
      </Modal>
    </div>
  )
}
