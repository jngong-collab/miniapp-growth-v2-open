import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Drawer, Empty, Form, Input, InputNumber, Row, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '../lib/admin-api'
import { getTempFileUrl, uploadFileToCloud } from '../lib/cloudbase'
import { fenToYuanInput, yuanToFen } from '../lib/money'
import type { PackageRecord, ProductRecord } from '../types/admin'

const PRODUCT_TYPE_OPTIONS = [
  { label: '实物', value: 'physical' },
  { label: '服务', value: 'service' }
]

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  physical: '实物',
  service: '服务',
  package: '套餐'
}

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  physical: 'orange',
  service: 'blue',
  package: 'purple'
}

const PRIORITY_CATEGORIES = ['超值套餐']
const DEFAULT_PRODUCT_CATEGORY_OPTIONS = ['到店服务', '实物商品', '热门推荐']
const DEFAULT_PACKAGE_CATEGORY_OPTIONS = ['超值套餐', '调理套餐']

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
  return `${amount}`
}

function compareCategoryOrder(left: string, right: string) {
  const leftIndex = PRIORITY_CATEGORIES.indexOf(left)
  const rightIndex = PRIORITY_CATEGORIES.indexOf(right)
  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1
    if (rightIndex === -1) return -1
    return leftIndex - rightIndex
  }
  if (left === '未分类') return 1
  if (right === '未分类') return -1
  return left.localeCompare(right, 'zh-CN')
}

function useImagePreviewMap(images: string[]) {
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const fetchingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let disposed = false
    const validKeys = new Set(images)
    const pending = images.filter(image => image && !previewMap[image] && !fetchingRef.current.has(image) && validKeys.has(image))
    if (!pending.length) {
      return () => {
        disposed = true
      }
    }

    pending.forEach(image => {
      fetchingRef.current.add(image)
      if (image.startsWith('cloud://')) {
        getTempFileUrl(image)
          .then(url => {
            fetchingRef.current.delete(image)
            if (!disposed) {
              setPreviewMap(prev => ({ ...prev, [image]: url || image }))
            }
          })
          .catch(() => {
            fetchingRef.current.delete(image)
            if (!disposed) {
              setPreviewMap(prev => ({ ...prev, [image]: image }))
            }
          })
        return
      }

      fetchingRef.current.delete(image)
      setPreviewMap(prev => ({ ...prev, [image]: image }))
    })

    return () => {
      disposed = true
    }
  }, [images])

  return previewMap
}

async function uploadCatalogImages(entityName: string, files: File[], folder: 'products' | 'packages') {
  const safeName = String(entityName || folder)
    .trim()
    .replace(/[^\u4e00-\u9fa5\w-]+/g, '-')
    .replace(/-+/g, '-') || folder
  const uploaded: string[] = []

  for (const [index, file] of files.entries()) {
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
    const cloudPath = `${folder}/images/${safeName}-${Date.now()}-${index}${ext}`
    const result = await uploadFileToCloud(cloudPath, file)
    const fileID = String(result.fileID || '').trim()
    if (!fileID) {
      throw new Error('图片上传成功但未返回文件地址')
    }
    uploaded.push(fileID)
  }

  return uploaded
}

interface CatalogSummaryCardProps {
  category: string
  description: string
  name: string
  type: string
  status: string
  showInMall: boolean
  price: unknown
  originalPrice: unknown
  stock: unknown
  sortOrder: unknown
  tags: string[]
  image?: string
}

function CatalogSummaryCard(props: CatalogSummaryCardProps) {
  return (
    <Card className="panel-card catalog-editor-card" bordered={false} size="small">
      <div className="catalog-editor-section-head">
        <div>
          <Typography.Title level={5}>内容摘要</Typography.Title>
          <Typography.Text type="secondary">右侧实时预览当前录入内容，方便上架前快速自查。</Typography.Text>
        </div>
      </div>

      <div className="catalog-editor-summary-hero">
        <div className="catalog-editor-summary-cover">
          {props.image ? (
            <img src={props.image} alt="主图预览" />
          ) : (
            <div className="catalog-editor-summary-empty">
              <Typography.Text>主图待上传</Typography.Text>
            </div>
          )}
        </div>

        <div className="catalog-editor-summary-copy">
          <Typography.Title level={5}>{props.name || '未命名内容'}</Typography.Title>
          <Typography.Paragraph type="secondary">{props.description || '建议用一句话说清适合人群、核心卖点和交付方式。'}</Typography.Paragraph>
        </div>
      </div>

      <Space wrap className="catalog-editor-summary-tags">
        <Tag color="processing">{props.category || '未分类'}</Tag>
        <Tag color={PRODUCT_TYPE_COLORS[props.type] || 'default'}>{PRODUCT_TYPE_LABELS[props.type] || '待选择'}</Tag>
        <Tag color={props.status === 'on' ? 'green' : 'default'}>{props.status === 'on' ? '上架中' : '已下架'}</Tag>
        <Tag color={props.showInMall ? 'blue' : 'default'}>{props.showInMall ? '商城可见' : '商城隐藏'}</Tag>
      </Space>

      <div className="catalog-editor-summary-metrics">
        <div className="catalog-editor-metric">
          <span className="catalog-editor-metric-label">售价</span>
          <strong>{formatPricePreview(props.price)}</strong>
        </div>
        <div className="catalog-editor-metric">
          <span className="catalog-editor-metric-label">原价</span>
          <strong>{formatPricePreview(props.originalPrice)}</strong>
        </div>
        <div className="catalog-editor-metric">
          <span className="catalog-editor-metric-label">库存</span>
          <strong>{formatStockPreview(props.stock)}</strong>
        </div>
        <div className="catalog-editor-metric">
          <span className="catalog-editor-metric-label">排序</span>
          <strong>{props.sortOrder === undefined || props.sortOrder === null || props.sortOrder === '' ? '0' : String(props.sortOrder)}</strong>
        </div>
      </div>

      {props.tags.length ? (
        <div className="catalog-editor-tag-list">
          {props.tags.slice(0, 8).map(tag => <Tag key={tag}>{tag}</Tag>)}
        </div>
      ) : null}
    </Card>
  )
}

interface ImageGalleryEditorProps {
  disabled?: boolean
  images: string[]
  previewMap: Record<string, string>
  title: string
  description: string
  folder: 'products' | 'packages'
  entityName: string
  onChange: (images: string[]) => void
  generatingImage?: boolean
  onGenerateImage?: () => void
}

function ImageGalleryEditor(props: ImageGalleryEditorProps) {
  const { message } = App.useApp()
  const [uploading, setUploading] = useState(false)

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setUploading(true)
    try {
      const uploaded = await uploadCatalogImages(props.entityName, files, props.folder)
      props.onChange([...props.images, ...uploaded])
      message.success(`已上传 ${uploaded.length} 张图片`)
    } catch (error) {
      const err = error as Error
      message.error(err.message || '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const generatingImage = props.generatingImage || false

  return (
    <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
      <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Title level={5} style={{ margin: '0 0 4px' }}>{props.title}</Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{props.description}</Typography.Text>
          </div>
          <Tag color="processing">支持多图上传</Tag>
        </div>
      </div>

      <div className="catalog-editor-cover-shell" style={{ display: 'flex', gap: 16 }}>
        <div className="catalog-editor-cover-frame" style={{ width: 120, height: 120, background: '#f5f5f5', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {props.images[0] && props.previewMap[props.images[0]] ? (
            <img src={props.previewMap[props.images[0]]} alt="主图" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="catalog-editor-cover-empty" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
              {generatingImage ? (
                <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>正在生成...</Typography.Text>
              ) : (
                <>
                  <Typography.Text strong style={{ fontSize: 12, marginBottom: 4 }}>主图预览区</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>暂无图片</Typography.Text>
                </>
              )}
            </div>
          )}
        </div>

        <div className="catalog-editor-upload-panel" style={{ flex: 1 }}>
          <div className="catalog-editor-upload-actions" style={{ marginBottom: 12 }}>
            <Space>
              <label className="settings-upload-trigger" style={{ margin: 0, padding: '4px 16px', fontSize: 13 }}>
                {uploading ? '上传中...' : '上传图片'}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={props.disabled || uploading || generatingImage}
                  onChange={event => {
                    void handleFiles(event.target.files)
                    event.currentTarget.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              <Button
                size="small"
                loading={generatingImage}
                onClick={props.onGenerateImage}
              >
                AI 生成主图
              </Button>
              {props.images.length ? (
                <Button size="small" onClick={() => props.onChange([])}>
                  清空图片
                </Button>
              ) : null}
            </Space>
          </div>

          <div className="catalog-editor-tip-list" style={{ fontSize: 12, color: '#666', background: '#fafafa', padding: '8px 12px', borderRadius: 4, lineHeight: 1.5 }}>
            <div style={{ marginBottom: 2 }}>1. 第一张图建议直接表现主卖点。</div>
            <div style={{ marginBottom: 2 }}>2. 也可以点击「AI 生成主图」自动生成精美图，建议先填商品名。</div>
            <div>3. 套餐图建议体现组合价值，商品图建议体现单项卖点。</div>
          </div>
        </div>
      </div>

      {props.images.length ? (
        <div className="catalog-image-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {props.images.map((image, index) => (
            <div key={image} className="catalog-image-item" style={{ width: 80 }}>
              <div className="catalog-image-preview" style={{ width: 80, height: 80, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                {props.previewMap[image] ? (
                  <img src={props.previewMap[image]} alt={`图片 ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999' }}>
                    加载中...
                  </div>
                )}
              </div>
              <div className="catalog-image-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>第 {index + 1} 张</Typography.Text>
                {index === 0 ? <Tag color="gold" style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px' }}>主图</Tag> : null}
              </div>
              <div className="catalog-image-actions" style={{ display: 'flex', gap: 4 }}>
                {index > 0 ? (
                  <Button size="small" type="link" style={{ padding: 0, fontSize: 11, height: 'auto' }} onClick={() => props.onChange([props.images[index], ...props.images.filter((_, currentIndex) => currentIndex !== index)])}>
                    设为主图
                  </Button>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>主图展示中</Typography.Text>
                )}
                <Button
                  size="small"
                  type="link"
                  danger
                  style={{ padding: 0, fontSize: 11, height: 'auto' }}
                  onClick={() => props.onChange(props.images.filter((_, currentIndex) => currentIndex !== index))}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

export function CatalogPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [productForm] = Form.useForm()
  const [packageForm] = Form.useForm()

  const [productDrawerOpen, setProductDrawerOpen] = useState(false)
  const [packageDrawerOpen, setPackageDrawerOpen] = useState(false)
  const [productEditorMode, setProductEditorMode] = useState<'create' | 'edit'>('create')
  const [packageEditorMode, setPackageEditorMode] = useState<'create' | 'edit'>('create')
  const [productImages, setProductImages] = useState<string[]>([])
  const [packageImages, setPackageImages] = useState<string[]>([])

  const productPreviewMap = useImagePreviewMap(productImages)
  const packagePreviewMap = useImagePreviewMap(packageImages)

  const productsQuery = useQuery({ queryKey: ['products'], queryFn: adminApi.listProducts })
  const packagesQuery = useQuery({ queryKey: ['packages'], queryFn: adminApi.listPackages })

  const saveProductMutation = useMutation({
    mutationFn: adminApi.saveProduct,
    onSuccess: () => {
      message.success('商品已保存')
      setProductDrawerOpen(false)
      productForm.resetFields()
      setProductImages([])
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: Error) => message.error(error.message)
  })

  const savePackageMutation = useMutation({
    mutationFn: adminApi.savePackage,
    onSuccess: () => {
      message.success('套餐已保存')
      setPackageDrawerOpen(false)
      packageForm.resetFields()
      setPackageImages([])
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['packages'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] })
      ])
    },
    onError: (error: Error) => message.error(error.message)
  })

  const toggleMutation = useMutation({
    mutationFn: ({ productId, status }: { productId: string; status: 'on' | 'off' }) =>
      adminApi.toggleProductStatus(productId, status),
    onSuccess: () => {
      message.success('状态已更新')
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['packages'] })
      ])
    },
    onError: (error: Error) => message.error(error.message)
  })

  const deletePackageMutation = useMutation({
    mutationFn: ({ packageId, productId }: { packageId: string; productId: string }) =>
      adminApi.deletePackage(packageId, productId),
    onSuccess: () => {
      message.success('套餐已删除')
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['packages'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] })
      ])
    },
    onError: (error: Error) => message.error(error.message)
  })

  const productRows = useMemo(
    () => (productsQuery.data || []).filter(item => item.type !== 'package' && (item as ProductRecord & { archived?: boolean }).archived !== true),
    [productsQuery.data]
  )

  const packageRows = useMemo(
    () => (packagesQuery.data || []).filter(item => (item as PackageRecord & { archived?: boolean }).archived !== true),
    [packagesQuery.data]
  )

  const categoryOptions = useMemo(() => {
    const seen = new Set(DEFAULT_PRODUCT_CATEGORY_OPTIONS)
    productRows.forEach(item => {
      const category = String(item.category || '').trim()
      if (category) seen.add(category)
    })
    return Array.from(seen)
      .sort(compareCategoryOrder)
      .map(item => ({ label: item, value: item }))
  }, [productRows])

  const packageCategoryOptions = useMemo(() => {
    const seen = new Set(DEFAULT_PACKAGE_CATEGORY_OPTIONS)
    packageRows.forEach(item => {
      const category = String(item.category || '').trim()
      if (category) seen.add(category)
    })
    return Array.from(seen)
      .sort(compareCategoryOrder)
      .map(item => ({ label: item, value: item }))
  }, [packageRows])

  const productGroups = useMemo(() => {
    const grouped = new Map<string, ProductRecord[]>()
    productRows.forEach(item => {
      const category = String(item.category || '').trim() || '未分类'
      const current = grouped.get(category) || []
      current.push(item)
      grouped.set(category, current)
    })
    return Array.from(grouped.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) => Number(right.sortOrder || 0) - Number(left.sortOrder || 0)),
        activeCount: items.filter(item => item.status === 'on').length,
        mallVisibleCount: items.filter(item => item.showInMall).length
      }))
      .sort((left, right) => compareCategoryOrder(left.category, right.category))
  }, [productRows])

  const productColumns: ColumnsType<ProductRecord> = [
    { title: '商品名', dataIndex: 'name', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 120, render: value => <Tag>{value || '未分类'}</Tag> },
    { title: '类型', dataIndex: 'type', width: 96, render: value => <Tag color={PRODUCT_TYPE_COLORS[value] || 'default'}>{PRODUCT_TYPE_LABELS[value] || value}</Tag> },
    { title: '售价', dataIndex: 'priceYuan', width: 96, render: value => `¥${value}` },
    { title: '库存', dataIndex: 'stockLabel', width: 96 },
    { title: '排序', dataIndex: 'sortOrder', width: 88 },
    { title: '状态', dataIndex: 'statusLabel', width: 96, render: (_value, record) => <Tag color={record.status === 'on' ? 'green' : 'default'}>{record.statusLabel}</Tag> },
    { title: '商城', width: 96, render: (_value, record) => <Tag color={record.showInMall ? 'blue' : 'default'}>{record.showInMall ? '可见' : '隐藏'}</Tag> },
    {
      title: '操作',
      width: 160,
      render: (_value, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openProductEditor(record)}>编辑</Button>
          <Button
            size="small"
            type="link"
            danger={record.status === 'on'}
            onClick={() => toggleMutation.mutate({ productId: record._id, status: record.status === 'on' ? 'off' : 'on' })}
          >
            {record.status === 'on' ? '下架' : '上架'}
          </Button>
        </Space>
      )
    }
  ]

  const [generatingImage, setGeneratingImage] = useState(false)

  const generateImageMutation = useMutation({
    mutationFn: adminApi.generateImage,
    onSuccess: (res) => {
      setGeneratingImage(false)
      message.success('主图生成成功！')
      // Update form image logic depending on active modal
      if (productDrawerOpen) {
        setProductImages(prev => [res.url, ...prev])
      } else if (packageDrawerOpen) {
        setPackageImages(prev => [res.url, ...prev])
      }
    },
    onError: (error: Error) => {
      setGeneratingImage(false)
      message.error(error.message || '主图生成失败')
    }
  })

  function handleGenerateImage(nameContext: string, descContext: string) {
    if (!nameContext) {
      message.warning('请先填写名称再生成主图')
      return
    }

    setGeneratingImage(true)
    const prompt = `A premium, high-quality, professional product photography style image for a spa or wellness service called "${nameContext}". ${descContext ? 'Description: ' + descContext : ''}. The image should feel relaxing, clean, minimalist, high-end, and inviting. Soft natural lighting, elegant composition, modern oriental wellness aesthetic. No text or logos in the image.`

    generateImageMutation.mutate(prompt)
  }

  const packageColumns: ColumnsType<PackageRecord> = [
    { title: '套餐名称', dataIndex: 'name', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 110, render: value => <Tag color="purple">{value || '超值套餐'}</Tag> },
    { title: '售价', dataIndex: 'priceYuan', width: 96, render: value => `¥${value}` },
    { title: '有效期', dataIndex: 'validDays', width: 100, render: value => `${value} 天` },
    { title: '服务项', dataIndex: 'itemsText', ellipsis: true },
    { title: '状态', width: 96, render: (_value, record) => <Tag color={record.status === 'on' ? 'green' : 'default'}>{record.statusLabel}</Tag> },
    { title: '商城', width: 96, render: (_value, record) => <Tag color={record.showInMall ? 'blue' : 'default'}>{record.showInMall ? '可见' : '隐藏'}</Tag> },
    {
      title: '操作',
      width: 200,
      render: (_value, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openPackageEditor(record)}>编辑</Button>
          <Button
            size="small"
            type="link"
            danger={record.status === 'on'}
            onClick={() => toggleMutation.mutate({ productId: record.productId, status: record.status === 'on' ? 'off' : 'on' })}
          >
            {record.status === 'on' ? '下架' : '上架'}
          </Button>
          <Button
            size="small"
            type="link"
            danger
            onClick={() => {
              modal.confirm({
                title: '删除套餐',
                content: `删除后，套餐 ${record.name} 会从后台和商城隐藏，且套餐配置会一并移除。`,
                okText: '确认删除',
                okButtonProps: { danger: true, loading: deletePackageMutation.isPending },
                cancelText: '取消',
                onOk: async () => {
                  await deletePackageMutation.mutateAsync({ packageId: record._id, productId: record.productId })
                }
              })
            }}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  const watchedProductName = Form.useWatch('name', productForm)
  const watchedProductCategory = Form.useWatch('category', productForm)
  const watchedProductType = Form.useWatch('type', productForm)
  const watchedProductPrice = Form.useWatch('price', productForm)
  const watchedProductOriginalPrice = Form.useWatch('originalPrice', productForm)
  const watchedProductStock = Form.useWatch('stock', productForm)
  const watchedProductSortOrder = Form.useWatch('sortOrder', productForm)
  const watchedProductDescription = Form.useWatch('description', productForm)
  const watchedProductTags = Form.useWatch('tags', productForm)
  const watchedProductStatus = Form.useWatch('status', productForm)
  const watchedProductShowInMall = Form.useWatch('showInMall', productForm)

  const watchedPackageName = Form.useWatch('name', packageForm)
  const watchedPackageCategory = Form.useWatch('category', packageForm)
  const watchedPackagePrice = Form.useWatch('price', packageForm)
  const watchedPackageOriginalPrice = Form.useWatch('originalPrice', packageForm)
  const watchedPackageStock = Form.useWatch('stock', packageForm)
  const watchedPackageSortOrder = Form.useWatch('sortOrder', packageForm)
  const watchedPackageDescription = Form.useWatch('description', packageForm)
  const watchedPackageTags = Form.useWatch('tags', packageForm)
  const watchedPackageStatus = Form.useWatch('status', packageForm)
  const watchedPackageShowInMall = Form.useWatch('showInMall', packageForm)

  function openProductCreate() {
    setProductEditorMode('create')
    setProductImages([])
    productForm.resetFields()
    productForm.setFieldsValue({
      type: 'service',
      stock: -1,
      sortOrder: 0,
      deliveryType: 'instore',
      status: 'on',
      showInMall: true
    })
    setProductDrawerOpen(true)
  }

  function openProductEditor(record: ProductRecord) {
    setProductEditorMode('edit')
    setProductImages(Array.isArray(record.images) ? record.images : [])
    productForm.setFieldsValue({
      ...record,
      price: fenToYuanInput(record.price),
      originalPrice: fenToYuanInput(record.originalPrice),
      tags: formatListText(record.tags),
      deliveryType: 'instore'
    })
    setProductDrawerOpen(true)
  }

  function openPackageCreate() {
    setPackageEditorMode('create')
    setPackageImages([])
    packageForm.resetFields()
    packageForm.setFieldsValue({
      category: '超值套餐',
      stock: -1,
      sortOrder: 0,
      status: 'on',
      showInMall: true,
      validDays: 180,
      items: [{ name: '', count: 1 }]
    })
    setPackageDrawerOpen(true)
  }

  function openPackageEditor(record: PackageRecord) {
    setPackageEditorMode('edit')
    setPackageImages(Array.isArray(record.images) ? record.images : [])
    packageForm.setFieldsValue({
      ...record,
      _id: record._id,
      productId: record.productId,
      price: fenToYuanInput(record.price),
      originalPrice: fenToYuanInput(record.originalPrice),
      tags: formatListText(record.tags),
      items: record.items?.length ? record.items : [{ name: '', count: 1 }]
    })
    setPackageDrawerOpen(true)
  }

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <div className="hero-kicker">CATALOG STUDIO</div>
          <Typography.Title level={2}>商品 / 套餐管理</Typography.Title>
          <Typography.Paragraph>
            商品流只管理普通商品与服务，套餐单独作为完整实体在“套餐管理”里直接新增、编辑、删除和上下架。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={openPackageCreate}>新增套餐</Button>
          <Button type="primary" onClick={openProductCreate}>新增商品</Button>
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
                      这里只展示普通商品与服务。套餐已经从商品流中拆出，不再要求先在商品里建一个“套餐商品”再去配置。
                    </Typography.Paragraph>
                  </div>
                  <Space wrap>
                    <Tag color="blue">商品 {productRows.length}</Tag>
                    <Tag color="green">上架 {productRows.filter(item => item.status === 'on').length}</Tag>
                    <Tag color="processing">分类 {productGroups.length}</Tag>
                  </Space>
                </div>

                {productGroups.length ? (
                  <div className="catalog-category-list">
                    {productGroups.map(group => (
                      <section key={group.category} className="catalog-category-block">
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
                          size="small"
                          pagination={false}
                          loading={productsQuery.isLoading}
                          dataSource={group.items}
                          columns={productColumns}
                          scroll={{ x: 920 }}
                        />
                      </section>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无商品，先新增一个服务或实物商品" />
                )}
              </Card>
            )
          },
          {
            key: 'packages',
            label: '套餐管理',
            children: (
              <Card className="panel-card" bordered={false}>
                <div className="catalog-category-summary">
                  <div>
                    <Typography.Text strong>套餐管理</Typography.Text>
                    <Typography.Paragraph type="secondary">
                      在这里直接完成套餐上架、套餐内容配置和删除，不再额外经过“套餐配置”二级入口。
                    </Typography.Paragraph>
                  </div>
                  <Space wrap>
                    <Tag color="purple">超值套餐 {packageRows.length}</Tag>
                    <Tag color="green">上架 {packageRows.filter(item => item.status === 'on').length}</Tag>
                    <Tag color="blue">商城可见 {packageRows.filter(item => item.showInMall).length}</Tag>
                  </Space>
                </div>

                <Table
                  rowKey="_id"
                  loading={packagesQuery.isLoading}
                  dataSource={packageRows}
                  columns={packageColumns}
                  scroll={{ x: 1040 }}
                  pagination={false}
                  locale={{
                    emptyText: <Empty description="暂无套餐，直接在这里创建第一个套餐" />
                  }}
                />
              </Card>
            )
          }
        ]}
      />

      <Drawer
        width={1180}
        open={productDrawerOpen}
        destroyOnHidden
        className="catalog-editor-drawer"
        onClose={() => setProductDrawerOpen(false)}
        title={(
          <div className="catalog-editor-title">
            <div className="hero-kicker">PRODUCT EDITOR</div>
            <Typography.Title level={4}>{productEditorMode === 'edit' ? '编辑商品' : '新增商品'}</Typography.Title>
            <Typography.Paragraph>商品页只保留普通商品与服务字段，不再出现套餐类型和套餐配置入口。</Typography.Paragraph>
          </div>
        )}
        footer={(
          <div className="catalog-editor-footer">
            <Typography.Text type="secondary">保存后会直接刷新商品工作台，商城展示状态以上架与可见设置为准。</Typography.Text>
            <Space>
              <Button onClick={() => setProductDrawerOpen(false)}>取消</Button>
              <Button type="primary" loading={saveProductMutation.isPending} onClick={() => productForm.submit()}>保存商品</Button>
            </Space>
          </div>
        )}
      >
        <Form
          form={productForm}
          layout="vertical"
          onFinish={values => {
            saveProductMutation.mutate({
              ...values,
              category: String(values.category || '').trim(),
              price: yuanToFen(values.price) || 0,
              originalPrice: yuanToFen(values.originalPrice),
              stock: values.stock === undefined || values.stock === null || values.stock === '' ? -1 : Number(values.stock),
              deliveryType: 'instore',
              tags: parseListText(values.tags),
              images: productImages
            })
          }}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>

          <div className="catalog-editor-layout">
            <div className="catalog-editor-main">
              <ImageGalleryEditor
                title="商品主图与图册"
                description="第一张会自动作为商品主图，支持多图上传和拖拽式主图置顶。"
                images={productImages}
                previewMap={productPreviewMap}
                folder="products"
                entityName={String(watchedProductName || '').trim() || 'product'}
                onChange={setProductImages}
                generatingImage={generatingImage}
                onGenerateImage={() => handleGenerateImage(watchedProductName, watchedProductDescription)}
              />

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>基础信息</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>这里定义前台看到的名称、分类、卖点和标签。</Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={16}>
                    <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请填写商品名称' }]} style={{ marginBottom: 12 }}>
                      <Input placeholder="例如：肩颈调理 60 分钟" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="category" label="分类" style={{ marginBottom: 12 }}>
                      <Select showSearch allowClear options={categoryOptions} placeholder="请选择商品分类" />
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
                      <Input.TextArea rows={2} placeholder="用顾客能秒懂的表达描述场景与价值。" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="tags" label="标签（每行一个）" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={3} placeholder={'例如：\n热销\n适合初次到店'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="efficacy" label="功效说明" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={3} placeholder="补充适用人群、功效和服务特点。" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="detail" label="详情描述" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={5} placeholder="建议分段说明服务流程、注意事项、规格或使用方式。" />
                </Form.Item>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>价格与发布</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>统一按元录入，保存时自动转成分。</Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <Form.Item name="price" label="售价（元）" rules={[{ required: true, message: '请填写售价' }]} style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="originalPrice" label="原价（元）" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="stock" label="库存" style={{ marginBottom: 12 }}>
                      <InputNumber style={{ width: '100%' }} placeholder="-1 表示不限库存" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="sortOrder" label="排序" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <Form.Item name="status" label="商品状态" style={{ marginBottom: 12 }}>
                      <Select options={[{ label: '上架', value: 'on' }, { label: '下架', value: 'off' }]} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="showInMall" label="商城可见" valuePropName="checked" style={{ marginBottom: 12 }}>
                      <Switch checkedChildren="可见" unCheckedChildren="隐藏" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <div className="catalog-editor-delivery-note" style={{ padding: 12, background: '#fafafa', borderRadius: 4, marginTop: 8 }}>
                      <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>交付方式</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8, lineHeight: 1.4 }}>
                        当前所有商品统一为到店领取。
                      </Typography.Text>
                      <Tag color="geekblue" style={{ margin: 0 }}>到店领取</Tag>
                    </div>
                  </Col>
                </Row>
              </Card>
            </div>

            <div className="catalog-editor-side" style={{ width: 280, flexShrink: 0 }}>
              <CatalogSummaryCard
                category={String(watchedProductCategory || '').trim()}
                description={String(watchedProductDescription || '').trim()}
                name={String(watchedProductName || '').trim()}
                type={String(watchedProductType || '').trim()}
                status={String(watchedProductStatus || 'on')}
                showInMall={watchedProductShowInMall !== false}
                price={watchedProductPrice}
                originalPrice={watchedProductOriginalPrice}
                stock={watchedProductStock}
                sortOrder={watchedProductSortOrder}
                tags={parseListText(watchedProductTags)}
                image={productImages[0] ? productPreviewMap[productImages[0]] : ''}
              />

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginTop: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>发布前检查</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>保存前确认主图、价格、状态和文案是否一致。</Typography.Text>
                  </div>
                </div>
                <div className="catalog-editor-tip-list" style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 4 }}>1. 商品图片是否清晰，封面是否直观。</div>
                  <div style={{ marginBottom: 4 }}>2. 售价（元）与原价（元）是否准确。</div>
                  <div style={{ marginBottom: 4 }}>3. 商品类型只在“实物 / 服务”里选。</div>
                  <div>4. 商城可见与上下架状态是否符合计划。</div>
                </div>
              </Card>
            </div>
          </div>
        </Form>
      </Drawer>

      <Drawer
        width={1220}
        open={packageDrawerOpen}
        destroyOnHidden
        className="catalog-editor-drawer"
        onClose={() => setPackageDrawerOpen(false)}
        title={(
          <div className="catalog-editor-title">
            <div className="hero-kicker">PACKAGE WORKBENCH</div>
            <Typography.Title level={4}>{packageEditorMode === 'edit' ? '编辑套餐' : '新增套餐'}</Typography.Title>
            <Typography.Paragraph>套餐在这里直接完成商品信息、套餐内容、有效期、上下架和删除，不再拆成“商品 + 套餐配置”。</Typography.Paragraph>
          </div>
        )}
        footer={(
          <div className="catalog-editor-footer">
            <Typography.Text type="secondary">保存时会一并更新底层套餐商品和套餐配置文档，前台购买链路保持兼容。</Typography.Text>
            <Space>
              <Button onClick={() => setPackageDrawerOpen(false)}>取消</Button>
              <Button type="primary" loading={savePackageMutation.isPending} onClick={() => packageForm.submit()}>保存套餐</Button>
            </Space>
          </div>
        )}
      >
        <Form
          form={packageForm}
          layout="vertical"
          onFinish={values => {
            savePackageMutation.mutate({
              ...values,
              type: 'package',
              category: String(values.category || '').trim() || '超值套餐',
              price: yuanToFen(values.price) || 0,
              originalPrice: yuanToFen(values.originalPrice),
              stock: values.stock === undefined || values.stock === null || values.stock === '' ? -1 : Number(values.stock),
              deliveryType: 'instore',
              tags: parseListText(values.tags),
              images: packageImages,
              items: (values.items || []).map((item: { name?: string; count?: number }) => ({
                name: String(item?.name || '').trim(),
                count: Number(item?.count || 0)
              }))
            })
          }}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>
          <Form.Item name="productId" hidden><Input /></Form.Item>

          <div className="catalog-editor-layout">
            <div className="catalog-editor-main">
              <ImageGalleryEditor
                title="商品主图与图册"
                description="第一张会自动作为商品主图"
                images={packageImages}
                previewMap={packagePreviewMap}
                folder="packages"
                entityName={String(watchedPackageName || '').trim() || 'package'}
                onChange={setPackageImages}
                generatingImage={generatingImage}
                onGenerateImage={() => handleGenerateImage(watchedPackageName, watchedPackageDescription)}
              />

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>基础信息</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>维护套餐名称、分类、卖点及有效期。</Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={16}>
                    <Form.Item name="name" label="套餐名称" rules={[{ required: true, message: '请填写套餐名称' }]} style={{ marginBottom: 12 }}>
                      <Input placeholder="例如：脾胃调理 5 次套餐" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="category" label="分类" style={{ marginBottom: 12 }}>
                      <Select options={packageCategoryOptions} placeholder="请选择商品分类" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={16}>
                    <Form.Item name="description" label="一句话卖点" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={2} placeholder="说明套餐适合谁、包含什么、为什么划算。" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="validDays" label="有效期（天）" rules={[{ required: true, message: '请填写有效期' }]} style={{ marginBottom: 12 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="tags" label="标签（每行一个）" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={3} placeholder={'例如：\n复购套餐\n到店护理'} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="efficacy" label="套餐说明" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={3} placeholder="说明套餐定位、适用人群和组合价值。" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="detail" label="详情描述" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={4} placeholder="可以写套餐使用建议、每项服务安排和门店说明。" />
                </Form.Item>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>套餐内容</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>在套餐管理页直接新增、修改、删除套餐服务项。</Typography.Text>
                  </div>
                </div>

                <Form.List name="items" initialValue={[{ name: '', count: 1 }]}>
                  {(fields, { add, remove }) => (
                    <div className="form-list-block" style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                      {fields.map((field, index) => (
                        <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 12, width: '100%' }}>
                          <div style={{ width: 24, paddingTop: 6, color: '#bfbfbf' }}>{index + 1}.</div>
                          <Form.Item
                            {...field}
                            name={[field.name, 'name']}
                            rules={[{ required: true, message: '请填写服务项名称' }]}
                            style={{ width: 340, marginBottom: 0 }}
                          >
                            <Input placeholder="服务名称" />
                          </Form.Item>
                          <Form.Item
                            {...field}
                            name={[field.name, 'count']}
                            rules={[{ required: true, message: '请填写服务次数' }]}
                            style={{ width: 140, marginBottom: 0 }}
                          >
                            <InputNumber min={1} style={{ width: '100%' }} prefix="次数:" />
                          </Form.Item>
                          <Button type="text" danger onClick={() => remove(field.name)}>
                            删除
                          </Button>
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add({ name: '', count: 1 })} style={{ width: '100%', marginTop: 4 }}>
                        + 新增服务项
                      </Button>
                    </div>
                  )}
                </Form.List>
              </Card>

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginBottom: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>价格与发布</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>套餐上架、商城可见和库存统一处理。</Typography.Text>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={6}>
                    <Form.Item name="price" label="售价（元）" rules={[{ required: true, message: '请填写售价' }]} style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="originalPrice" label="原价（元）" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="stock" label="库存" style={{ marginBottom: 12 }}>
                      <InputNumber style={{ width: '100%' }} placeholder="-1 表示不限库存" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item name="sortOrder" label="排序" style={{ marginBottom: 12 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item name="status" label="套餐状态" style={{ marginBottom: 12 }}>
                      <Select options={[{ label: '上架', value: 'on' }, { label: '下架', value: 'off' }]} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="showInMall" label="商城可见" valuePropName="checked" style={{ marginBottom: 12 }}>
                      <Switch checkedChildren="可见" unCheckedChildren="隐藏" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="catalog-editor-delivery-note" style={{ padding: 8, background: '#fafafa', borderRadius: 4, marginTop: 8 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1.4 }}>
                        保存后自动同步商品信息和套餐配置，前台保持兼容。
                      </Typography.Text>
                    </div>
                  </Col>
                </Row>
              </Card>
            </div>

            <div className="catalog-editor-side" style={{ width: 280, flexShrink: 0 }}>
              <CatalogSummaryCard
                category={String(watchedPackageCategory || '').trim() || '超值套餐'}
                description={String(watchedPackageDescription || '').trim()}
                name={String(watchedPackageName || '').trim()}
                type="package"
                status={String(watchedPackageStatus || 'on')}
                showInMall={watchedPackageShowInMall !== false}
                price={watchedPackagePrice}
                originalPrice={watchedPackageOriginalPrice}
                stock={watchedPackageStock}
                sortOrder={watchedPackageSortOrder}
                tags={parseListText(watchedPackageTags)}
                image={packageImages[0] ? packagePreviewMap[packageImages[0]] : ''}
              />

              <Card className="panel-card catalog-editor-card" bordered={false} size="small" style={{ marginTop: 16 }}>
                <div className="catalog-editor-section-head" style={{ marginBottom: 12 }}>
                  <div>
                    <Typography.Title level={5} style={{ margin: '0 0 4px' }}>套餐发布前检查</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>确认内容项、有效期和价格逻辑正确后再保存。</Typography.Text>
                  </div>
                </div>
                <div className="catalog-editor-tip-list" style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 4 }}>1. 套餐服务项至少保留一项，次数要大于 0。</div>
                  <div style={{ marginBottom: 4 }}>2. 套餐图片要能体现组合价值，不只是单项服务图。</div>
                  <div style={{ marginBottom: 4 }}>3. 有效期与门店实际履约规则保持一致。</div>
                  <div>4. 删除套餐会同时移除套餐配置并隐藏对应商品。</div>
                </div>
              </Card>
            </div>
          </div>
        </Form>
      </Drawer>
    </div>
  )
}
