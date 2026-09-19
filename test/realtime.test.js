'use strict'
const test = require('node:test'); const assert = require('node:assert/strict')
const crypto = require('node:crypto'); const { websocketAccept, textFrame } = require('../server/realtime')

test('WebSocket 握手与文本事件帧符合协议', () => {
  assert.equal(websocketAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  const frame = textFrame({ type: 'GAME_STATE', game: { tilesLeft: 55 } })
  assert.equal(frame[0], 0x81); assert.equal(frame.readUInt8(1), frame.length - 2)
  assert.deepEqual(JSON.parse(frame.subarray(2).toString()), { type: 'GAME_STATE', game: { tilesLeft: 55 } })
})
