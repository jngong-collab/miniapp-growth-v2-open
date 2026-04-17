import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getPackageName(id: string) {
  const normalized = id.replace(/\\/g, '/')
  const marker = '/node_modules/'
  const index = normalized.lastIndexOf(marker)
  if (index === -1) return null
  const rest = normalized.slice(index + marker.length)
  if (rest.startsWith('.pnpm/')) {
    const nested = rest.split('/node_modules/')[1]
    if (!nested) return null
    return getPackageName(`/node_modules/${nested}`)
  }
  const parts = rest.split('/')
  if (!parts[0]) return null
  if (parts[0].startsWith('@') && parts[1]) {
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          const packageName = getPackageName(id)
          if (!packageName) {
            return 'vendor'
          }

          if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
            return 'react-core'
          }

          if (packageName === 'react-router' || packageName === 'react-router-dom' || packageName === '@remix-run/router') {
            return 'react-framework'
          }

          if (packageName === '@tanstack/react-query') {
            return 'query'
          }

          const chunkName = packageName
            .replace('@', '')
            .replace(/[\\/]/g, '-')
            .replace(/[^a-zA-Z0-9-]/g, '')

          if (packageName === 'antd') {
            const normalized = id.replace(/\\/g, '/')
            const match = normalized.match(/node_modules\/antd\/(?:es|lib)\/([^/]+)/)
            const componentName = match?.[1]
            if (componentName) {
              return `vendor-antd-${componentName.replace(/[^a-zA-Z0-9-]/g, '')}`
            }
            return 'vendor-antd-core'
          }

          if (packageName === 'echarts') {
            const normalized = id.replace(/\\/g, '/')
            const match = normalized.match(/node_modules\/echarts\/([^/]+)/)
            const sectionName = match?.[1]
            if (sectionName) {
              return `vendor-echarts-${sectionName.replace(/[^a-zA-Z0-9-]/g, '')}`
            }
            return 'vendor-echarts-core'
          }

          if (packageName === 'zrender') {
            return 'vendor-zrender'
          }

          if (chunkName) {
            return `vendor-${chunkName}`
          }
          return 'vendor'
        }
      }
    }
  }
})
