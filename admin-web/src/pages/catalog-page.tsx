import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd'
import { adminApi } from '../lib/admin-api'

export function CatalogPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [productForm] = Form.useForm()
  const [packageForm] = Form.useForm()
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [packageModalOpen, setPackageModalOpen] = useState(false)
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: adminApi.listProducts })
  const packagesQuery = useQuery({ queryKey: ['packages'], queryFn: adminApi.listPackages })

  const saveProductMutation = useMutation({
    mutationFn: adminApi.saveProduct,
    onSuccess: () => {
      message.success('商品已保存')
      setProductModalOpen(false)
      productForm.resetFields()
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

  const packageProductOptions = useMemo(() => {
    return (productsQuery.data || [])
      .filter(item => item.type === 'package')
      .map(item => ({ label: item.name, value: item._id }))
  }, [productsQuery.data])

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
          <Button type="primary" onClick={() => { productForm.resetFields(); setProductModalOpen(true) }}>新增商品</Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'products',
            label: '商品',
            children: (
              <Card className="panel-card" bordered={false}>
                <Table
                  rowKey="_id"
                  loading={productsQuery.isLoading}
                  dataSource={productsQuery.data || []}
                  columns={[
                    { title: '商品名', dataIndex: 'name' },
                    { title: '类型', dataIndex: 'type', width: 100 },
                    { title: '分类', dataIndex: 'category', width: 120 },
                    { title: '售价', dataIndex: 'priceYuan', width: 100, render: value => `¥${value}` },
                    { title: '库存', dataIndex: 'stockLabel', width: 100 },
                    { title: '状态', width: 120, render: (_, record) => <Tag color={record.status === 'on' ? 'green' : 'default'}>{record.statusLabel}</Tag> },
                    { title: '商城可见', width: 100, render: (_, record) => <Tag color={record.showInMall ? 'blue' : 'default'}>{record.showInMall ? '可见' : '隐藏'}</Tag> },
                    {
                      title: '操作',
                      width: 220,
                      render: (_, record) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              productForm.setFieldsValue({
                                ...record,
                                tags: (record.tags || []).join('\n'),
                                images: (record.images || []).join('\n')
                              })
                              setProductModalOpen(true)
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="small"
                            onClick={() => toggleMutation.mutate({ productId: record._id, status: record.status === 'on' ? 'off' : 'on' })}
                          >
                            {record.status === 'on' ? '下架' : '上架'}
                          </Button>
                        </Space>
                      )
                    }
                  ]}
                  scroll={{ x: 1180 }}
                />
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

      <Modal
        open={productModalOpen}
        title="商品编辑"
        width={760}
        onCancel={() => setProductModalOpen(false)}
        onOk={() => productForm.submit()}
        confirmLoading={saveProductMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={productForm}
          layout="vertical"
          onFinish={values => saveProductMutation.mutate(values)}
        >
          <Form.Item name="_id" hidden><Input /></Form.Item>
          <Form.Item name="name" label="商品名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="type" label="商品类型" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select options={[
                { label: '实物', value: 'physical' },
                { label: '服务', value: 'service' },
                { label: '套餐商品', value: 'package' }
              ]} />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="price" label="售价（分）" style={{ flex: 1 }} rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="originalPrice" label="原价（分）" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="stock" label="库存（-1 为不限）" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="sortOrder" label="排序" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="deliveryType" label="交付方式" style={{ flex: 1 }}><Select options={[{ label: '到店', value: 'instore' }, { label: '快递', value: 'express' }]} /></Form.Item>
            <Form.Item name="status" label="状态" style={{ flex: 1 }}><Select options={[{ label: '上架', value: 'on' }, { label: '下架', value: 'off' }]} /></Form.Item>
          </Space.Compact>
          <Form.Item name="showInMall" label="商城可见" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="description" label="简介"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="efficacy" label="功效说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="detail" label="详情"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="tags" label="标签（每行一个）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="images" label="图片地址（每行一个）"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

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
          <Form.Item name="productId" label="关联套餐商品" rules={[{ required: true }]}>
            <Select options={packageProductOptions} />
          </Form.Item>
          <Form.Item name="validDays" label="有效期（天）" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.List name="items" initialValue={[{ name: '', count: 1 }]}>
            {(fields, { add, remove }) => (
              <div className="form-list-block">
                {fields.map(field => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 12 }}>
                    <Form.Item {...field} name={[field.name, 'name']} label="服务项" rules={[{ required: true }]} style={{ minWidth: 260 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'count']} label="次数" rules={[{ required: true }]} style={{ minWidth: 140 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Button danger onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button onClick={() => add({ name: '', count: 1 })}>新增服务项</Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
