'use strict'
const test = require('node:test'); const assert = require('node:assert/strict')
const { MahjongGame } = require('../server/game'); const { createDeck } = require('../server/rules/mahjong')

test('骰子定座后发 14/13/13/13 张并从东家开始', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); const snapshot = game.start()
  assert.equal(snapshot.currentPlayerId, 'a'); assert.equal(snapshot.tilesLeft, 55)
  assert.equal(game.players.a.hand.length, 14); assert.equal(game.players.b.hand.length, 13)
})

test('鸡牌打出进入鸡牌区且首次幺鸡为 3 个鸡', () => {
  const deck = createDeck(); const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  game.players.a.hand.unshift({ suit: 'tiao', rank: 1 }); game.discard('a', { suit: 'tiao', rank: 1 })
  assert.equal(game.players.a.chickenDiscards.length, 1); assert.equal(game.players.a.chickenDiscards[0].value, 3)
  assert.equal(game.players.a.discards.length, 0)
})

test('连续随机鸡涨价不会抬高不相同的固定鸡', () => {
  const deck = createDeck(); deck[106] = { suit: 'wan', rank: 3 } // 倒数第二张三万，本局随机鸡四万
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck, previousRandomChickenKey: 'wan-4', randomChickenStreak: 1 })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  game.players.a.hand.unshift({ suit: 'tiao', rank: 1 }); game.discard('a', { suit: 'tiao', rank: 1 })
  assert.equal(game.chickenBoost, 2)
  assert.equal(game.players.a.chickenDiscards[0].value, 3)
})

test('私有牌局视图只返回本人手牌', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  const aView = game.viewFor('a'); const watcherView = game.viewFor('watcher')
  assert.equal(aView.privateHand.length, 14); assert.equal('privateHand' in watcherView, false)
})

test('诈碰扣 1 分，诈胡直接结束本局并标记判负', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  assert.equal(game.falsePong('a').deltas.a, -1)
  const loss = game.falseWin('b')
  assert.equal(loss.forfeited, true); assert.equal(game.status, 'FINISHED')
})

test('鸡被碰走后保留原出牌鸡值，并额外多赔一只鸡', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  const chicken = { suit: 'tiao', rank: 1 }
  game.players.a.hand.unshift(chicken)
  game.players.b.hand.unshift({ ...chicken }, { ...chicken })
  game.discard('a', chicken); game.pong('b')
  assert.equal(game.players.b.chickenDiscards[0].value, 3)
  assert.equal(game.playerChickenCount('b'), 4)
})

test('暗杠立即产生三家各付 2 分的结算明细', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  const card = { suit: 'tong', rank: 1 }
  game.players.a.hand.unshift({ ...card }, { ...card }, { ...card }, { ...card })
  const result = game.anKong('a', card)
  assert.equal(result.payments.length, 3)
  assert.equal(result.payments.every((item) => item.amount === 2 && item.to === 'a'), true)
  assert.deepEqual(result.deltas, { a: 6, b: -2, c: -2, d: -2 })
})

test('未结束牌局序列化后可恢复私有手牌与当前回合', () => {
  const game = new MahjongGame({ playerIds: ['a','b','c','d'], deck: createDeck() })
  game.assignSeats({ a: 6, b: 4, c: 2, d: 1 }); game.start()
  game.discard('a', game.players.a.hand[0]); game.continueAfterNoClaim()
  const restored = MahjongGame.fromState(JSON.parse(JSON.stringify(game.toState())))
  assert.equal(restored.currentPlayerId(), 'b')
  assert.equal(restored.viewFor('a').privateHand.length, 13)
  assert.equal(restored.deck.length, game.deck.length)
})
