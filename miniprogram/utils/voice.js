const { request } = require('./api')

async function getVoiceAccess(roomId, playerId) {
  const { voice } = await request({ path: `/api/rooms/${roomId}/voice`, method: 'POST', data: { playerId } })
  return voice
}

// 此处只负责权限和短期凭据；接入具体 RTC SDK 后，在这里创建/销毁真实音频通道。
function describeVoiceAccess(access) {
  if (!access.canSpeak) return '你可以听牌桌语音，但本局已被禁言。'
  return '语音已准备，可与牌桌好友交流。'
}

module.exports = { getVoiceAccess, describeVoiceAccess }
