import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Drawer, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd'
import { adminApi } from '../lib/admin-api'
import { getTempFileUrl, uploadFileToCloud } from '../lib/cloudbase'
import { fenToYuanInput, yuanToFen } from '../lib/money'
import type { ProductRecord } from '../types/admin'

const PRODUCT_TYPE_OPTIONS = [
  { label: '实物', value: 'physical' },
  { label: '服务', value: 'service' },
  { label: '套餐商品', value: 'package' }
]

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  physical: '实物',
  service: '服务',
  package: '套餐商品'
}

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  physical: 'orange',
  service: 'blue',
  package: 'purple'
}

function formatListText(value: unknown) {
  if (!Array.isArray(value)) return ''
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join('\n')
}

function parseListText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }
  return String(value || '')
    .split(/[\n,，]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function formatPricePreview(value: unknown) {
  if (value === undefined || value === null || value === '') return '待填写'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '待填写'
  return `¥${amount.toFixed(2)}`
}

function formatStockPreview(value: unknown) {
  if (value === undefined || value === null || value === '') return '不限库存'
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return '不限库存'
  return `${amount} 件`
}

export function CatalogPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [productForm] = Form.useForm()
  const [packageForm] = Form.useForm()
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [packageModalOpen, setPackageModalOpen] = useState(false)
  const [productEditorMode, setProductEditorMode] = useState<'create' | 'edit'>('create')
  const [productImages, setProductImages] = useState<string[]>([])
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({})
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: adminApi.listProducts })
  const packagesQuery = useQuery({ queryKey: ['packages'], queryFn: adminApi.listPackages })
  const watchedName = Form.useWatch('name', productForm)
  const watchedCategory = Form.useWatch('category', productForm)
  const watchedType = Form.useWatch('type', productForm)
  const watchedPrice = Form.useWatch('price', productForm)
  const watchedOriginalPrice = Form.useWatch('originalPrice', productForm)
  const watchedStock = Form.useWatch('stock', productForm)
  const watchedSortOrder = Form.useWatch('sortOrder', productForm)
  const watchedDescription = Form.useWatch('description', productForm)
  const watchedTags = Form.useWatch('tags', productForm)
  const watchedStatus = Form.useWatch('status', productForm)
  const watchedShowInMall = Form.useWatch('showInMall', productForm)

  const saveProductMutation = useMutation({
    mutationFn: adminApi.saveProduct,
    onSuccess: () => {
      message.success('商品已保存')
      setProductModalOpen(false)
      productForm.resetFields()
      setProductImages([])
      setImagePreviewMap({})
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const savePackageMutation = useMutation({
    mutationFn: adminApi.savePackage,
    onSuccess: () => {
      message.success('套餐已保存')
      setPackageModalOpen(false)
      packageForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['packages'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const toggleMutation = useMutation({
    mutationFn: ({ productId, status }: { productId: string; status: 'on' | 'off' }) => adminApi.toggleProductStatus(productId, status),
    onSuccess: () => {
      message.success('商品状态已更新')
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const uploadImagesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const productName = String(productForm.getFieldValue('name') || 'product').trim() || 'product'
      const safeProductName = productName.replace(/[^\u4e00-\u9fa5\w-]+/g, '-').replace(/-+/g, '-')
      const uploaded: string[] = []

      for (const [index, file] of files.entries()) {
        const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
        const cloudPath = `products/images/${safeProductName}-${Date.now()}-${index}${ext}`
        const result = await uploadFileToCloud(cloudPath, file)
        const fileID = String(result.fileID || '').trim()
        if (!fileID) {
          throw new Error('图片上传成功但未返回文件地址')
        }
        uploaded.push(fileID)
      }

      return uploaded
    },
    onSuccess: uploaded => {
      setProductImages(prev => [...prev, ...uploaded])
      message.success(`已上传 ${uploaded.length} 张商品图片`)
    },
    onError: (error: Error) => message.error(error.message || '商品图片上传失败')
  })

  const packageProductOptions = useMemo(() => {
    return (productsQuery.data || [])
      .filter(item => item.type === 'package')
      .map(item => ({ label: item.name, value: item._id }))
  }, [productsQuery.data])

  const categoryOptions = useMemo(() => {
    const defaults = ['到店服务', '调理套餐', '实物商品', '热门推荐']
    const seen = new Set<string>(defaults)

    for (const item of productsQuery.data || []) {
      const categoryName = String(item.category || '').trim()
      if (categoryName) {
        seen.add(categoryName)
      }
    }

    return Array.from(seen)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map(item => ({ label: item, value: item }))
  }, [productsQuery.data])

  const productGroups = useMemo(() => {
    const grouped = new Map<string, ProductRecord[]>()
    for (const item of productsQuery.data || []) {
      const categoryName = String(item.category || '').trim() || '未分类'
      const current = grouped.get(categoryName) || []
      current.push(item)
      grouped.set(categoryName, current)
    }

    return Array.from(grouped.entries())
      .map(([category, items]) => ({
        category,
        items,
        activeCount: items.filter(item => item.status === 'on').length,
        mallVisibleCount: items.filter(item => item.showInMall).length
      }))
      .sort((left, right) => {
        if (left.category === '未分类') return 1
        if (right.category === '未分类') return -1
        return left.category.localeCompare(right.category, 'zh-CN')
      })
  }, [productsQuery.data])

  const productTagPreview = useMemo(() => parseListText(watchedTags).slice(0, 6), [watchedTags])

  useEffect(() => {
    let disposed = false
    const missingImages = productImages.filter(image => image && !imagePreviewMap[image])

    if (!missingImages.length) {
      return () => {
        disposed = true
      }
    }

    missingImages.forEach(image => {
      if (image.startsWith('cloud://')) {
        getTempFileUrl(image)
          .then(url => {
            if (!disposed) {
              setImagePreviewMap(prev => ({ ...prev, [image]: url || image }))
            }
          })
          .catch(() => {
            if (!disposed) {
              setImagePreviewMap(prev => ({ ...prev, [image]: image }))
            }
          })
      } else {
        setImagePreviewMap(prev => ({ ...prev, [image]: image }))
      }
    })

    return () => {
      disposed = true
    }
  }, [productImages, imagePreviewMap])

  useEffect(() => {
    const validKeys = new Set(productImages)
    setImagePreviewMap(prev => {
      const next = Object.fromEntries(Object.entries(prev).filter(([key]) => validKeys.has(key)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [productImages])

  function openCreateProductModal() {
    setProductEditorMode('create')
    productForm.resetFields()
    productForm.setFieldsValue({
      stock: -1,
      deliveryType: 'instore',
      status: 'on',
      showInMall: true,
      sortOrder: 0
    })
    setProductImages([])
    setImagePreviewMap({})
    setProductModalOpen(true)
  }

  function openEditProductModal(record: ProductRecord) {
    setProductEditorMode('edit')
    productForm.setFieldsValue({
      ...record,
      price: fenToYuanInput(record.price),
      originalPrice: fenToYuanInput(record.originalPrice),
      tags: formatListText(record.tags),
      deliveryType: 'instore'
    })
    setProductImages(Array.isArray(record.images) ? record.images : [])
    setImagePreviewMap({})
    setProductModalOpen(true)
  }

  const productColumns = [
    { title: '商品名', dataIndex: 'name', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 90, render: (value: string) => <Tag>{value || '未分类'}</Tag> },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (value: string) => <Tag color={PRODUCT_TYPE_COLORS[value] || 'default'}>{PRODUCT_TYPE_LABELS[value] || value}</Tag>
    },
    { title: '售价', dataIndex: 'priceYuan', width: 90, render: (value: string) => `¥${value}` },
    { title: '库存', dataIndex: 'stockLabel', width: 90 },
    { title: '状态', width: 80, render: (_: unknown, record: ProductRecord & { statusLabel: string }) => <Tag color={record.status === 'on' ? 'green' : 'default'}>{record.statusLabel}</Tag> },
    { title: '商城', width: 80, render: (_: unknown, record: ProductRecord) => <Tag color={record.showInMall ? 'blue' : 'default'}>{record.showInMall ? '可见' : '隐藏'}</Tag> },
    {
      title: '操作',
      width: 150,
      render: (_: unknown, record: ProductRecord) => (
        <Space size="small">
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => openEditProductModal(record)}>
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            style={{ padding: 0 }}
            danger={record.status === 'on'}
            onClick={() => toggleMutation.mutate({ productId: record._id, status: record.status === 'on' ? 'off' : 'on' })}
          >
            {record.status === 'on' ? '下架' : '上架'}
          </Button>
        </Space>
      )
    }
  ]

  const primaryImage = productImages[0]
  const primaryImagePreview = primaryImage ? imagePreviewMap[primaryImage] || '' : ''
  const productSummaryName = String(watchedName || '').trim() || '未命名商品'
  const productSummaryDescription = String(watchedDescription || '').trim() || '建议写一句顾客一眼就能看懂的卖点描述。'
  const productSummaryCategory = String(watchedCategory || '').trim() || '未分类'
  const productSummaryType = PRODUCT_TYPE_LABELS[String(watchedType || '')] || '待选择'
  const productSummaryStatus = watchedStatus === 'off' ? '下架中' : '上架中'
  const productSummaryMall = watchedShowInMall === false ? '商城隐藏' : '商城可见'
  const productSummaryPrice = formatPricePreview(watchedPrice)
  const productSummaryOriginalPrice = formatPricePreview(watchedOriginalPrice)
  const productSummaryStock = formatStockPreview(watchedStock)
  const productSummarySortOrder = watchedSortOrder === undefined || watchedSortOrder === null || watchedSortOrder === ''
    ? '0'
    : String(watchedSortOrder)

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">CATALOG STUDIO</div>
          <Typography.Title level={2}>商品与套餐管理</Typography.Title>
          <Typography.Paragraph>维护实物、服务、套餐和商城可见性，直接影响小程序前台商品展示。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => { packageForm.resetFields(); setPackageModalOpen(true) }}>新增套餐配置</Button>
          <Button type="primary" onClick={openCreateProductModal}>新增商品</Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'products',
            label: '商品',
            children: (
              <Card className="panel-card" bordered={false}>
                <div className="catalog-category-summary">
                  <div>
                    <Typography.Text strong>按分类管理商品</Typography.Text>
                    <Typography.Paragraph type="secondary">
                      当前共有 {(productsQuery.data || []).length} 个商品，分布在 {productGroups.length} 个分类中。没有分类的商品会自动归入“未分类”。
                    </Typography.Paragraph>
                  </div>
                  <Space wrap>
                    {productGroups.map(group => (
                      <Tag
                        key={group.category}
                        color="processing"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          const target = document.getElementById(`category-${group.category}`)
                          if (!target) return
                          const top = target.getBoundingClientRect().top + window.scrollY - 100
                          window.scrollTo({ top, behavior: 'smooth' })
                        }}
                      >
                        {group.category} {group.items.length}
                      </Tag>
                    ))}
                  </Space>
                </div>

                {productGroups.length ? (
                  <div className="catalog-category-list">
                    {productGroups.map(group => (
                      <section key={group.category} id={`category-${group.category}`} className="catalog-category-block">
                        <div className="catalog-category-header">
                          <div>
                            <Typography.Title level={5}>{group.category}</Typography.Title>
                            <Typography.Paragraph type="secondary">
                              共 {group.items.length} 个商品，上架 {group.activeCount} 个，商城可见 {group.mallVisibleCount} 个。
                            </Typography.Paragraph>
                          </div>
                          <Space wrap>
                            <Tag color="green">上架 {group.activeCount}</Tag>
                            <Tag color="blue">商城可见 {group.mallVisibleCount}</Tag>
                          </Space>
                        </div>
                        <Table
                          rowKey="_id"
                          pagination={false}
                          size="small"
                          loading={productsQuery.isLoading}
                          dataSource={group.items}
                          columns={productColumns}
                          scroll={{ x: 920 }}
                        />
                      </section>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无商品，先新增一个分类商品吧" />
                )}
              </Card>
            )
          },
          {
            key: 'packages',
            label: '套餐配置',
            children: (
              <Card className="panel-card" bordered={false}>
                <Table
                  rowKey="_id"
                  loading={packagesQuery.isLoading}
                  dataSource={packagesQuery.data || []}
                  columns={[
                    { title: '套餐商品', dataIndex: 'productName' },
                    { title: '有效期', dataIndex: 'validDays', width: 100, render: value => `${value} 天` },
                    { title: '服务项', dataIndex: 'itemsText' },
                    {
                      title: '操作',
                      width: 120,
                      render: (_, record) => (
                        <Button
                          size="small"
                          onClick={() => {
                            packageForm.setFieldsValue(record)
                            setPackageModalOpen(true)
                          }}
                        >
                          编辑
                        </Button>
                      )
                    }
                  ]}
                />
              </Card>
            )
          }
        ]}
      />

      <Drawer
        open={productModalOpen}
        title={(
          <div className="catalog-editor-title">
            <div className="hero-kicker">PRODUCT PUBLISHING</div>
            <Typography.Title level={4}>{productEditorMode === 'edit' ? '编辑商品' : '新增商品'}</Typography.Title>
            <Typography.Paragraph>
              按照电商上架流程整理主图、卖点、价格和发布状态，录入时不用在一堆字段里来回找。
            </Typography.Paragraph>
          </div>
        )}
        width={1180}
        className="catalog-editor-drawer"
        onClose={() => setProductModalOpen(false)}
        destroyOnHidden
        footer={(
          <div className="catalog-editor-footer">
            <Typography.Text type="secondary">保存后会立即同步到商品列表，商城展示状态以右侧设置为准。</Typography.Text>
            <Space>
              <Button onClick={() => setProductModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={() => productForm.submit()} loading={saveProductMutation.isPending}>
                保存商品
              </Button>
            </Space>
          </div>
        )}
      >
        <Form
          form={productForm}
          layout="vertical"
          onFinish={values => {
            const payload = {
              ...values,
              category: String(values.category || '').trim(),
              price: yuanToFen(values.price) || 0,
              originalPrice: yuanToFen(values.originalPrice),
              stock: values.stock === undefined || values.stock === null || values.stock === '' ? -1 : Number(values.stock),
              deliveryType: 'instore',
              tags: parseListText(values.tags),
              images: productImages
            }
            saveProductMutation.mutate(payload)
          }}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>

          <div className="catalog-editor-layout">
            <div className="catalog-editor-main">
              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Typography.Title level={5} style={{ margin: '0 0 4px' }}>商品主图与图册</Typography.Title>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        第一张图片会自动作为商品主图。
                      </Typography.Text>
                    </div>
                    <Tag color="processing">支持多图上传</Tag>
                  </div>
                </div>

                <div className="catalog-editor-cover-shell" style={{ display: 'flex', gap: 16 }}>
                  <div className="catalog-editor-cover-frame" style={{ width: 160, height: 160, background: '#f5f5f5', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                    {primaryImagePreview ? (
                      <img src={primaryImagePreview} alt="商品主图预览" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="catalog-editor-cover-empty" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center' }}>
                        <Typography.Text strong style={{ fontSize: 13, marginBottom: 4 }}>主图预览区</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
                          暂无图片
                        </Typography.Text>
                      </div>
                    )}
                  </div>

                  <div className="catalog-editor-upload-panel" style={{ flex: 1 }}>
                    <div className="catalog-editor-upload-actions" style={{ marginBottom: 12 }}>
                      <Space>
                        <label className="settings-upload-trigger" style={{ margin: 0, padding: '4px 16px', fontSize: 13 }}>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={event => {
                              const files = Array.from(event.target.files || [])
                              if (!files.length) return
                              uploadImagesMutation.mutate(files)
                              event.currentTarget.value = ''
                            }}
                          />
                          <span>{uploadImagesMutation.isPending ? '上传中...' : '上传图片'}</span>
                        </label>
                        {productImages.length ? (
                          <Button size="small" onClick={() => { setProductImages([]); setImagePreviewMap({}) }}>
                            清空图片
                          </Button>
                        ) : null}
                      </Space>
                    </div>
                    <div className="catalog-editor-tip-list" style={{ fontSize: 12, color: '#666', background: '#fafafa', padding: '8px 12px', borderRadius: 4 }}>
                      <div>1. 第一张默认作为封面主图。</div>
                      <div>2. 细节图建议补充使用场景、功效细节和包装实拍。</div>
                      <div>3. 主图建议用干净背景，避免文字过多。</div>
                    </div>
                  </div>
                </div>

                {productImages.length ? (
                  <div className="catalog-image-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                    {productImages.map((image, index) => (
                      <div key={`${image}-${index}`} className="catalog-image-item" style={{ width: 100 }}>
                        <div className="catalog-image-preview" style={{ width: 100, height: 100, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                          {imagePreviewMap[image] ? (
                            <img src={imagePreviewMap[image]} alt={`商品图 ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#999' }}>
                              加载中...
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>第 {index + 1} 张</Typography.Text>
                          {index === 0 ? <Tag color="gold" style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px' }}>主图</Tag> : null}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {index > 0 ? (
                            <Button
                              size="small"
                              type="link"
                              style={{ padding: 0, fontSize: 11, height: 'auto' }}
                              onClick={() => {
                                setProductImages(prev => [prev[index], ...prev.filter((_, itemIndex) => itemIndex !== index)])
                              }}
                            >
                              设为主图
                            </Button>
                          ) : (
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>主图展示中</Typography.Text>
                          )}
                          <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, fontSize: 11, height: 'auto' }}
                            danger
                            onClick={() => {
                              setProductImages(prev => prev.filter((_, itemIndex) => itemIndex !== index))
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>基础信息</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      先把顾客能看懂的商品名称、分类和一句话卖点写清楚，再补充标签和详情。
                    </Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={16}>
                    <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请填写商品名称' }]} style={{ marginBottom: 12 }}>
                      <Input placeholder="例如：肩颈调理 60 分钟 / 艾草暖宫套盒" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="category" label="分类" style={{ marginBottom: 12 }}>
                      <Select
                        showSearch
                        allowClear
                        options={categoryOptions}
                        placeholder="请选择商品分类"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item name="type" label="商品类型" rules={[{ required: true, message: '请选择商品类型' }]} style={{ marginBottom: 12 }}>
                      <Select options={PRODUCT_TYPE_OPTIONS} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={16}>
                    <Form.Item name="description" label="一句话卖点" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={2} placeholder="用顾客能立刻理解的语言说明商品适合谁、解决什么问题。" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="tags" label="标签（每行一个）" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={2} placeholder={'例如：\n热销\n适合初次到店\n可送礼'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="efficacy" label="功效说明" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={2} placeholder="例如：缓解肩颈紧张、改善寒凉体感、适合作为护理型复购项目。" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>价格与库存</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      这里决定顾客看到的售价和后台的库存提醒。库存默认 -1 表示不限。
                    </Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <Form.Item name="price" label="售价（元）" rules={[{ required: true, message: '请填写售价' }]} style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} placeholder="如 99.00" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="originalPrice" label="原价（元）" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} placeholder="如 199.00" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="stock" label="库存" style={{ marginBottom: 12 }}>
                      <InputNumber style={{ width: '100%' }} placeholder="默认 -1 不限" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="sortOrder" label="排序" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} style={{ width: '100%' }} placeholder="越大越靠前" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>图文详情</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      写服务流程、适用人群、注意事项或商品材质，让顾客在详情页看到完整信息。
                    </Typography.Text>
                  </div>
                </div>

                <Form.Item name="detail" label="详情描述" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={4} placeholder="建议分段写：适用人群、服务内容 / 商品规格、使用方式、注意事项。" />
                </Form.Item>
              </Card>
            </div>

            <div className="catalog-editor-side" style={{ width: 280, flexShrink: 0 }}>
              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16, position: 'sticky', top: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>商品摘要</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      右侧实时显示关键信息，方便检查发布内容。
                    </Typography.Text>
                  </div>
                </div>

                <div className="catalog-editor-summary-hero" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div className="catalog-editor-summary-cover" style={{ width: 80, height: 80, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {primaryImagePreview ? (
                      <img src={primaryImagePreview} alt="商品摘要主图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="catalog-editor-summary-empty" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#bfbfbf' }}>主图待传</div>
                    )}
                  </div>
                  <div className="catalog-editor-summary-copy" style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Title level={5} style={{ margin: '0 0 4px', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{productSummaryName}</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {productSummaryDescription}
                    </Typography.Paragraph>
                  </div>
                </div>

                <Space wrap className="catalog-editor-summary-tags" size={[0, 8]} style={{ display: 'flex' }}>
                  <Tag color="processing" style={{ margin: '0 8px 0 0', padding: '0 6px', fontSize: 12 }}>{productSummaryCategory}</Tag>
                  <Tag color={PRODUCT_TYPE_COLORS[String(watchedType || '')] || 'default'} style={{ margin: '0 8px 0 0', padding: '0 6px', fontSize: 12 }}>{productSummaryType}</Tag>
                  <Tag color={watchedStatus === 'off' ? 'default' : 'green'} style={{ margin: '0 8px 0 0', padding: '0 6px', fontSize: 12 }}>{productSummaryStatus}</Tag>
                  <Tag color={watchedShowInMall === false ? 'default' : 'blue'} style={{ margin: 0, padding: '0 6px', fontSize: 12 }}>{productSummaryMall}</Tag>
                </Space>

                <div className="catalog-editor-summary-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 16 }}>
                  <div className="catalog-editor-metric" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="catalog-editor-metric-label" style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>售价</span>
                    <strong style={{ fontSize: 14 }}>{productSummaryPrice}</strong>
                  </div>
                  <div className="catalog-editor-metric" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="catalog-editor-metric-label" style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>原价</span>
                    <strong style={{ fontSize: 14, color: '#999', textDecoration: 'line-through' }}>{productSummaryOriginalPrice}</strong>
                  </div>
                  <div className="catalog-editor-metric" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="catalog-editor-metric-label" style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>库存</span>
                    <strong style={{ fontSize: 14 }}>{productSummaryStock}</strong>
                  </div>
                  <div className="catalog-editor-metric" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="catalog-editor-metric-label" style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>排序</span>
                    <strong style={{ fontSize: 14 }}>{productSummarySortOrder}</strong>
                  </div>
                </div>

                {productTagPreview.length ? (
                  <div className="catalog-editor-tag-list" style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {productTagPreview.map(tag => <Tag key={tag} style={{ margin: 0, padding: '0 6px', fontSize: 12 }}>{tag}</Tag>)}
                  </div>
                ) : (
                  <div className="catalog-editor-summary-empty" style={{ marginTop: 16, fontSize: 12, color: '#bfbfbf' }}>还没有填写标签</div>
                )}
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>商品发布设置</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      控制商品是否上架、是否在商城显示。
                    </Typography.Text>
                  </div>
                </div>

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="status" label="商品状态" style={{ marginBottom: 12 }}>
                      <Select options={[{ label: '上架', value: 'on' }, { label: '下架', value: 'off' }]} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="showInMall" label="商城可见" valuePropName="checked" style={{ marginBottom: 12 }}>
                      <Switch checkedChildren="可见" unCheckedChildren="隐藏" />
                    </Form.Item>
                  </Col>
                </Row>

                <div className="catalog-editor-delivery-note" style={{ padding: 12, background: '#fafafa', borderRadius: 4, marginTop: 8 }}>
                  <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>交付方式</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
                    当前所有商品统一为到店领取，不需要额外配置快递。
                  </Typography.Text>
                  <Tag color="geekblue" style={{ margin: 0 }}>到店领取</Tag>
                </div>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small">
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>发布前检查</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      按这几个点快速检查一次。
                    </Typography.Text>
                  </div>
                </div>

                <div className="catalog-editor-tip-list" style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 4 }}>1. 主图是否清晰，第一眼能看懂卖什么。</div>
                  <div style={{ marginBottom: 4 }}>2. 一句话卖点是否直接说明效果或适用场景。</div>
                  <div style={{ marginBottom: 4 }}>3. 售价和原价是否填写正确，避免门店误售。</div>
                  <div>4. 标签和详情是否方便员工介绍、顾客下单。</div>
                </div>
              </Card>
            </div>
          </div>
        </Form>
      </Drawer>

      <Modal
        open={packageModalOpen}
        title="套餐配置"
        width={720}
        onCancel={() => setPackageModalOpen(false)}
        onOk={() => packageForm.submit()}
        confirmLoading={savePackageMutation.isPending}
        destroyOnHidden
      >
        <Form form={packageForm} layout="vertical" onFinish={values => savePackageMutation.mutate(values)}>
          <Form.Item name="_id" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="productId" label="关联套餐商品" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <Select options={packageProductOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="validDays" label="有效期（天）" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Typography.Text strong>服务项列表</Typography.Text>
          </div>

          <Form.List name="items" initialValue={[{ name: '', count: 1 }]}>
            {(fields, { add, remove }) => (
              <div className="form-list-block" style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                {fields.map((field, index) => (
                  <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 12, width: '100%' }}>
                    <div style={{ width: 24, paddingTop: 6, color: '#bfbfbf' }}>{index + 1}.</div>
                    <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true }]} style={{ width: 340, marginBottom: 0 }}>
                      <Input placeholder="服务名称" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'count']} rules={[{ required: true }]} style={{ width: 140, marginBottom: 0 }}>
                      <InputNumber min={1} style={{ width: '100%' }} prefix="次数:" />
                    </Form.Item>
                    <Button danger type="text" onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ name: '', count: 1 })} style={{ width: '100%', marginTop: 4 }}>
                  + 新增服务项
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
