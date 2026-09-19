'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../server/rules/mahjong')
const t = (suit, rank) => rules.tile(suit, rank)

test('108 张无字牌牌墙与牌尾随机鸡', () => {
  const deck = rules.createDeck(); assert.equal(deck.length, 108)
  deck[106] = t('tong', 9); assert.deepEqual(rules.chickenFromTail(deck), t('tong', 1))
})

test('鸡牌手中固定 1 个，打出按首次与连续局涨价计算', () => {
  assert.equal(rules.chickenValue(t('tong', 8), { location: 'hand' }), 1)
  assert.equal(rules.discardChickenValue(t('tiao', 1), 1), 3)
  assert.equal(rules.discardChickenValue(t('tiao', 1), 4), 2)
  assert.equal(rules.discardChickenValue(t('wan', 4), 1), 2)
  assert.equal(rules.discardChickenValue(t('wan', 4), 3, 2), 3)
  assert.equal(rules.discardChickenValue(t('tiao', 1), 1, 0, true), 4)
})

test('常规胡、七对与豪华七对取最高分', () => {
  const regular = [t('wan',1),t('wan',2),t('wan',3),t('tiao',2),t('tiao',3),t('tiao',4),t('tong',4),t('tong',5),t('tong',6),t('wan',7),t('wan',8),t('wan',9),t('tiao',8),t('tiao',8)]
  assert.deepEqual(rules.handScore({ concealed: regular }), { valid: true, type: 'small', score: 3 })
  const luxury = [t('wan',1),t('wan',1),t('wan',1),t('wan',1),t('wan',2),t('wan',2),t('wan',3),t('wan',3),t('tong',4),t('tong',4),t('tong',5),t('tong',5),t('tiao',6),t('tiao',6)]
  assert.deepEqual(rules.handScore({ concealed: luxury }), { valid: true, type: 'luxurySevenPairs', score: 20 })
})

test('大对子、清一色与单吊按已确认的最高固定分结算', () => {
  const triplets = [t('wan',1),t('wan',1),t('wan',1),t('tiao',2),t('tiao',2),t('tiao',2),t('tong',3),t('tong',3),t('tong',3),t('wan',4),t('wan',4),t('wan',4),t('tiao',5),t('tiao',5)]
  assert.deepEqual(rules.handScore({ concealed: triplets }), { valid: true, type: 'allTriplets', score: 8 })
  const oneSuit = [t('wan',1),t('wan',2),t('wan',3),t('wan',2),t('wan',3),t('wan',4),t('wan',3),t('wan',4),t('wan',5),t('wan',6),t('wan',7),t('wan',8),t('wan',9),t('wan',9)]
  assert.deepEqual(rules.handScore({ concealed: oneSuit }), { valid: true, type: 'oneSuit', score: 15 })
  const exposed = Array.from({ length: 4 }, (_, rank) => ({ type: 'pong', tiles: [t('tong', rank + 1),t('tong', rank + 1),t('tong', rank + 1)] }))
  assert.deepEqual(rules.handScore({ concealed: [t('wan', 6), t('wan', 6)], exposedMelds: exposed }), { valid: true, type: 'singleWait', score: 15 })
})

test('随机鸡的幺鸡、乌骨鸡与普通鸡使用不同打出牌值', () => {
  assert.equal(rules.discardChickenValue(t('wan', 6), 1, 0, true), 2)
  assert.equal(rules.discardChickenValue(t('wan', 1), 1, 0, true), 3)
  assert.equal(rules.discardChickenValue(t('tiao', 1), 1, 0, true), 4)
  assert.equal(rules.discardChickenValue(t('tong', 8), 2, 0, true), 2)
})

test('通行证限制无杠小胡点炮，有杠后允许', () => {
  const regular = [t('wan',1),t('wan',2),t('wan',3),t('tiao',2),t('tiao',3),t('tiao',4),t('tong',4),t('tong',5),t('tong',6),t('wan',7),t('wan',8),t('wan',9),t('tiao',8),t('tiao',8)]
  assert.equal(rules.canClaimDiscard({ concealed: regular, hasKong: false }), false)
  assert.equal(rules.canClaimDiscard({ concealed: regular, hasKong: true }), true)
})

test('13 张听牌可以被识别，未成听的牌不能通过查听', () => {
  const ready = [t('wan',1),t('wan',2),t('wan',3),t('tiao',2),t('tiao',3),t('tiao',4),t('tong',4),t('tong',5),t('tong',6),t('wan',7),t('wan',8),t('wan',9),t('tiao',8)]
  assert.equal(rules.isListening(ready), true)
  assert.equal(rules.isListening([t('wan',1),t('wan',1)]), false)
})

test('自摸、点炮与杠分的支付方正确', () => {
  const players = ['a','b','c','d']
  assert.equal(rules.winPayments({ winnerId: 'a', method: 'selfDraw', players, score: 3 }).length, 3)
  assert.deepEqual(rules.winPayments({ winnerId: 'a', method: 'discard', sourcePlayerId: 'b', players, score: 15 }), [{ from: 'b', to: 'a', amount: 15, reason: '点胡' }])
  assert.deepEqual(rules.kongPayments({ type: 'ming', playerId: 'a', sourcePlayerId: 'c', players }), [{ from: 'c', to: 'a', amount: 2, reason: '明杠' }])
})
