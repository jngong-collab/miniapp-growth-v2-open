import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const indexHtmlPath = resolve(distDir, 'index.html')
const notFoundHtmlPath = resolve(distDir, '404.html')

if (!existsSync(indexHtmlPath)) {
  throw new Error(`Missing build output: ${indexHtmlPath}`)
}

copyFileSync(indexHtmlPath, notFoundHtmlPath)
console.log('Synced SPA fallback: dist/404.html -> dist/index.html')
