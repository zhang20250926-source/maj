const { getRoom, getGame, gameAction, joinRoom, rollDice, startGame } = require('../../utils/api')
const { connectRoom } = require('../../utils/realtime')
const { USE_CLOUD_RUN } = require('../../config')

const demoTiles = [
  ['wan', 2], ['wan', 3], ['wan', 4], ['tiao', 4], ['tiao', 5], ['tiao', 6],
  ['tong', 2], ['tong', 3], ['tong', 4], ['wan', 7], ['wan', 8], ['wan', 9],
  ['tiao', 7], ['tong', 8]
]

Page({
  data: {
    dice: [4, 6],
    diceStatus: '座位已确定',
    micOn: true,
    tilesLeft: 68,
    roomName: '周末老友局',
    roomId: '208 886',
    tiles: demoTiles.map(([suit, value]) => ({ suit, value, symbol: suit === 'wan' ? '萬' : suit === 'tiao' ? '竹' : '●' })),
    handChicken: [{ suit: 'tiao', value: 1, label: '冲锋鸡', sideways: true }, { suit: 'tong', value: 8, label: '2 鸡' }],
    players: {
      north: { wind: '北', name: '陈大哥', score: -18, muted: true, discards: ['一万', '九筒', '三筒', '四条', '二万', '六筒'] },
      west: { wind: '西', name: '阿杰', score: 126, muted: false, discards: ['五条', '一筒', '七筒', '三万'] },
      east: { wind: '东', name: '小潘', score: 109, muted: false, discards: ['六条', '二筒', '八筒', '四万'] }
    },
    message: '',
    playerId: null,
    gameStatus: 'WAITING',
    currentPlayerId: null,
    pendingKong: null,
    needsDraw: false,
    selfWind: '南',
    ownScore: 100,
    roundNumber: 0,
    randomChicken: { suit: 'tong', value: 3, symbol: '●', label: '三筒' },
    selectedTileIndex: null,
    room: null
  },

  async onLoad(options) {
    const player = await getApp().ensureIdentity()
    this.setData({ playerId: player.id })
    if (options.room) this.loadRoom(options.room, player.id)
  },

  async loadRoom(roomId, playerId) {
    try {
      let { room, leaderboard } = await getRoom(roomId)
      const isMember = room.seats.some((seat) => seat.playerId === playerId) || room.spectators.includes(playerId)
      if (!isMember && room.status === 'WAITING') {
        room = (await joinRoom(roomId, { playerId, role: room.seats.length < 4 ? 'player' : 'spectator' })).room
      }
      const self = leaderboard && leaderboard.find((item) => item.id === playerId)
      this.setData({ roomName: room.name, roomId: room.id, room, ownScore: self ? self.score : this.data.ownScore, roundNumber: room.roundNumber })
      if (USE_CLOUD_RUN) {
        // 云托管首版先以短轮询同步牌桌，避免未配置公网 WSS 域名时连接失败。
        this.pollTimer = setInterval(() => this.refreshGame(roomId, playerId), 1500)
      } else {
        this.socketTask = connectRoom(roomId, (game) => this.applyGameState(game), (error) => console.warn('实时连接失败', error))
      }
      const { game } = await getGame(roomId, playerId)
      this.applyGameState(game, true)
    } catch (error) {
      // 本地演示或服务不可用时继续展示牌桌，避免空白页；正式版应展示重试页。
      console.warn('读取房间失败，使用本地演示数据：', error.message)
    }
  },

  async refreshGame(roomId, playerId) {
    try {
      const { game } = await getGame(roomId, playerId)
      this.applyGameState(game, true)
    } catch (error) { console.warn('牌局同步暂不可用：', error.message) }
  },

  applyGameState(game, includesPrivateHand = false) {
    const symbolFor = (card) => card.suit === 'wan' ? '萬' : card.suit === 'tiao' ? '竹' : '●'
    const update = { tilesLeft: game.tilesLeft, gameStatus: game.status, currentPlayerId: game.currentPlayerId, pendingKong: game.pendingKong || null }
    if (game.randomChicken) update.randomChicken = { ...game.randomChicken, value: game.randomChicken.rank, symbol: symbolFor(game.randomChicken), label: this.tileName(game.randomChicken) }
    if (game.players) {
      const self = game.players.find((item) => item.id === this.data.playerId)
      if (self) this.setData({ selfWind: ({ east: '东', south: '南', west: '西', north: '北' })[self.wind] || '—' })
    }
    if (includesPrivateHand && game.privateHand) {
      update.tiles = game.privateHand.map((card) => ({ ...card, value: card.rank, symbol: symbolFor(card) }))
      update.needsDraw = game.status === 'PLAYING' && game.currentPlayerId === this.data.playerId && game.privateHand.length % 3 === 1
    }
    this.setData(update)
  },

  tileName(card) {
    const numbers = ['','一','二','三','四','五','六','七','八','九']
    return `${numbers[card.rank]}${card.suit === 'wan' ? '万' : card.suit === 'tiao' ? '条' : '筒'}`
  },

  onUnload() {
    if (this.socketTask) this.socketTask.close()
    if (this.pollTimer) clearInterval(this.pollTimer)
  },

  async rollDice() {
    try {
      const value = Math.floor(Math.random() * 6) + 1
      const { room } = await rollDice(this.data.roomId, { playerId: this.data.playerId, value })
      this.setData({ dice: [value, value], diceStatus: `你掷出 ${value} 点，等待其余玩家` , room })
    } catch (error) { wx.showToast({ title: error.message || '掷骰失败', icon: 'none' }) }
  },

  async startRound() {
    try {
      const { game } = await startGame(this.data.roomId, { operatorId: this.data.playerId })
      this.applyGameState(game, true)
    } catch (error) { wx.showModal({ title: '暂不能开局', content: error.message || '请等待四人完成掷骰', showCancel: false }) }
  },

  toggleMic() {
    this.setData({ micOn: !this.data.micOn })
  },

  async selectTile(event) {
    this.setData({ selectedTileIndex: Number(event.currentTarget.dataset.index) })
  },

  async discardSelected() {
    const index = this.data.selectedTileIndex
    if (index === null) return wx.showToast({ title: '请先选一张手牌', icon: 'none' })
    const card = this.data.tiles[index]
    await this.submitAction({ type: 'DISCARD', card: { suit: card.suit, rank: card.value } })
    this.setData({ selectedTileIndex: null })
  },

  drawTile() { this.submitAction({ type: 'DRAW' }) },

  tryKong() {
    if (this.data.currentPlayerId !== this.data.playerId) return this.submitAction({ type: 'MING_KONG' })
    const selected = this.data.tiles[this.data.selectedTileIndex]
    if (!selected) return wx.showToast({ title: '暗杠或补杠请先选牌', icon: 'none' })
    wx.showActionSheet({
      itemList: ['暗杠', '补杠'],
      success: ({ tapIndex }) => this.submitAction({ type: tapIndex === 0 ? 'AN_KONG' : 'BU_KONG', card: { suit: selected.suit, rank: selected.value } })
    })
  },

  finishBuKong() { this.submitAction({ type: 'FINISH_BU_KONG' }) },

  async submitAction(action) {
    try {
      const { result, game } = await gameAction(this.data.roomId, { ...action, playerId: this.data.playerId })
      // 操作响应是公共牌局快照；再取一次私有视图，避免手牌停留在操作前。
      const privateView = await getGame(this.data.roomId, this.data.playerId)
      this.applyGameState(privateView.game || game, true)
      if (result && result.hand) wx.showModal({ title: '本局结算', content: `${result.hand.type} · ${result.hand.score} 分`, showCancel: false })
    } catch (error) { wx.showModal({ title: '操作无效', content: error.message || '请按当前牌局状态操作', showCancel: false }) }
  },

  tryAction(event) {
    const action = event.currentTarget.dataset.action
    const types = { '碰': 'PONG', '胡': 'WIN' }
    const payload = { type: types[action] }
    if (action === '胡') payload.method = this.data.pendingKong && this.data.pendingKong.playerId !== this.data.playerId ? 'robKong' : (this.data.currentPlayerId === this.data.playerId ? 'selfDraw' : 'discard')
    this.submitAction(payload)
  },

  showDetails() {
    wx.showModal({
      title: '本局明细',
      content: '正式版本会记录胡牌分、鸡分、豆分、诈碰/诈胡与管理员补分。',
      showCancel: false
    })
  },

  onShareAppMessage() {
    return { title: `${this.data.roomName} · 贵州捉鸡麻将`, path: `/pages/table/table?room=${this.data.roomId}` }
  }
})
