import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, AutoComplete, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Switch, Typography } from 'antd'
import L from 'leaflet'
import { adminApi } from '../lib/admin-api'
import { getTempFileUrl, uploadFileToCloud } from '../lib/cloudbase'

const DEFAULT_MAP_CENTER: [number, number] = [23.1291, 113.2644]

async function readPemFile(file: File) {
  return file.text()
}

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
  const [fetchedAiModels, setFetchedAiModels] = useState<string[]>([])
  const latitude = Number(Form.useWatch('latitude', storeForm) || 0)
  const longitude = Number(Form.useWatch('longitude', storeForm) || 0)
  const logoValue = String(Form.useWatch('logo', storeForm) || '')
  const currentAiModel = String(Form.useWatch('model', aiForm) || '')
  const apiV3KeyValue = String(Form.useWatch('apiV3Key', payForm) || '')
  const privateKeyValue = String(Form.useWatch('privateKey', payForm) || '')
  const certificateValue = String(Form.useWatch('certificatePem', payForm) || '')
  const apiV3KeyConfigured = Boolean(apiV3KeyValue.trim())
  const privateKeyConfigured = Boolean(privateKeyValue.trim())
  const certificateConfigured = Boolean(certificateValue.trim())

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
  const fetchAiModelsMutation = useMutation({
    mutationFn: adminApi.fetchAiModels,
    onSuccess: result => {
      setFetchedAiModels(result.models)
      if (result.selectedModel && result.selectedModel !== currentAiModel) {
        aiForm.setFieldValue('model', result.selectedModel)
      }
      message.success(`已拉取 ${result.models.length} 个模型，可直接选择`)
    },
    onError: (error: Error) => message.error(error.message)
  })
  const testAiMutation = useMutation({
    mutationFn: adminApi.testAiConfig,
    onSuccess: result => {
      setFetchedAiModels(result.models)
      if (result.selectedModel && result.selectedModel !== currentAiModel) {
        aiForm.setFieldValue('model', result.selectedModel)
      }
      Modal.info({
        title: 'AI 接口测试通过',
        content: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text>返回模型数：{result.models.length}</Typography.Text>
            <Typography.Text>当前选中：{result.selectedModel || '未匹配到可用模型'}</Typography.Text>
            <Typography.Paragraph copyable={{ text: result.requestUrl }} style={{ marginBottom: 0 }}>
              请求地址：{result.requestUrl}
            </Typography.Paragraph>
            <div style={{ maxHeight: 220, overflow: 'auto', padding: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
              {result.models.map(model => (
                <Typography.Text key={model} style={{ display: 'block' }}>
                  {model}
                </Typography.Text>
              ))}
            </div>
          </Space>
        )
      })
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
          <Card size="small" className="panel-card" title="门店基础信息" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={storeForm} layout="vertical" onFinish={values => updateStoreMutation.mutate(values)}>
              <div className="settings-card-copy" style={{ marginBottom: 12 }}>
                <Typography.Text strong>前台展示素材</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  用于首页、门店介绍和导航信息展示。这里的内容会直接影响用户看到的门店形象。
                </Typography.Paragraph>
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="门店名称" style={{ marginBottom: 12 }}><Input /></Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="phone" label="联系电话" style={{ marginBottom: 12 }}><Input /></Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="address"
                    label="门店地址"
                    style={{ marginBottom: 12 }}
                  >
                    <Input.TextArea rows={3} placeholder="输入完整门店地址后，点击解析位置" />
                  </Form.Item>
                  <Space style={{ marginBottom: 16 }}>
                    <Button
                      size="small"
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
                      一键解析位置
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setDraftLocation(currentLocation)
                        setPickerOpen(true)
                      }}
                    >
                      手动地图选点
                    </Button>
                  </Space>
                  <Form.Item name="latitude" hidden><Input /></Form.Item>
                  <Form.Item name="longitude" hidden><Input /></Form.Item>
                </Col>
                <Col span={12}>
                  <div className="settings-map-preview" style={{ marginTop: 0, padding: 8, background: '#f5f5f5', borderRadius: 8, height: 120, display: 'flex', flexDirection: 'column' }}>
                    {hasMapLocation ? (
                      <>
                        <div className="settings-map-frame" style={{ flex: 1, borderRadius: 4, overflow: 'hidden', minHeight: 0 }}>
                          <LocationMapPreview center={currentLocation as [number, number]} marker={currentLocation} />
                        </div>
                        <a className="settings-map-link" href={mapOpenUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                          在新窗口查看
                        </a>
                      </>
                    ) : (
                      <div className="settings-map-empty" style={{ margin: 'auto', fontSize: 12, color: '#999' }}>等待解析地址...</div>
                    )}
                  </div>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="description" label="门店简介" style={{ marginBottom: 12 }}><Input.TextArea rows={2} /></Form.Item>
                  <Form.Item name="banners" label="Banner 地址（每行一个）" style={{ marginBottom: 12 }}><Input.TextArea rows={2} /></Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="logo" hidden><Input /></Form.Item>
                  <div className="settings-upload-block" style={{ marginTop: 28, padding: 12 }}>
                    <div className="settings-upload-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 500 }}>门店 Logo</span>
                      <Space>
                        <label className="settings-upload-trigger" style={{ margin: 0, padding: '4px 12px', fontSize: 12 }}>
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
                          <span>{uploadLogoMutation.isPending ? '上传中...' : '上传'}</span>
                        </label>
                        {logoValue ? (
                          <Button size="small" onClick={() => {
                            storeForm.setFieldValue('logo', '')
                            setLogoPreviewUrl('')
                          }}>清除</Button>
                        ) : null}
                      </Space>
                    </div>
                    {logoPreviewUrl ? (
                      <div className="settings-upload-preview" style={{ height: 60, width: 60, padding: 0 }}>
                        <img src={logoPreviewUrl} alt="Logo 预览" style={{ height: '100%', width: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div className="settings-upload-empty" style={{ height: 60, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>未上传</div>
                    )}
                  </div>
                </Col>
              </Row>
              <div className="settings-actions" style={{ marginTop: 12 }}>
                <Button type="primary" htmlType="submit" loading={updateStoreMutation.isPending}>保存门店信息</Button>
              </div>
            </Form>
          </Card>

          <Card size="small" className="panel-card" title="通知配置" bordered={false} loading={settingsQuery.isLoading} style={{ marginTop: 16 }}>
            <Form form={notifyForm} layout="vertical" onFinish={values => updateNotifyMutation.mutate(values)}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="orderNotifyEnabled" label="订单通知" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="refundNotifyEnabled" label="退款通知" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="followupNotifyEnabled" label="跟进通知" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="adminPhones" label="管理员手机号（每行一个）" style={{ marginBottom: 12 }}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <div className="settings-actions" style={{ marginTop: 12 }}>
                <Button type="primary" htmlType="submit" loading={updateNotifyMutation.isPending}>保存通知配置</Button>
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" className="panel-card" title="支付配置" bordered={false} loading={settingsQuery.isLoading}>
            <Form form={payForm} layout="vertical" onFinish={values => updatePayMutation.mutate(values)}>
              <Form.Item name="enabled" label="启用支付能力" valuePropName="checked" style={{ marginBottom: 12 }}>
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="mchId" label="商户号" style={{ marginBottom: 12 }}><Input /></Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="certSerialNo" label="证书序列号" style={{ marginBottom: 12 }}>
                    <Input placeholder="填写商户平台中的证书序列号" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="apiV3Key" label="API_V3_KEY" style={{ marginBottom: 12 }}>
                <Input.Password placeholder="保持脱敏值代表不修改" />
              </Form.Item>
              <Form.Item name="privateKeyFileName" hidden><Input /></Form.Item>
              <Form.Item name="certificateFileName" hidden><Input /></Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="privateKey" label={
                    <Space>
                      <span>证书私钥</span>
                      <label className="settings-upload-trigger" style={{ margin: 0, padding: '2px 8px', fontSize: 12 }}>
                        <input
                          type="file"
                          accept=".pem,.key,.txt"
                          onChange={async event => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            try {
                              const content = await readPemFile(file)
                              payForm.setFieldsValue({ privateKey: content, privateKeyFileName: file.name })
                              message.success('私钥文件已载入')
                            } catch (error) {
                              message.error(error instanceof Error ? error.message : '私钥文件读取失败')
                            } finally {
                              event.currentTarget.value = ''
                            }
                          }}
                        />
                        <span>导入</span>
                      </label>
                    </Space>
                  } style={{ marginBottom: 12 }}>
                    <Input.TextArea rows={4} placeholder="apiclient_key.pem 内容" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="certificatePem" label={
                    <Space>
                      <span>API 证书内容</span>
                      <label className="settings-upload-trigger" style={{ margin: 0, padding: '2px 8px', fontSize: 12 }}>
                        <input
                          type="file"
                          accept=".pem,.crt,.txt"
                          onChange={async event => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            try {
                              const content = await readPemFile(file)
                              payForm.setFieldsValue({ certificatePem: content, certificateFileName: file.name })
                              message.success('证书文件已载入')
                            } catch (error) {
                              message.error(error instanceof Error ? error.message : '证书文件读取失败')
                            } finally {
                              event.currentTarget.value = ''
                            }
                          }}
                        />
                        <span>导入</span>
                      </label>
                    </Space>
                  } style={{ marginBottom: 12 }}>
                    <Input.TextArea rows={4} placeholder="apiclient_cert.pem 内容" />
                  </Form.Item>
                </Col>
              </Row>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                状态：API_V3_KEY {apiV3KeyConfigured ? '已配置' : '未配置'} | 私钥 {privateKeyConfigured ? '已配置' : '未配置'} | 证书 {certificateConfigured ? '已配置' : '未配置'}
              </Typography.Paragraph>
              <div className="settings-actions" style={{ marginTop: 12 }}>
                <Button type="primary" htmlType="submit" loading={updatePayMutation.isPending}>保存支付配置</Button>
              </div>
            </Form>
          </Card>

          <Card size="small" className="panel-card" title="AI 基础配置" bordered={false} loading={settingsQuery.isLoading} style={{ marginTop: 16 }}>
            <Form form={aiForm} layout="vertical" onFinish={values => updateAiMutation.mutate(values)}>
              <Form.Item name="enabled" label="启用 AI 分析" valuePropName="checked" style={{ marginBottom: 12 }}>
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="apiUrl" label="AI 接口地址" style={{ marginBottom: 12 }}>
                    <Input placeholder="OpenAI 兼容接口" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="apiKey" label="API Key" style={{ marginBottom: 12 }}><Input.Password placeholder="保持脱敏值代表不修改" /></Form.Item>
                </Col>
              </Row>
              <Form.Item label="模型名称" style={{ marginBottom: 12 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="model" noStyle>
                    <AutoComplete
                      options={fetchedAiModels.map(model => ({ value: model }))}
                      placeholder="可手填，拉取后也可以直接选择模型"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Button
                    onClick={() => fetchAiModelsMutation.mutate(aiForm.getFieldsValue(true))}
                    loading={fetchAiModelsMutation.isPending}
                  >
                    拉取模型
                  </Button>
                </Space.Compact>
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="dailyLimit" label="每日总限制" style={{ marginBottom: 12 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="userDailyLimit" label="用户每日限制" style={{ marginBottom: 12 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                </Col>
              </Row>
              <Form.Item name="systemPrompt" label="系统 Prompt" style={{ marginBottom: 12 }}><Input.TextArea rows={2} /></Form.Item>
              <div className="settings-actions" style={{ marginTop: 12 }}>
                <Space>
                  <Button onClick={() => testAiMutation.mutate(aiForm.getFieldsValue(true))} loading={testAiMutation.isPending}>测试接口</Button>
                  <Button type="primary" htmlType="submit" loading={updateAiMutation.isPending}>保存 AI 基础配置</Button>
                </Space>
              </div>
            </Form>
          </Card>

          <Card size="small" className="panel-card" title="审核模式" bordered={false} loading={settingsQuery.isLoading} style={{ marginTop: 16 }}>
            <Form form={aiForm} layout="vertical" onFinish={values => updateAiMutation.mutate(values)}>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item name={['reviewConfig', 'enabled']} label="启用审核模式" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </Col>
                <Col span={9}>
                  <Form.Item name={['reviewConfig', 'hideHistoryAiRecords']} label="隐藏旧 AI 历史" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="隐藏" unCheckedChildren="显示" />
                  </Form.Item>
                </Col>
                <Col span={9}>
                  <Form.Item name={['reviewConfig', 'allowReanalyzeAfterReview']} label="结束后允许补分析" valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Switch checkedChildren="允许" unCheckedChildren="禁止" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={6}><Form.Item name={['reviewConfig', 'entryTitle']} label="入口标题" style={{ marginBottom: 12 }}><Input placeholder="宝宝日常" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'pageTitle']} label="页面标题" style={{ marginBottom: 12 }}><Input placeholder="健康打卡" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'historyTitle']} label="历史标题" style={{ marginBottom: 12 }}><Input placeholder="照片记录" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'reportTitle']} label="详情标题" style={{ marginBottom: 12 }}><Input placeholder="记录详情" /></Form.Item></Col>
              </Row>
              <Row gutter={12}>
                <Col span={6}><Form.Item name={['reviewConfig', 'submitText']} label="提交按钮" style={{ marginBottom: 12 }}><Input placeholder="保存记录" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'shareTitle']} label="分享文案" style={{ marginBottom: 12 }}><Input placeholder="分享" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'emptyText']} label="空状态" style={{ marginBottom: 12 }}><Input placeholder="暂无记录" /></Form.Item></Col>
                <Col span={6}><Form.Item name={['reviewConfig', 'listTagText']} label="列表标签" style={{ marginBottom: 12 }}><Input placeholder="待AI分析" /></Form.Item></Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}><Form.Item name={['reviewConfig', 'safeBannerUrl']} label="审核态 Banner 地址" style={{ marginBottom: 12 }}><Input placeholder="https://..." /></Form.Item></Col>
                <Col span={12}><Form.Item name={['reviewConfig', 'safeShareImageUrl']} label="审核态分享图地址" style={{ marginBottom: 12 }}><Input placeholder="https://..." /></Form.Item></Col>
              </Row>
              <div className="settings-actions" style={{ marginTop: 12 }}>
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
