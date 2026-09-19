const { getHistory, getPlayerHistory } = require('../../utils/api')
Page({
  data: { rounds: [], transactions: [], empty: true },
  async onLoad(options) {
    try {
      const result = options.room ? await getHistory(options.room) : await getPlayerHistory((await getApp().ensureIdentity()).id)
      const { rounds, transactions } = result; this.setData({ rounds, transactions, empty: !rounds.length && !transactions.length })
    }
    catch (error) { console.warn('加载战绩失败', error) }
  }
})
