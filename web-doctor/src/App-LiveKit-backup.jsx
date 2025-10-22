import React, { useRef, useState, useEffect } from 'react'
import flvjs from 'flv.js'

export default function App() {
  const [connected, setConnected] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const localVideoRef = useRef()
  const patientVideoRef = useRef()
  const [flvPlayer, setFlvPlayer] = useState(null)
  const mediaRecorderRef = useRef(null)
  const wsRef = useRef(null)

  // 加载患者的 FLV 流
  useEffect(() => {
    if (typeof window !== 'undefined' && flvjs.isSupported()) {
      const videoElement = patientVideoRef.current
      if (videoElement) {
        const player = flvjs.createPlayer({
          type: 'flv',
          url: 'http://192.168.20.209:8889/live/patientStream.flv',
          isLive: true,
          cors: true,
        })

        player.attachMediaElement(videoElement)
        player.load()
        player.play()

        setFlvPlayer(player)

        return () => {
          if (player) {
            player.destroy()
          }
        }
      }
    }
  }, [])

  async function join() {
    try {
      console.log('🔵 开始获取摄像头...')

      // 获取摄像头和麦克风
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      })

      // 显示本地视频
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      console.log('✅ 摄像头获取成功')
      console.log('🔵 开始推流到 MediaMTX...')

      // 使用 MediaRecorder 录制并推流
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000
      })

      mediaRecorderRef.current = mediaRecorder

      // 连接到后端 WebSocket 中转服务
      const ws = new WebSocket('ws://192.168.20.209:3000/stream')
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ WebSocket 连接成功')

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data)
          }
        }

        mediaRecorder.start(100) // 每100ms发送一次数据
        setStreaming(true)
        console.log('✅ 推流已开始')
      }

      ws.onerror = (error) => {
        console.error('❌ WebSocket 错误:', error)
        alert('推流服务连接失败，请检查后端服务')
      }

      ws.onclose = () => {
        console.log('🔴 WebSocket 连接关闭')
        setStreaming(false)
      }

      setConnected(true)
      console.log('🎉 全部完成！')
    } catch (err) {
      console.error('❌ 连接失败:', err)
      console.error('错误详情:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      })
      alert(`连接失败: ${err.message}\n\n请查看浏览器控制台获取详细信息`)
    }
  }

  function stopStreaming() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (wsRef.current) {
      wsRef.current.close()
    }
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => track.stop())
    }
    setConnected(false)
    setStreaming(false)
    console.log('🔴 推流已停止')
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>医生端（Web） - 双向视频通话</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 5px 0', fontSize: 12, color: '#666' }}>
            本地摄像头 {streaming && '(推流中)'}
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
              border: streaming ? '2px solid #52c41a' : '2px solid #ccc'
            }}
          ></video>
        </div>
        <div>
          <p style={{ margin: '0 0 5px 0', fontSize: 12, color: '#666' }}>
            患者视频流 (FLV)
          </p>
          <video
            ref={patientVideoRef}
            autoPlay
            playsInline
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
            onClick={join}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1677ff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            开始推流
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
              cursor: 'pointer'
            }}
          >
            停止推流
          </button>
        )}
      </div>
      <p style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
        说明：医生端推流到 MediaMTX，同时播放患者小程序的视频流。实现双向视频通话。
      </p>
    </div>
  )
}
