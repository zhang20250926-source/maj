'use strict'

const rules = require('./rules/mahjong')

const winds = ['east', 'south', 'west', 'north']
const nextSeat = (seat) => (seat + 1) % 4
const sortCards = (cards) => cards.sort((a, b) => rules.keyOf(a).localeCompare(rules.keyOf(b)))
const sameTile = (left, right) => left.suit === right.suit && left.rank === right.rank

function shuffle(cards, random = Math.random) {
  const copy = cards.map(rules.clone)
  for (let index = copy.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1)); [copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

class MahjongGame {
  constructor({ playerIds, deck = null, random = Math.random, previousRandomChickenKey = null, randomChickenStreak = 0 }) {
    if (!Array.isArray(playerIds) || playerIds.length !== 4 || new Set(playerIds).size !== 4) throw new Error('必须由四位不同玩家开始牌局')
    this.playerIds = [...playerIds]
    this.random = random
    this.deck = deck ? deck.map(rules.clone) : shuffle(rules.createDeck(), random)
    if (this.deck.length !== 108) throw new Error('牌墙必须为 108 张')
    this.randomChicken = rules.chickenFromTail(this.deck)
    this.randomChickenKey = rules.keyOf(this.randomChicken)
    this.chickenBoost = previousRandomChickenKey === this.randomChickenKey ? randomChickenStreak + 1 : 0
    this.status = 'SEATING'
    this.turnSeat = null
    this.lastDiscard = null
    this.players = Object.fromEntries(playerIds.map((id) => [id, { id, wind: null, dice: null, hand: [], exposed: [], discards: [], chickenDiscards: [], responsibility: [], listening: false }]))
  }

  assignSeats(diceByPlayer) {
    if (this.status !== 'SEATING') throw new Error('当前不能重新定座')
    const rows = this.playerIds.map((id) => ({ id, dice: Number(diceByPlayer[id]) }))
    if (rows.some((row) => !Number.isInteger(row.dice) || row.dice < 1 || row.dice > 6)) throw new Error('骰子必须为 1 到 6')
    if (new Set(rows.map((row) => row.dice)).size !== 4) throw new Error('骰子相同的玩家必须重掷')
    rows.sort((left, right) => right.dice - left.dice)
    this.playerIds = rows.map((row) => row.id)
    rows.forEach((row, seat) => { this.players[row.id].wind = winds[seat]; this.players[row.id].dice = row.dice })
    this.status = 'READY'
    return this.snapshot()
  }

  start() {
    if (this.status !== 'READY') throw new Error('请先完成骰子定座')
    for (let seat = 0; seat < 4; seat++) {
      const count = seat === 0 ? 14 : 13
      this.players[this.playerIds[seat]].hand = sortCards(this.deck.splice(0, count))
    }
    this.turnSeat = 0
    this.status = 'PLAYING'
    return this.snapshot()
  }

  currentPlayerId() { return this.turnSeat === null ? null : this.playerIds[this.turnSeat] }
  player(playerId) { const player = this.players[playerId]; if (!player) throw new Error('玩家不在本局中'); return player }
  isChicken(card) { return rules.keyOf(card) === this.randomChickenKey || rules.keyOf(card) === 'tiao-1' || rules.keyOf(card) === 'tong-8' }

  draw(playerId) {
    if (this.status !== 'PLAYING' || this.currentPlayerId() !== playerId) throw new Error('当前不是你的摸牌回合')
    if (this.lastDiscard) throw new Error('请先处理上一张出牌')
    if (!this.deck.length) { this.status = 'DRAWN'; return { drawn: null, snapshot: this.snapshot() } }
    const card = this.deck.shift(); const player = this.player(playerId); player.hand.push(card); sortCards(player.hand)
    return { drawn: rules.clone(card), snapshot: this.snapshot() }
  }

  discard(playerId, card) {
    if (this.status !== 'PLAYING' || this.currentPlayerId() !== playerId) throw new Error('当前不是你的出牌回合')
    if (this.lastDiscard) throw new Error('请先响应上一张出牌')
    const player = this.player(playerId); const index = player.hand.findIndex((candidate) => sameTile(candidate, card))
    if (index < 0) throw new Error('手牌中没有这张牌')
    const [discarded] = player.hand.splice(index, 1)
    const chicken = this.isChicken(discarded)
    const record = { card: rules.clone(discarded), playerId, chicken, sequence: chicken ? this.chickenSequence(discarded) : null, value: chicken ? rules.discardChickenValue(discarded, this.chickenSequence(discarded), this.chickenBoost, rules.keyOf(discarded) === this.randomChickenKey) : 0 }
    if (chicken) player.chickenDiscards.push(record); else player.discards.push(record)
    this.lastDiscard = record
    return this.snapshot()
  }

  chickenSequence(card) {
    const key = rules.keyOf(card)
    let count = 0
    for (const player of Object.values(this.players)) count += player.chickenDiscards.filter((record) => rules.keyOf(record.card) === key).length
    return count + 1
  }

  pong(playerId) {
    const record = this.requireClaimableDiscard(playerId)
    const player = this.player(playerId); const matches = player.hand.filter((card) => sameTile(card, record.card))
    if (matches.length < 2) throw new Error('没有两张相同手牌，不能碰')
    this.takeFromHand(player, record.card, 2)
    player.exposed.push({ type: 'pong', tiles: [rules.clone(record.card), rules.clone(record.card), rules.clone(record.card)] })
    this.transferChickenOnClaim(record, playerId)
    this.lastDiscard = null; this.turnSeat = this.playerIds.indexOf(playerId)
    return this.snapshot()
  }

  mingKong(playerId) {
    const record = this.requireClaimableDiscard(playerId)
    const player = this.player(playerId); const matches = player.hand.filter((card) => sameTile(card, record.card))
    if (matches.length < 3) throw new Error('没有三张相同手牌，不能明杠')
    this.takeFromHand(player, record.card, 3)
    player.exposed.push({ type: 'kong', subtype: 'ming', tiles: Array.from({ length: 4 }, () => rules.clone(record.card)) })
    this.transferChickenOnClaim(record, playerId)
    this.lastDiscard = null; this.turnSeat = this.playerIds.indexOf(playerId)
    return { payments: rules.kongPayments({ type: 'ming', playerId, sourcePlayerId: record.playerId, players: this.playerIds }), snapshot: this.snapshot() }
  }

  buKong(playerId, card) {
    if (this.status !== 'PLAYING' || this.currentPlayerId() !== playerId || this.lastDiscard) throw new Error('当前不能补杠')
    const player = this.player(playerId); const pongIndex = player.exposed.findIndex((meld) => meld.type === 'pong' && sameTile(meld.tiles[0], card))
    if (pongIndex < 0 || !player.hand.some((candidate) => sameTile(candidate, card))) throw new Error('没有可补的碰牌')
    this.takeFromHand(player, card, 1)
    player.exposed[pongIndex] = { type: 'kong', subtype: 'bu', tiles: Array.from({ length: 4 }, () => rules.clone(card)) }
    this.pendingKong = { playerId, card: rules.clone(card) }
    return { pendingKong: true, snapshot: this.snapshot() }
  }

  finishBuKong() {
    if (!this.pendingKong) throw new Error('当前没有待确认的补杠')
    const { playerId } = this.pendingKong; this.pendingKong = null
    return { payments: rules.kongPayments({ type: 'bu', playerId, players: this.playerIds }), snapshot: this.snapshot() }
  }

  win(playerId, method = 'selfDraw') {
    if (this.status !== 'PLAYING') throw new Error('当前不能胡牌')
    const player = this.player(playerId); let concealed = [...player.hand]; let sourcePlayerId = null
    if (method === 'discard') {
      const record = this.requireClaimableDiscard(playerId); concealed.push(record.card); sourcePlayerId = record.playerId
      const hasKong = player.exposed.some((meld) => meld.type === 'kong')
      if (!rules.canClaimDiscard({ concealed, exposedMelds: player.exposed, hasKong })) throw new Error('无通行证的小胡不能点胡')
    } else if (method === 'robKong') {
      if (!this.pendingKong || this.pendingKong.playerId === playerId) throw new Error('当前没有可抢的补杠')
      concealed.push(this.pendingKong.card); sourcePlayerId = this.pendingKong.playerId
    } else if (method !== 'selfDraw' || this.currentPlayerId() !== playerId || this.lastDiscard) throw new Error('当前不是自摸胡牌时机')
    const result = rules.handScore({ concealed, exposedMelds: player.exposed })
    if (!result.valid) throw new Error('牌型不满足胡牌条件')
    this.status = 'FINISHED'
    const payments = rules.winPayments({ winnerId: playerId, method, sourcePlayerId, players: this.playerIds, score: result.score })
    this.lastDiscard = null; this.pendingKong = null
    return { winnerId: playerId, method, hand: result, payments, deltas: rules.sumTransfers(this.playerIds, payments), snapshot: this.snapshot() }
  }

  settleDraw() {
    if (this.status !== 'DRAWN') throw new Error('仅流局后可进行查听结算')
    const listeningPlayerIds = this.playerIds.filter((id) => rules.isListening(this.players[id].hand, this.players[id].exposed))
    const chickenCounts = Object.fromEntries(this.playerIds.map((id) => [id, this.playerChickenCount(id)]))
    const payments = listeningPlayerIds.length === 4 ? [] : rules.chickenSettlement({ players: this.playerIds, chickenCounts, listeningPlayerIds })
    this.status = 'FINISHED'
    return { listeningPlayerIds, payments, deltas: rules.sumTransfers(this.playerIds, payments), snapshot: this.snapshot() }
  }

  falsePong(playerId) {
    if (this.status !== 'PLAYING') throw new Error('当前牌局不能判定诈碰')
    this.player(playerId)
    return { kind: 'falsePong', playerId, payments: [], deltas: Object.fromEntries(this.playerIds.map((id) => [id, id === playerId ? -1 : 0])), snapshot: this.snapshot() }
  }

  falseWin(playerId) {
    if (this.status !== 'PLAYING') throw new Error('当前牌局不能判定诈胡')
    this.player(playerId); this.status = 'FINISHED'; this.lastDiscard = null; this.pendingKong = null
    // “直接判负”先以明确的判负事件落库；具体赔付番数仍只按用户已确认的胡牌规则计算，不擅自编造金额。
    return { kind: 'falseWin', playerId, forfeited: true, payments: [], deltas: Object.fromEntries(this.playerIds.map((id) => [id, 0])), snapshot: this.snapshot() }
  }

  playerChickenCount(playerId) {
    const player = this.player(playerId)
    const inHand = player.hand.filter((card) => this.isChicken(card)).length
    const onTable = player.chickenDiscards.reduce((total, record) => total + record.value, 0)
    const responsibility = player.responsibility.reduce((total, item) => total + item.amount, 0)
    return inHand + onTable + responsibility
  }

  requireClaimableDiscard(playerId) {
    if (this.status !== 'PLAYING' || !this.lastDiscard) throw new Error('当前没有可以响应的出牌')
    if (this.lastDiscard.playerId === playerId) throw new Error('不能响应自己的出牌')
    return this.lastDiscard
  }

  takeFromHand(player, card, amount) {
    for (let count = 0; count < amount; count++) { const index = player.hand.findIndex((candidate) => sameTile(candidate, card)); player.hand.splice(index, 1) }
  }

  transferChickenOnClaim(record, claimantId) {
    if (!record.chicken) return
    const owner = this.player(record.playerId); const claimant = this.player(claimantId)
    owner.chickenDiscards = owner.chickenDiscards.filter((candidate) => candidate !== record)
    claimant.responsibility.push({ from: record.playerId, card: rules.clone(record.card), amount: 1 })
    // 被碰/杠走的鸡仍保留它已经打出时的鸡值；吃碰者另外承担一只“赔鸡”。
    claimant.chickenDiscards.push({ ...record, playerId: claimantId, claimed: true })
  }

  continueAfterNoClaim() {
    if (!this.lastDiscard) throw new Error('当前没有需要跳过的出牌')
    this.lastDiscard = null; this.turnSeat = nextSeat(this.turnSeat)
    return this.snapshot()
  }

  snapshot() {
    return { status: this.status, randomChicken: rules.clone(this.randomChicken), chickenBoost: this.chickenBoost, tilesLeft: this.deck.length, currentPlayerId: this.currentPlayerId(), pendingKong: this.pendingKong, lastDiscard: this.lastDiscard && { ...this.lastDiscard, card: rules.clone(this.lastDiscard.card) }, players: this.playerIds.map((id) => ({ id, wind: this.players[id].wind, dice: this.players[id].dice, handCount: this.players[id].hand.length, exposed: this.players[id].exposed, discards: this.players[id].discards, chickenDiscards: this.players[id].chickenDiscards })) }
  }

  viewFor(playerId) {
    const snapshot = this.snapshot()
    if (!this.players[playerId]) return snapshot
    return { ...snapshot, privateHand: this.players[playerId].hand.map(rules.clone) }
  }

  toState() {
    return { playerIds: this.playerIds, deck: this.deck, randomChicken: this.randomChicken, randomChickenKey: this.randomChickenKey, chickenBoost: this.chickenBoost, status: this.status, turnSeat: this.turnSeat, lastDiscard: this.lastDiscard, pendingKong: this.pendingKong, players: this.players }
  }

  static fromState(state) {
    const game = Object.create(MahjongGame.prototype)
    Object.assign(game, state, { random: Math.random })
    return game
  }
}

module.exports = { MahjongGame, shuffle }
