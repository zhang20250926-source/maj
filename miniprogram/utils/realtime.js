const { API_BASE_URL } = require('../config')

function connectRoom(roomId, onState, onError) {
  const socketUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?room=${encodeURIComponent(roomId)}`
  const socketTask = wx.connectSocket({ url: socketUrl })
  socketTask.onMessage(({ data }) => {
    try {
      const event = typeof data === 'string' ? JSON.parse(data) : data
      if (event.type === 'GAME_STATE') onState(event.game, event.result)
    } catch (error) { console.warn('实时牌局事件格式错误', error) }
  })
  socketTask.onError(onError)
  return socketTask
}

module.exports = { connectRoom }
