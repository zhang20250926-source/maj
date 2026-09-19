'use strict'

// 语音厂商适配边界：正式部署替换 issueVendorCredentials，不能把厂商密钥放到小程序。
function canSpeak({ role, observer }) { return role === 'player' || (role === 'spectator' && !observer?.muted) }
function canListen({ role }) { return role === 'player' || role === 'spectator' }

function issueVoiceAccess({ roomId, playerId, role, observer = null, provider = 'mock' }) {
  if (!canListen({ role })) throw new Error('不允许加入牌桌语音')
  return {
    provider,
    roomId,
    participantId: playerId,
    canListen: true,
    canSpeak: canSpeak({ role, observer }),
    // mock 凭据仅供本地 UI 验证；部署时由 TRTC/声网等服务端 SDK 签发短期凭据。
    credential: provider === 'mock' ? `dev-${roomId}-${playerId}` : null,
    expiresIn: 600
  }
}

module.exports = { canSpeak, canListen, issueVoiceAccess }
