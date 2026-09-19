'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { MySqlPersistence } = require('../server/mysql-persistence')

test('MySQL 持久化可建表、恢复 JSON 状态并覆盖保存', async () => {
  const calls = []
  const pools = []
  const driver = {
    createPool(options) {
      const pool = {
        async query(sql, params = []) {
          calls.push({ sql, params, options })
          if (sql.startsWith('SELECT')) return [[{ payload: JSON.stringify({ players: { a: { score: 103 } }, activeGames: { room: { status: 'PLAYING' } } }) }]]
          return [[]]
        },
        async end() { calls.push({ sql: 'END', options }) }
      }
      pools.push(pool)
      return pool
    }
  }
  const persistence = new MySqlPersistence({ address: '127.0.0.1:3307', username: 'root', password: 'secret', mysqlDriver: driver })
  const recovered = await persistence.init()
  assert.equal(pools.length, 2)
  assert.equal(recovered.players.a.score, 103)
  assert.equal(recovered.activeGames.room.status, 'PLAYING')
  await persistence.save({ players: {}, rooms: {}, activeGames: {} })
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO zhuocheng_state')), true)
})

test('MySQL 配置缺失时拒绝启动，避免误写入临时积分', () => {
  assert.throws(() => new MySqlPersistence({ address: '', username: 'root', password: 'secret' }), /不完整/)
})
