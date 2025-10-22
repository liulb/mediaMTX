import React, { useRef, useState, useEffect } from 'react'
import flvjs from 'flv.js'

export default function App() {
  const [connected, setConnected] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const localVideoRef = useRef()
  const patientVideoRef = useRef()
  const [flvPlayer, setFlvPlayer] = useState(null)
  const pcRef = useRef(null)

  // 加载患者的 FLV 流
  useEffect(() => {
    if (typeof window !== 'undefined' && flvjs.isSupported()) {
      const videoElement = patientVideoRef.current
      if (videoElement) {
        const player = flvjs.createPlayer({
          type: 'flv',
          url: 'http://192.168.20.209:8889/patientStream/index.m3u8',
          isLive: true,
          cors: true,
        })

        player.attachMediaElement(videoElement)
        player.load()
        player.play().catch(err => console.warn('播放失败:', err))

        setFlvPlayer(player)

        return () => {
          if (player) {
            player.destroy()
          }
        }
      }
    }
  }, [])

  async function startWebRTCPush() {
    try {
      console.log('🔵 开始 WebRTC 推流到 MediaMTX...')

      // 1. 获取摄像头
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      })

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      // 2. 创建 RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      // 3. 添加本地流到 PeerConnection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // 4. 创建 Offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('🔵 Offer SDP:', offer.sdp)

      // 5. 发送 Offer 到 MediaMTX 的 WHIP 端点
      const whipUrl = 'http://192.168.20.209:8889/doctorStream/whip'
      const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!response.ok) {
        throw new Error(`WHIP 请求失败: ${response.status}`)
      }

      // 6. 接收 Answer
      const answerSdp = await response.text()
      console.log('✅ Answer SDP 接收成功')

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      pc.oniceconnectionstatechange = () => {
        console.log('ICE 连接状态:', pc.iceConnectionState)
        if (pc.iceConnectionState === 'connected') {
          setStreaming(true)
          console.log('✅ WebRTC 推流成功！')
        }
      }

      setConnected(true)
      console.log('🎉 WebRTC 连接建立完成！')
    } catch (err) {
      console.error('❌ WebRTC 推流失败:', err)
      alert(`推流失败: ${err.message}\n\n请确保 MediaMTX 已启动并开启 WebRTC`)
    }
  }

  function stopStreaming() {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => track.stop())
      localVideoRef.current.srcObject = null
    }
    setConnected(false)
    setStreaming(false)
    console.log('🔴 推流已停止')
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>医生端 - MediaMTX WebRTC 推流</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 5px 0', fontSize: 12, color: '#666' }}>
            本地摄像头 {streaming && '🟢 推流中'}
          </p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: 320,
              height: 240,
              background: '#000',
              border: streaming ? '3px solid #52c41a' : '2px solid #ccc'
            }}
          ></video>
        </div>
        <div>
          <p style={{ margin: '0 0 5px 0', fontSize: 12, color: '#666' }}>
            患者视频流 (HLS)
          </p>
          <video
            ref={patientVideoRef}
            autoPlay
            playsInline
            controls
            style={{
              width: 320,
              height: 240,
              background: '#000'
            }}
          ></video>
        </div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        {!connected ? (
          <button
            onClick={startWebRTCPush}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1677ff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            开始推流 (WebRTC)
          </button>
        ) : (
          <button
            onClick={stopStreaming}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ff4d4f',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            停止推流
          </button>
        )}
      </div>
      <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 14 }}>📝 说明</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#666' }}>
          <li>医生端通过 WebRTC (WHIP) 推流到 MediaMTX</li>
          <li>患者通过小程序 RTMP 推流到 MediaMTX</li>
          <li>医生播放患者的 HLS 流（延迟 2-3秒）</li>
          <li>患者播放医生的 FLV/RTMP 流（延迟 2-3秒）</li>
        </ul>
      </div>
    </div>
  )
}
