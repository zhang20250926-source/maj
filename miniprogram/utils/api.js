const { API_BASE_URL, CLOUD_ENV_ID, CLOUD_SERVICE, USE_CLOUD_RUN } = require('../config')

function getSessionToken() {
  // 普通小程序通过 getApp 保存会话；小游戏没有 App/getApp，改用 GameGlobal。
  if (typeof getApp === 'function') {
    try { return getApp().globalData.token } catch (_) {}
  }
  if (typeof GameGlobal !== 'undefined') return GameGlobal.sessionToken || null
  return null
}

function request({ path, method = 'GET', data }) {
  if (USE_CLOUD_RUN) return callContainer({ path, method, data })
  return new Promise((resolve, reject) => {
    const token = getSessionToken()
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      success: ({ statusCode, data: response }) => {
        if (statusCode >= 200 && statusCode < 300) resolve(response)
        else reject(new Error(response.error || '网络请求失败'))
      },
      fail: reject
    })
  })
}

function callContainer({ path, method, data }) {
  return new Promise((resolve, reject) => {
    const token = getSessionToken()
    wx.cloud.callContainer({
      config: { env: CLOUD_ENV_ID },
      path,
      method,
      data,
      header: {
        'content-type': 'application/json',
        'X-WX-SERVICE': CLOUD_SERVICE,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success: ({ statusCode, data: response, errMsg }) => {
        if (statusCode >= 200 && statusCode < 300) resolve(response)
        else {
          const detail = response && typeof response === 'object'
            ? (response.error || response.message || JSON.stringify(response))
            : String(response || errMsg || '无响应内容')
          console.error('云托管请求异常', { path, method, statusCode, response, errMsg })
          reject(new Error(`云托管返回 ${statusCode || '未知状态'}：${detail.slice(0, 180)}`))
        }
      },
      fail: (error) => {
        console.error('云托管调用失败', { path, method, error })
        reject(new Error((error && (error.errMsg || error.message)) || '云托管调用失败'))
      }
    })
  })
}

const getRoom = (roomId) => request({ path: `/api/rooms/${roomId}` })
const createRoom = (data) => request({ path: '/api/rooms', method: 'POST', data })
const joinRoom = (roomId, data) => request({ path: `/api/rooms/${roomId}/join`, method: 'POST', data })
const topUp = (roomId, data) => request({ path: `/api/rooms/${roomId}/top-up`, method: 'POST', data })
const getGame = (roomId, playerId) => request({ path: `/api/rooms/${roomId}/game?playerId=${encodeURIComponent(playerId)}` })
const gameAction = (roomId, data) => request({ path: `/api/rooms/${roomId}/actions`, method: 'POST', data })
const rollDice = (roomId, data) => request({ path: `/api/rooms/${roomId}/dice`, method: 'POST', data })
const startGame = (roomId, data) => request({ path: `/api/rooms/${roomId}/start`, method: 'POST', data })
const getHistory = (roomId) => request({ path: `/api/rooms/${roomId}/history` })
const getPlayerHistory = (playerId) => request({ path: `/api/players/${encodeURIComponent(playerId)}/history` })

module.exports = { request, getRoom, createRoom, joinRoom, topUp, getGame, gameAction, rollDice, startGame, getHistory, getPlayerHistory }
