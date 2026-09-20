'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { issueSession, verifySession } = require('../server/auth')

test('体验账号可签发并验证独立会话', () => {
  const identity = { openid: 'guest-device_abcdefghijklmnop', nickname: '哈哈' }
  const token = issueSession(identity, 'guest-test-secret')
  const payload = verifySession(token, 'guest-test-secret')
  assert.equal(payload.sub, identity.openid)
  assert.equal(payload.nickname, identity.nickname)
})
