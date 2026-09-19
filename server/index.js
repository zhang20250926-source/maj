'use strict'

const http = require('node:http')
const { URL } = require('node:url')
const { GameStore } = require('./store')
const { MahjongGame } = require('./game')
const { websocketAccept, RealtimeHub } = require('./realtime')
const { issueSession, verifySession, exchangeWeChatCode } = require('./auth')
const { issueVoiceAccess } = require('./voice')

const store = new GameStore()
const games = new Map()
const realtime = new RealtimeHub()
const port = Number(process.env.PORT || 8787)
const sessionSecret = process.env.SESSION_SECRET || 'development-only-secret'

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' })
  response.end(JSON.stringify(body))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => { raw += chunk; if (raw.length > 100_000) request.destroy() })
    request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('请求 JSON 格式错误')) } })
    request.on('error', reject)
  })
}

function authenticatedPlayerId(request) {
  const header = request.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    if (process.env.NODE_ENV === 'production') throw new Error('请先登录')
    return null
  }
  return verifySession(header.slice(7), sessionSecret).sub
}

function assertActor(actorId, requestedPlayerId) {
  if (actorId && actorId !== requestedPlayerId) throw new Error('无权代替其他玩家操作')
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {})
  const url = new URL(request.url, `http://${request.headers.host}`)
  const segments = url.pathname.split('/').filter(Boolean)
  try {
    const actorId = url.pathname === '/api/auth/wechat' ? null : authenticatedPlayerId(request)
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true })
    if (request.method === 'POST' && url.pathname === '/api/auth/wechat') {
      const body = await readJson(request)
      // 公网出口开启时不能信任客户端可伪造的身份请求头；始终用微信 code 换取 openid。
      const identity = await exchangeWeChatCode({ code: body.code, appId: process.env.WECHAT_APP_ID, appSecret: process.env.WECHAT_APP_SECRET, apiBase: process.env.WECHAT_API_BASE })
      const player = store.ensurePlayer({ id: identity.openid, nickname: body.nickname })
      return send(response, 200, { token: issueSession({ openid: identity.openid, nickname: player.nickname }, sessionSecret), player })
    }
    if (request.method === 'POST' && url.pathname === '/api/players') { const body = await readJson(request); assertActor(actorId, body.id); return send(response, 201, { player: store.ensurePlayer(body) }) }
    if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'players' && segments[2] && segments[3] === 'history') {
      const playerId = segments[2]
      return send(response, 200, { rounds: store.data.rounds.filter((round) => Object.hasOwn(round.deltas, playerId)), transactions: store.data.transactions.filter((record) => record.playerId === playerId || record.operatorId === playerId) })
    }
    if (request.method === 'POST' && url.pathname === '/api/rooms') { const body = await readJson(request); assertActor(actorId, body.adminId); return send(response, 201, { room: store.createRoom(body) }) }
    if (segments[0] === 'api' && segments[1] === 'rooms' && segments[2]) {
      const roomId = segments[2]
      if (request.method === 'GET' && segments.length === 3) return send(response, 200, { room: store.getRoom(roomId), leaderboard: store.leaderboard(roomId) })
      if (request.method === 'GET' && segments[3] === 'game') {
        const game = games.get(roomId); if (!game) throw new Error('本房间尚未开局')
        return send(response, 200, { game: game.viewFor(url.searchParams.get('playerId')) })
      }
      if (request.method === 'POST' && segments[3] === 'start') {
        const body = await readJson(request); assertActor(actorId, body.operatorId); const room = store.getRoom(roomId)
        if (room.adminId !== body.operatorId) throw new Error('只有管理员可以开局')
        const game = new MahjongGame({ playerIds: room.seats.map((seat) => seat.playerId) })
        game.assignSeats(body.diceByPlayer); const snapshot = game.start(); games.set(roomId, game)
        realtime.broadcast(roomId, { type: 'GAME_STATE', game: snapshot })
        return send(response, 200, { game: snapshot })
      }
      if (request.method === 'POST' && segments[3] === 'actions') {
        const body = await readJson(request); assertActor(actorId, body.playerId); const game = games.get(roomId); if (!game) throw new Error('本房间尚未开局')
        let result
        if (body.type === 'DRAW') result = game.draw(body.playerId)
        else if (body.type === 'DISCARD') result = game.discard(body.playerId, body.card)
        else if (body.type === 'PONG') {
          try { result = game.pong(body.playerId) } catch (error) { result = game.falsePong(body.playerId); result.notice = error.message }
        }
        else if (body.type === 'MING_KONG') result = game.mingKong(body.playerId)
        else if (body.type === 'PASS') result = game.continueAfterNoClaim()
        else if (body.type === 'WIN') {
          try { result = game.win(body.playerId, body.method) } catch (error) { result = game.falseWin(body.playerId); result.notice = error.message }
        }
        else if (body.type === 'SETTLE_DRAW') result = game.settleDraw()
        else throw new Error('未知牌局操作')
        const snapshot = result.snapshot || result; realtime.broadcast(roomId, { type: 'GAME_STATE', game: snapshot, result })
        if (snapshot.status === 'FINISHED' && result.deltas) {
          store.recordRound({ roomId, deltas: result.deltas, summary: { winnerId: result.winnerId || null, method: result.method || result.kind || 'draw', forfeitedPlayerId: result.forfeited ? result.playerId : null, hand: result.hand || null, payments: result.payments || [] } })
        }
        return send(response, 200, { result, game: snapshot })
      }
      if (request.method === 'POST' && segments[3] === 'join') { const body = await readJson(request); assertActor(actorId, body.playerId); return send(response, 200, { room: store.joinRoom({ roomId, ...body }) }) }
      if (request.method === 'POST' && segments[3] === 'observe') { const body = await readJson(request); assertActor(actorId, body.spectatorId); return send(response, 200, { observer: store.observePlayer({ roomId, ...body }) }) }
      if (request.method === 'POST' && segments[3] === 'voice') {
        const body = await readJson(request); assertActor(actorId, body.playerId); const room = store.getRoom(roomId)
        const isPlayer = room.seats.some((seat) => seat.playerId === body.playerId)
        const isSpectator = room.spectators.includes(body.playerId)
        const role = isPlayer ? 'player' : isSpectator ? 'spectator' : null
        const observer = room.spectatorViews[body.playerId]
        return send(response, 200, { voice: issueVoiceAccess({ roomId, playerId: body.playerId, role, observer, provider: process.env.VOICE_PROVIDER || 'mock' }) })
      }
      if (request.method === 'POST' && segments[3] === 'top-up') { const body = await readJson(request); assertActor(actorId, body.operatorId); return send(response, 200, store.topUp({ roomId, ...body })) }
      if (request.method === 'GET' && segments[3] === 'history') return send(response, 200, { rounds: store.data.rounds.filter((round) => round.roomId === roomId), transactions: store.data.transactions.filter((record) => record.roomId === roomId) })
    }
    send(response, 404, { error: '接口不存在' })
  } catch (error) { send(response, 400, { error: error.message }) }
})

server.on('upgrade', (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (url.pathname !== '/ws' || !url.searchParams.get('room') || !request.headers['sec-websocket-key']) return socket.destroy()
  const accept = websocketAccept(request.headers['sec-websocket-key'])
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  realtime.subscribe(url.searchParams.get('room'), socket)
  const game = games.get(url.searchParams.get('room'))
  if (game) realtime.broadcast(url.searchParams.get('room'), { type: 'GAME_STATE', game: game.snapshot() })
})

server.listen(port, () => console.log(`筑城捉鸡服务已启动：http://127.0.0.1:${port}`))
