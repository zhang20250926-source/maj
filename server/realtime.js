'use strict'

const crypto = require('node:crypto')

function websocketAccept(key) {
  return crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
}

function textFrame(payload) {
  const content = Buffer.from(JSON.stringify(payload))
  if (content.length >= 65536) throw new Error('实时事件过大')
  if (content.length < 126) return Buffer.concat([Buffer.from([0x81, content.length]), content])
  const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(content.length, 2)
  return Buffer.concat([header, content])
}

class RealtimeHub {
  constructor() { this.rooms = new Map() }
  subscribe(roomId, socket) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set())
    const sockets = this.rooms.get(roomId); sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket); if (!sockets.size) this.rooms.delete(roomId) })
    socket.on('error', () => sockets.delete(socket))
  }
  broadcast(roomId, event) {
    const frame = textFrame(event)
    for (const socket of this.rooms.get(roomId) || []) if (!socket.destroyed) socket.write(frame)
  }
}

module.exports = { websocketAccept, textFrame, RealtimeHub }
