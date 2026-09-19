'use strict'

const crypto = require('node:crypto')

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
function sign(value, secret) { return crypto.createHmac('sha256', secret).update(value).digest('base64url') }

function issueSession({ openid, nickname }, secret) {
  if (!openid) throw new Error('微信身份缺少 openid')
  const payload = { sub: openid, nickname: nickname || '微信用户', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }
  const encoded = encode(payload)
  return `${encoded}.${sign(encoded, secret)}`
}

function verifySession(token, secret) {
  const [encoded, signature] = String(token || '').split('.')
  const received = Buffer.from(signature || '')
  const expected = Buffer.from(sign(encoded || '', secret))
  if (!encoded || !signature || received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error('登录状态无效')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('登录已过期')
  return payload
}

async function exchangeWeChatCode({ code, appId, appSecret, apiBase = 'https://api.weixin.qq.com' }) {
  if (!code || !appId || !appSecret) throw new Error('微信登录尚未配置 AppID 或 AppSecret')
  const url = new URL('/sns/jscode2session', apiBase)
  url.searchParams.set('appid', appId); url.searchParams.set('secret', appSecret); url.searchParams.set('js_code', code); url.searchParams.set('grant_type', 'authorization_code')
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok || data.errcode) throw new Error(`微信登录失败：${data.errmsg || response.status}`)
  return data
}

module.exports = { issueSession, verifySession, exchangeWeChatCode }
