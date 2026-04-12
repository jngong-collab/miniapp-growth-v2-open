// 图标下载脚本 - 从 Iconify API 下载 SVG 并用 sharp 转 PNG
// 运行方式：npm install sharp && node download_icons.js
const https = require('https')
const fs = require('fs')
const path = require('path')

// 是否安装了 sharp
let sharp
try {
    sharp = require('sharp')
} catch (e) {
    console.log('正在安装 sharp...')
    require('child_process').execSync('npm install sharp', { stdio: 'inherit' })
    sharp = require('sharp')
}

const ICON_DIR = path.join(__dirname, '..', 'miniapp', 'assets', 'icons')

// 图标配置：name → iconify icon name
const icons = [
    { name: 'home', icon: 'mdi:home-outline' },
    { name: 'tongue', icon: 'mdi:scan-helper' },   // 扫描/分析风格
    { name: 'mall', icon: 'mdi:store-outline' },
    { name: 'profile', icon: 'mdi:account-outline' }
]

const COLORS = {
    normal: '%23999999',
    active: '%23FF6B35'
}

function downloadSvg(iconName, color) {
    const [prefix, name] = iconName.split(':')
    const url = `https://api.iconify.design/${prefix}/${name}.svg?width=81&height=81&color=${color}`

    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => resolve(data))
            res.on('error', reject)
        }).on('error', reject)
    })
}

async function main() {
    // 确保目录存在
    fs.mkdirSync(ICON_DIR, { recursive: true })

    for (const { name, icon } of icons) {
        // 下载普通态
        console.log(`下载 ${name} 普通态...`)
        const normalSvg = await downloadSvg(icon, COLORS.normal)
        const normalPng = await sharp(Buffer.from(normalSvg)).png().toBuffer()
        fs.writeFileSync(path.join(ICON_DIR, `${name}.png`), normalPng)

        // 下载选中态
        console.log(`下载 ${name} 选中态...`)
        const activeSvg = await downloadSvg(icon, COLORS.active)
        const activePng = await sharp(Buffer.from(activeSvg)).png().toBuffer()
        fs.writeFileSync(path.join(ICON_DIR, `${name}-active.png`), activePng)
    }

    console.log('\n✅ 所有图标下载完成！')
    console.log(`📁 保存路径: ${ICON_DIR}`)
}

main().catch(console.error)
