import cloudbase from '@cloudbase/js-sdk'

const cloudbaseConfig = {
  env: import.meta.env.VITE_CLOUDBASE_ENV || '',
  region: import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai',
  accessKey: import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY || ''
}

let appInstance: ReturnType<typeof cloudbase.init> | null = null

export function hasCloudbaseConfig() {
  return Boolean(cloudbaseConfig.env && cloudbaseConfig.accessKey)
}

export function getCloudbaseApp() {
  if (!hasCloudbaseConfig()) {
    throw new Error('请先在 admin-web 配置 CloudBase 环境变量')
  }
  if (!appInstance) {
    appInstance = cloudbase.init({
      env: cloudbaseConfig.env,
      region: cloudbaseConfig.region,
      accessKey: cloudbaseConfig.accessKey,
      auth: { detectSessionInUrl: true }
    })
  }
  return appInstance
}

export function getCloudbaseAuth() {
  return getCloudbaseApp().auth
}

export async function loginWithPassword(username: string, password: string) {
  const auth = getCloudbaseAuth()
  const result = await auth.signInWithPassword({ username, password })
  if (result.error) {
    throw new Error(result.error.message || '登录失败')
  }
  return result.data
}

export async function logout() {
  const auth = getCloudbaseAuth()
  await auth.signOut()
}

export async function callFunction<T>(name: string, data: Record<string, unknown>) {
  const app = getCloudbaseApp()
  const result = await app.callFunction({
    name,
    data
  })
  return result as T
}
