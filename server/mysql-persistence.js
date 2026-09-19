'use strict'

class MySqlPersistence {
  constructor({ address, username, password, database = 'zhuocheng', mysqlDriver = null }) {
    const [host, port = '3306'] = String(address || '').split(':')
    if (!host || !username || !password) throw new Error('MySQL 环境变量不完整')
    this.options = { host, port: Number(port), user: username, password, database }
    this.mysqlDriver = mysqlDriver
  }

  async init() {
    const mysql = this.mysqlDriver || require('mysql2/promise')
    const root = mysql.createPool({ ...this.options, database: undefined, waitForConnections: true, connectionLimit: 2 })
    await root.query(`CREATE DATABASE IF NOT EXISTS \`${this.options.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await root.end()
    this.pool = mysql.createPool({ ...this.options, waitForConnections: true, connectionLimit: 5, enableKeepAlive: true })
    await this.pool.query('CREATE TABLE IF NOT EXISTS zhuocheng_state (id TINYINT PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)')
    const [rows] = await this.pool.query('SELECT payload FROM zhuocheng_state WHERE id = 1')
    return rows.length ? (typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload) : null
  }

  async save(data) {
    await this.pool.query('INSERT INTO zhuocheng_state (id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)', [JSON.stringify(data)])
  }
}

module.exports = { MySqlPersistence }
