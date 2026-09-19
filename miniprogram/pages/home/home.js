const { createRoom } = require('../../utils/api')

Page({
  data: { nickname: '哈哈', avatarText: '哈', roomName: '周末老友局', score: 100, creating: false },
  async onShow() {
    const app = getApp(); const player = await app.ensureIdentity()
    this.setData({ nickname: player.nickname, avatarText: player.nickname.slice(0, 1), score: player.score })
  },
  setRoomName(event) { this.setData({ roomName: event.detail.value }) },
  async createRoom() {
    if (this.data.creating) return
    this.setData({ creating: true })
    try {
      const player = await getApp().ensureIdentity()
      const { room } = await createRoom({ adminId: player.id, name: this.data.roomName })
      wx.navigateTo({ url: `/pages/table/table?room=${room.id}` })
    } catch (error) { wx.showModal({ title: '创建失败', content: error.message || '请检查网络后重试', showCancel: false }) }
    finally { this.setData({ creating: false }) }
  },
  showJoinTip() { wx.showModal({ title: '加入熟人房', content: '请从微信好友发送的房间分享卡片进入。', showCancel: false }) },
  openHistory() { wx.navigateTo({ url: '/pages/history/history' }) }
})
