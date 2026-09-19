'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

class GameStore {
  constructor(filePath = path.join(process.cwd(), 'data', 'zhuocheng.json')) {
    this.filePath = filePath
    this.data = this.normalize(this.load())
    this.writeTail = Promise.resolve()
  }

  normalize(data) { return { players: {}, rooms: {}, transactions: [], rounds: [], activeGames: {}, ...data } }

  async usePersistence(persistence) {
    const remote = await persistence.init()
    this.persistence = persistence
    if (remote) this.data = this.normalize(remote)
    else await persistence.save(this.data)
  }

  load() {
    if (!fs.existsSync(this.filePath)) return { players: {}, rooms: {}, transactions: [], rounds: [] }
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const staging = `${this.filePath}.tmp`
    fs.writeFileSync(staging, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(staging, this.filePath)
    if (this.persistence) this.writeTail = this.writeTail.catch(() => {}).then(() => this.persistence.save(this.data))
  }

  async flush() { await this.writeTail }

  saveActiveGame(roomId, state) { this.data.activeGames[roomId] = state; this.save() }
  removeActiveGame(roomId) { delete this.data.activeGames[roomId]; this.save() }

  ensurePlayer({ id, nickname }) {
    if (!id) throw new Error('缺少玩家身份')
    if (!this.data.players[id]) this.data.players[id] = { id, nickname: nickname || '新玩家', score: 100, createdAt: new Date().toISOString() }
    else if (nickname) this.data.players[id].nickname = nickname
    this.save()
    return this.data.players[id]
  }

  createRoom({ adminId, name }) {
    const admin = this.ensurePlayer({ id: adminId })
    if (!name || name.trim().length < 1 || name.trim().length > 24) throw new Error('房间名称应为 1 到 24 个字符')
    const id = crypto.randomBytes(4).toString('hex').toUpperCase()
    const room = {
      id,
      name: name.trim(),
      adminId,
      createdAt: new Date().toISOString(),
      status: 'WAITING',
      seats: [{ playerId: admin.id, wind: null }],
      spectators: [],
      spectatorViews: {},
      diceByPlayer: {},
      roundNumber: 0,
      sharePath: `/pages/table/table?room=${id}`
    }
    this.data.rooms[id] = room
    this.save()
    return room
  }

  observePlayer({ roomId, spectatorId, targetPlayerId }) {
    const room = this.getRoom(roomId)
    if (!room.spectators.includes(spectatorId)) throw new Error('只有观众可以切换观看对象')
    if (!room.seats.some((seat) => seat.playerId === targetPlayerId)) throw new Error('只能观看本桌正式玩家')
    const record = room.spectatorViews[spectatorId] || { watchedPlayerIds: [], muted: false }
    if (!record.watchedPlayerIds.includes(targetPlayerId)) record.watchedPlayerIds.push(targetPlayerId)
    if (record.watchedPlayerIds.length >= 2) record.muted = true
    room.spectatorViews[spectatorId] = record
    this.save()
    return record
  }

  getRoom(id) {
    const room = this.data.rooms[id]
    if (!room) throw new Error('房间不存在')
    return room
  }

  joinRoom({ roomId, playerId, nickname, role = 'player' }) {
    const room = this.getRoom(roomId)
    if (room.status !== 'WAITING') throw new Error('牌局已开始，暂不能加入')
    const player = this.ensurePlayer({ id: playerId, nickname })
    const seated = room.seats.some((seat) => seat.playerId === playerId)
    const watching = room.spectators.some((id) => id === playerId)
    if (seated || watching) return room
    if (role === 'spectator') room.spectators.push(playerId)
    else {
      if (room.seats.length >= 4) throw new Error('正式玩家已满，请进入观众席')
      room.seats.push({ playerId, wind: null })
    }
    this.save()
    return room
  }

  rollDice({ roomId, playerId, value }) {
    const room = this.getRoom(roomId)
    if (!room.seats.some((seat) => seat.playerId === playerId)) throw new Error('只有正式玩家可以掷骰子')
    const dice = Number(value)
    if (!Number.isInteger(dice) || dice < 1 || dice > 6) throw new Error('骰子必须为 1 到 6')
    room.diceByPlayer[playerId] = dice
    this.save()
    return room
  }

  beginRound({ roomId, randomChickenKey, chickenBoost }) {
    const room = this.getRoom(roomId)
    if (room.seats.length !== 4) throw new Error('必须四位正式玩家才能开局')
    room.status = 'PLAYING'
    room.previousRandomChickenKey = randomChickenKey
    room.randomChickenStreak = chickenBoost
    room.diceByPlayer = {}
    this.save()
    return room
  }

  topUp({ roomId, operatorId, playerId, amount = 100 }) {
    const room = this.getRoom(roomId)
    if (room.adminId !== operatorId) throw new Error('只有管理员可以补分')
    if (amount !== 100) throw new Error('每次仅允许补 100 分')
    const player = this.ensurePlayer({ id: playerId })
    player.score += amount
    const transaction = { id: crypto.randomUUID(), type: 'TOP_UP', roomId, operatorId, playerId, amount, createdAt: new Date().toISOString() }
    this.data.transactions.push(transaction)
    this.save()
    return { player, transaction }
  }

  recordRound({ roomId, summary, deltas }) {
    const room = this.getRoom(roomId)
    const playerIds = room.seats.map((seat) => seat.playerId)
    for (const playerId of playerIds) {
      const delta = Number(deltas[playerId] || 0)
      this.data.players[playerId].score += delta
    }
    room.roundNumber += 1
    room.status = 'WAITING'
    const round = { id: crypto.randomUUID(), roomId, number: room.roundNumber, summary, deltas, createdAt: new Date().toISOString() }
    this.data.rounds.push(round)
    this.save()
    return round
  }

  recordAdjustment({ roomId, summary, deltas }) {
    const room = this.getRoom(roomId)
    const playerIds = room.seats.map((seat) => seat.playerId)
    for (const playerId of playerIds) {
      const delta = Number(deltas[playerId] || 0)
      this.data.players[playerId].score += delta
    }
    const adjustment = { id: crypto.randomUUID(), type: 'SCORE_ADJUSTMENT', roomId, summary, deltas, createdAt: new Date().toISOString() }
    this.data.transactions.push(adjustment)
    this.save()
    return adjustment
  }

  leaderboard(roomId = null) {
    const allowed = roomId ? new Set(this.getRoom(roomId).seats.map((seat) => seat.playerId)) : null
    return Object.values(this.data.players).filter((player) => !allowed || allowed.has(player.id)).sort((a, b) => b.score - a.score)
  }
}

module.exports = { GameStore }
