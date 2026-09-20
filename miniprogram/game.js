'use strict'

const api = require('./utils/api')

const runtime = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis
const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')
const system = wx.getSystemInfoSync()
const width = system.windowWidth
const height = system.windowHeight
const pixelRatio = Math.min(system.pixelRatio || 1, 3)

canvas.width = Math.round(width * pixelRatio)
canvas.height = Math.round(height * pixelRatio)
ctx.scale(pixelRatio, pixelRatio)

const COLORS = {
  paper: '#f5ecd8',
  cream: '#fffaf0',
  green: '#165f49',
  felt: '#17634d',
  feltDark: '#104838',
  gold: '#c88a2b',
  red: '#b83c2e',
  ink: '#17382f',
  muted: '#786f5c',
  line: '#dccdaa',
  white: '#ffffff'
}

const state = {
  screen: 'loading',
  message: '正在连接微信云托管…',
  player: null,
  room: null,
  game: null,
  selectedTileIndex: null,
  buttons: [],
  roomName: '周末老友局',
  busy: false,
  pollTimer: null
}

function roundedRect(x, y, w, h, radius, fill, stroke) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke() }
}

function text(value, x, y, size = 14, color = COLORS.ink, align = 'left', weight = 'normal') {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), x, y)
}

function button(id, label, x, y, w, h, options = {}) {
  roundedRect(x, y, w, h, options.radius || 10, options.fill || COLORS.green, options.stroke)
  text(label, x + w / 2, y + h / 2, options.size || 16, options.color || COLORS.white, 'center', 'bold')
  state.buttons.push({ id, x, y, w, h, payload: options.payload })
}

function clear() {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, width, height)
  state.buttons = []
}

function drawBrand(y = 66) {
  roundedRect(width / 2 - 66, y - 22, 34, 34, 9, COLORS.red)
  text('筑', width / 2 - 49, y - 5, 20, COLORS.white, 'center', 'bold')
  text('城捉鸡', width / 2 - 22, y - 5, 25, COLORS.ink, 'left', 'bold')
  text('只和熟人，痛快打一把', width / 2, y + 28, 12, COLORS.muted, 'center')
}

function drawLoading() {
  clear()
  drawBrand(height * 0.35)
  text(state.message, width / 2, height * 0.55, 14, COLORS.muted, 'center')
}

function drawHome() {
  clear()
  drawBrand(86)

  const player = state.player || { nickname: '牌友', score: 100 }
  roundedRect(22, 137, width - 44, 66, 14, 'rgba(255,250,240,.92)', COLORS.line)
  roundedRect(38, 151, 38, 38, 19, COLORS.green)
  text((player.nickname || '牌').slice(0, 1), 57, 170, 17, COLORS.white, 'center', 'bold')
  text(player.nickname || '牌友', 89, 162, 15, COLORS.ink, 'left', 'bold')
  text(`长期积分 · ${player.score == null ? 100 : player.score} 分`, 89, 182, 12, COLORS.muted)

  roundedRect(22, 220, width - 44, 222, 16, COLORS.cream, COLORS.line)
  text('开一桌熟人房', 39, 252, 20, COLORS.ink, 'left', 'bold')
  text('管理员创建后，把房间分享给微信好友。', 39, 279, 12, COLORS.muted)
  roundedRect(39, 302, width - 78, 50, 9, '#fffdf7', COLORS.line)
  text(state.roomName, 54, 327, 15, COLORS.ink)
  button('rename-room', '修改房名', width - 126, 310, 73, 34, { fill: '#eee2c7', color: COLORS.ink, size: 12, radius: 8 })
  button('create-room', state.busy ? '正在创建…' : '创建房间', 55, 370, width - 110, 48)

  button('join-tip', '从好友分享进入房间', 55, 456, width - 110, 45, { fill: '#eadfbe', color: COLORS.ink })
  text('4 人正式对局  ·  牌桌实时同步  ·  贵州捉鸡规则', width / 2, 535, 12, COLORS.muted, 'center')
  text('本游戏仅供熟人娱乐，不含现金与充值功能', width / 2, height - 40, 11, '#9b8e71', 'center')
}

function tileLabel(card) {
  if (!card) return '?'
  const rank = card.rank || card.value
  const names = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const suit = card.suit === 'wan' ? '万' : card.suit === 'tiao' ? '条' : '筒'
  return `${names[rank] || rank}${suit}`
}

function drawTile(card, x, y, w, h, selected = false) {
  roundedRect(x, y - (selected ? 8 : 0), w, h, 5, '#fffdf8', selected ? COLORS.gold : '#cfc4aa')
  const rank = card.rank || card.value
  const color = card.suit === 'wan' ? COLORS.red : card.suit === 'tiao' ? COLORS.green : '#30649a'
  text(rank || '?', x + w / 2, y + 15 - (selected ? 8 : 0), Math.max(12, w * 0.38), color, 'center', 'bold')
  text(card.suit === 'wan' ? '萬' : card.suit === 'tiao' ? '竹' : '●', x + w / 2, y + h - 13 - (selected ? 8 : 0), Math.max(11, w * 0.31), color, 'center')
}

function drawSeat(label, name, score, x, y, active) {
  roundedRect(x, y, 94, 42, 10, active ? '#f5d68b' : 'rgba(255,255,255,.88)')
  roundedRect(x + 6, y + 7, 28, 28, 14, active ? COLORS.red : COLORS.green)
  text(label, x + 20, y + 21, 13, COLORS.white, 'center', 'bold')
  text(name || '等待加入', x + 40, y + 14, 11, COLORS.ink)
  text(`${score == null ? '—' : score} 分`, x + 40, y + 29, 10, COLORS.muted)
}

function currentPlayer() {
  if (!state.game || !state.game.players || !state.player) return null
  return state.game.players.find((item) => item.id === state.player.id)
}

function drawTable() {
  clear()
  const room = state.room || { name: '熟人房', id: '------', seats: [] }
  const game = state.game
  text('筑城捉鸡', 18, 30, 20, COLORS.ink, 'left', 'bold')
  text(room.name, width / 2, 29, 14, COLORS.ink, 'center', 'bold')
  text(`房间 ${room.id}`, width / 2, 48, 11, COLORS.muted, 'center')
  button('share', '分享', width - 73, 14, 57, 34, { fill: '#eadfbe', color: COLORS.ink, size: 12, radius: 8 })

  const tableTop = 68
  const tableHeight = Math.max(365, height - 250)
  roundedRect(10, tableTop, width - 20, tableHeight, 24, COLORS.felt, COLORS.feltDark)
  const seats = room.seats || []
  drawSeat('北', seats[2] && seats[2].nickname, seats[2] && seats[2].score, width / 2 - 47, tableTop + 16, game && game.currentPlayerId === (seats[2] && seats[2].playerId))
  drawSeat('西', seats[1] && seats[1].nickname, seats[1] && seats[1].score, 20, tableTop + 126, game && game.currentPlayerId === (seats[1] && seats[1].playerId))
  drawSeat('东', seats[3] && seats[3].nickname, seats[3] && seats[3].score, width - 114, tableTop + 126, game && game.currentPlayerId === (seats[3] && seats[3].playerId))

  roundedRect(width / 2 - 72, tableTop + 120, 144, 116, 18, COLORS.feltDark)
  text(game ? `余 ${game.tilesLeft} 张` : '等待开局', width / 2, tableTop + 146, 15, '#f7e8ba', 'center', 'bold')
  const chicken = game && game.randomChicken ? tileLabel(game.randomChicken) : '待翻随机鸡'
  text(chicken, width / 2, tableTop + 177, 18, COLORS.white, 'center', 'bold')
  text('幺鸡 · 八筒 · 固定鸡', width / 2, tableTop + 209, 11, '#cce1d9', 'center')

  const self = currentPlayer()
  drawSeat('我', state.player && state.player.nickname, self && self.score, 20, tableTop + tableHeight - 58, game && game.currentPlayerId === (state.player && state.player.id))

  const hand = game && game.privateHand ? game.privateHand : []
  if (hand.length) {
    const gap = 2
    const tileW = Math.min(31, (width - 24 - gap * (hand.length - 1)) / hand.length)
    const tileH = 55
    const startX = (width - (tileW * hand.length + gap * (hand.length - 1))) / 2
    const tileY = tableTop + tableHeight - 119
    hand.forEach((card, index) => {
      drawTile(card, startX + index * (tileW + gap), tileY, tileW, tileH, state.selectedTileIndex === index)
      state.buttons.push({ id: 'tile', x: startX + index * (tileW + gap), y: tileY - 10, w: tileW, h: tileH + 12, payload: index })
    })
  } else {
    text('四人进入并完成掷骰后，由房主开局', width / 2, tableTop + tableHeight - 91, 12, '#d7e5df', 'center')
  }

  const actionY = tableTop + tableHeight + 15
  if (!game || game.status === 'WAITING') {
    button('dice', '掷骰', 18, actionY, 92, 44, { fill: COLORS.gold })
    button('start', '开始牌局', 120, actionY, width - 138, 44)
  } else {
    const isTurn = game.currentPlayerId === (state.player && state.player.id)
    if (isTurn && hand.length % 3 === 1) button('draw', '摸牌', 14, actionY, 67, 44, { fill: COLORS.gold })
    else button('pong', '碰', 14, actionY, 67, 44, { fill: '#e4d7b7', color: COLORS.ink })
    button('kong', '杠', 88, actionY, 67, 44, { fill: '#e4d7b7', color: COLORS.ink })
    button('win', '胡', 162, actionY, 67, 44, { fill: COLORS.red })
    button('discard', '出牌', 236, actionY, width - 250, 44)
  }
  button('back', '返回首页', 18, actionY + 57, 92, 36, { fill: '#e9dec2', color: COLORS.ink, size: 12 })
  text(state.message || '', 122, actionY + 75, 11, COLORS.muted)
}

function render() {
  if (state.screen === 'home') drawHome()
  else if (state.screen === 'table') drawTable()
  else drawLoading()
}

function showError(title, error) {
  const message = (error && error.message) || String(error || '未知错误')
  state.message = message
  render()
  wx.showModal({ title, content: message, showCancel: false })
}

async function ensureIdentity() {
  if (state.player && runtime.sessionToken) return state.player
  await Promise.resolve(wx.cloud && wx.cloud.init({ traceUser: true }))
  const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
  const result = await api.request({ path: '/api/auth/wechat', method: 'POST', data: { code: login.code, nickname: '哈哈' } })
  runtime.sessionToken = result.token
  state.player = result.player
  return state.player
}

async function initialize() {
  try {
    await ensureIdentity()
    const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {}
    const roomId = launch.query && launch.query.room
    if (roomId) await openRoom(roomId)
    else { state.screen = 'home'; state.message = ''; render() }
  } catch (error) {
    state.screen = 'home'
    state.message = '登录暂未完成，请检查云托管配置'
    render()
    showError('连接失败', error)
  }
}

async function createRoom() {
  if (state.busy) return
  state.busy = true
  render()
  try {
    const player = await ensureIdentity()
    const result = await api.createRoom({ adminId: player.id, name: state.roomName })
    await openRoom(result.room.id, result.room)
  } catch (error) { showError('创建失败', error) }
  finally { state.busy = false; render() }
}

async function openRoom(roomId, initialRoom) {
  const player = await ensureIdentity()
  let room = initialRoom
  if (!room) room = (await api.getRoom(roomId)).room
  const member = (room.seats || []).some((seat) => seat.playerId === player.id) || (room.spectators || []).includes(player.id)
  if (!member && room.status === 'WAITING') room = (await api.joinRoom(roomId, { playerId: player.id, role: room.seats.length < 4 ? 'player' : 'spectator' })).room
  state.room = room
  state.screen = 'table'
  state.message = room.status === 'WAITING' ? '等待牌友加入' : '牌局进行中'
  await refreshGame(true)
  if (state.pollTimer) clearInterval(state.pollTimer)
  state.pollTimer = setInterval(() => refreshGame(false), 1800)
  render()
}

async function refreshGame(quiet) {
  if (!state.room || !state.player) return
  try {
    const roomResult = await api.getRoom(state.room.id)
    state.room = roomResult.room
    try { state.game = (await api.getGame(state.room.id, state.player.id)).game } catch (error) {
      if (!/尚未开局/.test(error.message || '')) throw error
    }
    render()
  } catch (error) {
    if (!quiet) console.warn('同步牌桌失败：', error.message)
  }
}

async function gameAction(payload) {
  if (!state.room || !state.player) return
  try {
    await api.gameAction(state.room.id, { ...payload, playerId: state.player.id })
    await refreshGame(true)
  } catch (error) { showError('操作无效', error) }
}

async function handleButton(target) {
  if (target.id === 'create-room') return createRoom()
  if (target.id === 'rename-room') {
    return wx.showModal({ title: '房间名称', editable: true, placeholderText: state.roomName, success: ({ confirm, content }) => {
      if (confirm && content && content.trim()) { state.roomName = content.trim().slice(0, 16); render() }
    } })
  }
  if (target.id === 'join-tip') return wx.showModal({ title: '加入熟人房', content: '请让房主点击牌桌右上角“分享”，再从微信分享卡片进入。', showCancel: false })
  if (target.id === 'share') return wx.shareAppMessage({ title: `${state.room.name} · 贵州捉鸡麻将`, query: `room=${state.room.id}` })
  if (target.id === 'back') {
    if (state.pollTimer) clearInterval(state.pollTimer)
    state.pollTimer = null; state.screen = 'home'; state.room = null; state.game = null; state.message = ''; return render()
  }
  if (target.id === 'tile') { state.selectedTileIndex = target.payload; return render() }
  if (target.id === 'dice') {
    try {
      const value = Math.floor(Math.random() * 6) + 1
      const result = await api.rollDice(state.room.id, { playerId: state.player.id, value })
      state.room = result.room; state.message = `你掷出 ${value} 点`; render()
    } catch (error) { showError('掷骰失败', error) }
    return
  }
  if (target.id === 'start') {
    try { state.game = (await api.startGame(state.room.id, { operatorId: state.player.id })).game; state.message = '牌局开始'; render() }
    catch (error) { showError('暂不能开局', error) }
    return
  }
  if (target.id === 'draw') return gameAction({ type: 'DRAW' })
  if (target.id === 'pong') return gameAction({ type: 'PONG' })
  if (target.id === 'win') {
    const isTurn = state.game && state.game.currentPlayerId === state.player.id
    return gameAction({ type: 'WIN', method: isTurn ? 'selfDraw' : 'discard' })
  }
  if (target.id === 'discard') {
    const hand = state.game && state.game.privateHand
    const card = hand && hand[state.selectedTileIndex]
    if (!card) return wx.showToast({ title: '请先选择一张手牌', icon: 'none' })
    state.selectedTileIndex = null
    return gameAction({ type: 'DISCARD', card: { suit: card.suit, rank: card.rank } })
  }
  if (target.id === 'kong') {
    const hand = state.game && state.game.privateHand
    const card = hand && hand[state.selectedTileIndex]
    if (!card) return gameAction({ type: 'MING_KONG' })
    return wx.showActionSheet({ itemList: ['暗杠', '补杠', '明杠'], success: ({ tapIndex }) => {
      const type = ['AN_KONG', 'BU_KONG', 'MING_KONG'][tapIndex]
      gameAction({ type, card: { suit: card.suit, rank: card.rank } })
    } })
  }
}

wx.onTouchStart((event) => {
  const touch = event.touches && event.touches[0]
  if (!touch) return
  const x = touch.clientX == null ? touch.x : touch.clientX
  const y = touch.clientY == null ? touch.y : touch.clientY
  const target = [...state.buttons].reverse().find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h)
  if (target) handleButton(target)
})

if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] })
if (wx.onShow) wx.onShow((options) => {
  const roomId = options && options.query && options.query.room
  if (roomId && (!state.room || state.room.id !== roomId)) openRoom(roomId).catch((error) => showError('进入房间失败', error))
})

drawLoading()
initialize()
