'use strict'

const SUITS = ['wan', 'tiao', 'tong']
const FIXED_CHICKENS = new Set(['tiao-1', 'tong-8'])

function tile(suit, rank) {
  if (!SUITS.includes(suit) || !Number.isInteger(rank) || rank < 1 || rank > 9) throw new Error('非法麻将牌')
  return { suit, rank }
}

function keyOf(card) { return `${card.suit}-${card.rank}` }
function clone(card) { return { suit: card.suit, rank: card.rank } }

function createDeck() {
  const deck = []
  for (const suit of SUITS) for (let rank = 1; rank <= 9; rank++) for (let n = 0; n < 4; n++) deck.push(tile(suit, rank))
  return deck
}

function chickenFromTail(deck) {
  if (!Array.isArray(deck) || deck.length < 2) throw new Error('牌墙至少需要两张牌才能确定随机鸡')
  const indicator = deck[deck.length - 2]
  return tile(indicator.suit, indicator.rank === 9 ? 1 : indicator.rank + 1)
}

function isBigRandomChicken(card) {
  const key = keyOf(card)
  return key === 'wan-1' || key === 'tong-1' || key === 'tiao-1' || key === 'tong-8'
}

function discardChickenValue(card, sequence, consecutiveBoost = 0, isRandomChicken = false) {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 4) throw new Error('鸡牌打出顺序必须为 1 到 4')
  const key = keyOf(card)
  // 1 条是固定幺鸡，但它若同时是本局随机鸡（金鸡），优先按随机鸡的 4/3 规则。
  if (isRandomChicken && key === 'tiao-1') return (sequence === 1 ? 4 : 3) + consecutiveBoost
  if (isRandomChicken && key === 'tong-8') return (sequence === 1 ? 3 : 2) + consecutiveBoost
  if (FIXED_CHICKENS.has(key)) return (sequence === 1 ? 3 : 2) + consecutiveBoost
  if (key === 'wan-1' || key === 'tong-1') return (sequence === 1 ? 3 : 2) + consecutiveBoost
  if (key === 'tiao-1') return (sequence === 1 ? 4 : 3) + consecutiveBoost
  if (key === 'tong-8') return (sequence === 1 ? 3 : 2) + consecutiveBoost
  return (sequence === 1 ? 2 : 1) + consecutiveBoost
}

function chickenValue(card, { location, sequence = 1, consecutiveBoost = 0, isRandomChicken = false } = {}) {
  if (location === 'hand') return 1
  if (location === 'discard') return discardChickenValue(card, sequence, consecutiveBoost, isRandomChicken)
  throw new Error('鸡牌位置必须是 hand 或 discard')
}

function countByKey(cards) {
  const counts = new Map()
  for (const card of cards) { const key = keyOf(card); counts.set(key, (counts.get(key) || 0) + 1) }
  return counts
}

function isSevenPairs(cards) {
  if (cards.length !== 14) return false
  return [...countByKey(cards).values()].every((n) => n === 2 || n === 4)
}

function isLuxurySevenPairs(cards) {
  return isSevenPairs(cards) && [...countByKey(cards).values()].some((n) => n === 4)
}

function isAllOneSuit(cards) { return cards.length > 0 && new Set(cards.map((card) => card.suit)).size === 1 }

function isAllTriplets(cards, exposedMelds = []) {
  const tripletCount = exposedMelds.filter((meld) => meld.type === 'pong' || meld.type === 'kong').length
  const counts = countByKey(cards)
  const values = [...counts.values()].sort((a, b) => a - b)
  return cards.length + exposedMelds.length * 3 === 14 && tripletCount + values.filter((n) => n === 3 || n === 4).length === 4 && values.filter((n) => n === 2).length === 1
}

function canMakeMelds(counts) {
  const key = [...counts.keys()].find((candidate) => counts.get(candidate) > 0)
  if (!key) return true
  const [suit, rankText] = key.split('-'); const rank = Number(rankText); const value = counts.get(key)
  if (value >= 3) {
    counts.set(key, value - 3)
    if (canMakeMelds(counts)) { counts.set(key, value); return true }
    counts.set(key, value)
  }
  if (rank <= 7) {
    const second = `${suit}-${rank + 1}`; const third = `${suit}-${rank + 2}`
    if ((counts.get(second) || 0) > 0 && (counts.get(third) || 0) > 0) {
      counts.set(key, value - 1); counts.set(second, counts.get(second) - 1); counts.set(third, counts.get(third) - 1)
      if (canMakeMelds(counts)) { counts.set(key, value); counts.set(second, counts.get(second) + 1); counts.set(third, counts.get(third) + 1); return true }
      counts.set(key, value); counts.set(second, counts.get(second) + 1); counts.set(third, counts.get(third) + 1)
    }
  }
  return false
}

function isStandardWin(concealed, exposedMelds = []) {
  const requiredConcealed = 14 - exposedMelds.length * 3
  if (concealed.length !== requiredConcealed) return false
  const counts = countByKey(concealed)
  for (const [key, value] of counts) {
    if (value < 2) continue
    counts.set(key, value - 2)
    if (canMakeMelds(counts)) { counts.set(key, value); return true }
    counts.set(key, value)
  }
  return false
}

function isListening(concealed, exposedMelds = []) {
  const expected = 13 - exposedMelds.length * 3
  if (concealed.length !== expected) return false
  for (const suit of SUITS) for (let rank = 1; rank <= 9; rank++) {
    const candidate = [...concealed, tile(suit, rank)]
    if (isStandardWin(candidate, exposedMelds) || isSevenPairs(candidate)) return true
  }
  return false
}

function isSingleWait(concealed, exposedMelds = []) {
  return exposedMelds.length === 4 && concealed.length === 2 && concealed[0].suit === concealed[1].suit && concealed[0].rank === concealed[1].rank
}

function handScore({ concealed, exposedMelds = [] }) {
  const allCards = [...concealed, ...exposedMelds.flatMap((meld) => meld.tiles || [])]
  if (!isStandardWin(concealed, exposedMelds) && !isSevenPairs(concealed)) return { valid: false, score: 0, type: null }
  const candidates = [{ type: 'small', score: 3 }]
  if (isAllTriplets(concealed, exposedMelds)) candidates.push({ type: 'allTriplets', score: 8 })
  if (isAllOneSuit(allCards)) candidates.push({ type: 'oneSuit', score: 15 })
  if (isSevenPairs(concealed)) candidates.push({ type: 'sevenPairs', score: 13 })
  if (isLuxurySevenPairs(concealed)) candidates.push({ type: 'luxurySevenPairs', score: 20 })
  if (isSingleWait(concealed, exposedMelds)) candidates.push({ type: 'singleWait', score: 15 })
  return { valid: true, ...candidates.sort((a, b) => b.score - a.score)[0] }
}

function canClaimDiscard({ concealed, exposedMelds = [], hasKong }) {
  const score = handScore({ concealed, exposedMelds })
  return score.valid && (hasKong || score.type !== 'small')
}

function kongPayments({ type, playerId, sourcePlayerId = null, players }) {
  if (!['ming', 'an', 'bu'].includes(type)) throw new Error('未知杠类型')
  const payments = []
  if (type === 'ming') {
    if (!sourcePlayerId) throw new Error('明杠必须指定放杠者')
    payments.push({ from: sourcePlayerId, to: playerId, amount: 2, reason: '明杠' })
  } else {
    for (const id of players) if (id !== playerId) payments.push({ from: id, to: playerId, amount: 2, reason: type === 'an' ? '暗杠' : '补杠' })
  }
  return payments
}

function winPayments({ winnerId, method, sourcePlayerId = null, players, score }) {
  if (!Number.isFinite(score) || score <= 0) throw new Error('胡牌分必须大于 0')
  if (method === 'selfDraw') return players.filter((id) => id !== winnerId).map((from) => ({ from, to: winnerId, amount: score, reason: '自摸胡牌' }))
  if (method === 'discard' || method === 'robKong') {
    if (!sourcePlayerId) throw new Error('点胡或抢杠胡必须指定责任玩家')
    return [{ from: sourcePlayerId, to: winnerId, amount: score, reason: method === 'robKong' ? '抢杠胡' : '点胡' }]
  }
  throw new Error('未知胡牌方式')
}

function chickenSettlement({ players, chickenCounts, listeningPlayerIds, winnerId = null }) {
  const receivers = new Set(listeningPlayerIds)
  if (winnerId) receivers.add(winnerId)
  const payments = []
  for (const from of players) {
    if (receivers.has(from)) continue
    for (const to of receivers) {
      const amount = chickenCounts[to] || 0
      if (amount > 0) payments.push({ from, to, amount, reason: '未听赔鸡' })
    }
  }
  return payments
}

function sumTransfers(players, payments) {
  const changes = Object.fromEntries(players.map((id) => [id, 0]))
  for (const payment of payments) { changes[payment.from] -= payment.amount; changes[payment.to] += payment.amount }
  return changes
}

module.exports = { tile, keyOf, clone, createDeck, chickenFromTail, isBigRandomChicken, discardChickenValue, chickenValue, isSevenPairs, isLuxurySevenPairs, isAllTriplets, isStandardWin, isListening, isSingleWait, handScore, canClaimDiscard, kongPayments, winPayments, chickenSettlement, sumTransfers }
