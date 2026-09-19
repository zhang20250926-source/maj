App({
  globalData: {
    roomId: '208886',
    currentUser: { id: 'local-demo', nickname: '哈哈', score: 100 },
    token: null
  },

  onLaunch() {
    // 这里只初始化微信云能力。云托管环境 ID 必须仅传给 callContainer.config.env，
    // 不能填到 init，否则会被当成另一个云开发环境而导致调用失败。
    this.cloudReady = wx.cloud ? Promise.resolve(wx.cloud.init({ traceUser: true })) : Promise.resolve()
  },

  async ensureIdentity() {
    await this.cloudReady
    if (this.globalData.token) return this.globalData.currentUser
    try {
      const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
      const { request } = require('./utils/api')
      const { token, player } = await request({ path: '/api/auth/wechat', method: 'POST', data: { code: login.code, nickname: this.globalData.currentUser.nickname } })
      this.globalData.token = token; this.globalData.currentUser = player
    } catch (error) {
      // 未配置 AppID 的本地开发模式仍可体验房间 UI，真机发布时不允许走此分支。
      console.warn('微信登录未完成，使用本地演示身份：', error.message)
    }
    return this.globalData.currentUser
  }
})
