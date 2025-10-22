Page({
  data: {
    role: 'patient',
    pushUrl: 'rtmp://192.168.20.209:1935/patientStream',
    playUrl: 'rtmp://192.168.20.209:1935/doctorStream_aac',  // 转码AAC流（兼容iOS）
  },

  onLoad() {
    console.log('页面加载，推流地址:', this.data.pushUrl)
    console.log('页面加载，播放地址:', this.data.playUrl)
  },

  switchRole() {
    const newRole = this.data.role === 'doctor' ? 'patient' : 'doctor'
    const streamKey = newRole === 'doctor' ? 'doctorStream' : 'patientStream'

    this.setData({
      role: newRole,
      pushUrl: `rtmp://192.168.20.209:1935/${streamKey}`,
      playUrl: `rtmp://192.168.20.209:8888/${newRole === 'patient' ? 'doctorStream' : 'patientStream'}/index.m3u8`,
    })

    console.log('切换角色:', newRole)
    console.log('新推流地址:', this.data.pushUrl)
    console.log('新播放地址:', this.data.playUrl)
  },

  onPusherStateChange(e) {
    console.log('pusher state:', e.detail.code, e.detail.message)

    // 状态码说明
    // 1001: 已经连接推流服务器
    // 1002: 已经与服务器握手完毕，开始推流
    // 1003: 打开摄像头成功
    // 1004: 录屏启动成功
    // 1005: 推流动态调整分辨率
    // 1006: 推流动态调整码率
    // 1007: 首帧画面采集完成
    // 1008: 编码器启动
    // -1301: 打开摄像头失败
    // -1302: 打开麦克风失败
    // -1303: 视频编码失败
    // -1304: 音频编码失败
    // -1305: 不支持的视频分辨率
    // -1306: 不支持的音频采样率
    // -1307: 网络断连，且经多次重连抢救无效
    // -1308: 开始录屏失败

    if (e.detail.code === 1002) {
      wx.showToast({ title: '推流成功', icon: 'success' })
    } else if (e.detail.code < 0) {
      wx.showToast({ title: '推流失败: ' + e.detail.message, icon: 'none' })
    }
  },

  onPusherError(e) {
    console.error('pusher error:', e.detail)
    wx.showToast({
      title: '推流错误: ' + e.detail.errMsg,
      icon: 'none',
      duration: 3000
    })
  },

  onPlayerStateChange(e) {
    console.log('player state:', e.detail.code, e.detail.message)

    // 2001: 已经连接服务器
    // 2002: 已经连接服务器，开始拉流
    // 2003: 网络接收到首个视频数据包(IDR)
    // 2004: 视频播放开始
    // 2005: 视频播放进度
    // 2006: 视频播放结束
    // 2007: 视频播放Loading
    // 2008: 解码器启动
    // 2009: 视频播放Loading结束
    // -2301: 网络断连，且经多次重连抢救无效
    // -2302: 获取加速拉流地址失败

    if (e.detail.code === 2004) {
      wx.showToast({ title: '播放成功', icon: 'success' })
      // 尝试恢复音频（iOS需要）
      this.resumeAudio()
    } else if (e.detail.code < 0) {
      wx.showToast({ title: '播放失败: ' + e.detail.message, icon: 'none' })
    }
  },

  // 恢复音频播放
  resumeAudio() {
    const playerContext = wx.createLivePlayerContext('player')
    playerContext.mute({
      muted: false,
      success: () => {
        console.log('✅ 音频已取消静音')
      },
      fail: (err) => {
        console.error('❌ 取消静音失败:', err)
      }
    })
    playerContext.resume()
  },

  // 手动播放按钮
  manualPlay() {
    const playerContext = wx.createLivePlayerContext('player')
    playerContext.play()
    playerContext.mute({ muted: false })
    wx.showToast({ title: '正在播放...', icon: 'none' })
  },

  onPlayerError(e) {
    console.error('player error:', e.detail)
    wx.showToast({
      title: '播放错误: ' + e.detail.errMsg,
      icon: 'none',
      duration: 3000
    })
  },
});
