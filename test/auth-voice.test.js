'use strict'
const test = require('node:test'); const assert = require('node:assert/strict')
const { issueSession, verifySession } = require('../server/auth'); const { issueVoiceAccess } = require('../server/voice')

test('会话令牌可验签且篡改后失效', () => {
  const token = issueSession({ openid: 'wx-user', nickname: '阿杰' }, 'test-secret')
  assert.equal(verifySession(token, 'test-secret').sub, 'wx-user')
  assert.throws(() => verifySession(`${token}x`, 'test-secret'), /无效/)
})

test('观众看第二名玩家后只能听不能说', () => {
  assert.equal(issueVoiceAccess({ roomId: 'r', playerId: 'p', role: 'spectator', observer: { muted: true } }).canSpeak, false)
  assert.equal(issueVoiceAccess({ roomId: 'r', playerId: 'p', role: 'spectator', observer: { muted: false } }).canSpeak, true)
})
