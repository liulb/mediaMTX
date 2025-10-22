import React, { useRef, useState, useEffect } from 'react'
import Hls from 'hls.js'

export default function App() {
  const [connected, setConnected] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [patientPlaying, setPatientPlaying] = useState(false)
  const localVideoRef = useRef()
  const patientVideoRef = useRef()
  const pcRef = useRef(null)
  const hlsRef = useRef(null)

  // 使用 hls.js 加载患者的 HLS 流
  useEffect(() => {
    const videoElement = patientVideoRef.current
    if (!videoElement) return

    const patientStreamUrl = 'http://192.168.20.209:8888/patientStream/index.m3u8'

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      })
      hlsRef.current = hls

      hls.loadSource(patientStreamUrl)
      hls.attachMedia(videoElement)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ 患者流 manifest 解析成功')
        // 确保取消静音
        videoElement.muted = false
        videoElement.volume = 1.0
        videoElement.play()
          .then(() => {
            console.log('✅ 患者流开始播放')
            console.log('🔊 音量:', videoElement.volume, '静音:', videoElement.muted)
            setPatientPlaying(true)
          })
          .catch(err => {
            console.log('⏳ 播放需要用户交互:', err.message)
          })
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('⏳ 网络错误，等待患者推流...')
              setTimeout(() => hls.loadSource(patientStreamUrl), 3000)
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('⚠️ 媒体错误，尝试恢复...')
              hls.recoverMediaError()
              break
            default:
              console.error('❌ HLS 致命错误:', data)
              hls.destroy()
              break
          }
        }
      })
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 原生支持 HLS
      videoElement.src = patientStreamUrl
      videoElement.addEventListener('loadedmetadata', () => {
        console.log('✅ 患者流加载成功 (Safari)')
        videoElement.play()
          .then(() => {
            console.log('✅ 患者流开始播放')
            setPatientPlaying(true)
          })
          .catch(err => console.log('⏳ 播放需要用户交互:', err.message))
      })
    } else {
      console.error('❌ 浏览器不支持 HLS 播放')
      alert('您的浏览器不支持 HLS 播放，请使用 Chrome、Safari 或 Edge')
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [])

  async function startWebRTCPush() {
    try {
      console.log('🔵 开始 WebRTC 推流到 MediaMTX...')

      // 检查支持的视频编码格式
      const videoCapabilities = RTCRtpSender.getCapabilities('video')
      console.log('📋 浏览器支持的视频编码:')
      videoCapabilities.codecs.forEach(c => {
        console.log(`  - ${c.mimeType} ${c.sdpFmtpLine || ''}`)
      })

      // 1. 获取摄像头
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          frameRate: 30
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      // 2. 创建 RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      // 监听连接状态变化（必须在创建后立即添加）
      pc.oniceconnectionstatechange = () => {
        console.log('🔄 ICE 连接状态:', pc.iceConnectionState)
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStreaming(true)
          console.log('✅ WebRTC 推流成功！')

          // 检查统计信息
          setInterval(async () => {
            const stats = await pc.getStats()
            stats.forEach(report => {
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                console.log('📊 视频发送统计:', {
                  bytesSent: report.bytesSent,
                  packetsSent: report.packetsSent,
                  framesEncoded: report.framesEncoded
                })
              }
            })
          }, 5000)
        } else if (pc.iceConnectionState === 'failed') {
          console.error('❌ ICE 连接失败')
          alert('WebRTC 连接失败，请检查网络或防火墙设置')
        } else if (pc.iceConnectionState === 'disconnected') {
          console.warn('⚠️ ICE 连接断开')
          setStreaming(false)
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('🔄 连接状态:', pc.connectionState)
      }

      pc.onicegatheringstatechange = () => {
        console.log('🔄 ICE 收集状态:', pc.iceGatheringState)
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🔵 ICE 候选:', event.candidate.candidate)
        } else {
          console.log('✅ ICE 候选收集完成')
        }
      }

      // 监听track状态
      pc.getSenders().forEach(sender => {
        console.log('📤 发送轨道:', sender.track?.kind, sender.track?.id)
      })

      // 3. 添加本地流到 PeerConnection
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream)

        // 如果是视频轨道，设置编码参数（尝试使用H.264）
        if (track.kind === 'video') {
          const params = sender.getParameters()
          if (!params.encodings) {
            params.encodings = [{}]
          }
          params.encodings[0].maxBitrate = 1500000 // 1.5 Mbps
          sender.setParameters(params)
        }
      })

      // 4. 创建 Offer（指定编码偏好）
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })

      // 打印完整的Offer SDP以查看编码格式
      console.log('🔵 完整Offer SDP:')
      console.log(offer.sdp)

      // 修改SDP，优先使用H.264
      let sdp = offer.sdp

      // 检查SDP中的视频编码
      const videoCodecs = sdp.match(/a=rtpmap:\d+ ([^\r\n]+)/g)
      console.log('📋 Offer中的编码格式:', videoCodecs)

      // 重新排序编码格式，将H.264放在最前面
      // 找到m=video行
      const videoLineMatch = sdp.match(/(m=video \d+ [^\r\n]+\r\n)/);
      if (videoLineMatch) {
        const videoLine = videoLineMatch[0];
        // 提取当前的payload types
        const payloadTypes = videoLine.match(/m=video \d+ \S+ (.+)/)[1].split(' ');

        // 找到H.264的payload type (通常是103或109)
        const h264Payloads = [];
        const otherPayloads = [];

        payloadTypes.forEach(pt => {
          const rtpmapMatch = sdp.match(new RegExp(`a=rtpmap:${pt} H264`, 'i'));
          if (rtpmapMatch) {
            h264Payloads.push(pt);
          } else {
            otherPayloads.push(pt);
          }
        });

        // 将H.264的payload types放在最前面
        const newPayloadOrder = [...h264Payloads, ...otherPayloads].join(' ');
        const newVideoLine = videoLine.replace(/m=video \d+ \S+ .+/, `m=video 9 UDP/TLS/RTP/SAVPF ${newPayloadOrder}`);
        sdp = sdp.replace(videoLineMatch[0], newVideoLine);

        console.log('✅ 已将H.264提升到最高优先级');
      }

      await pc.setLocalDescription({ type: 'offer', sdp })

      // 5. 发送 Offer 到 MediaMTX 的 WHIP 端点
      const whipUrl = 'http://192.168.20.209:8889/doctorStream/whip'
      const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: sdp,
      })

      if (!response.ok) {
        throw new Error(`WHIP 请求失败: ${response.status}`)
      }

      // 6. 接收 Answer
      const answerSdp = await response.text()
      console.log('✅ Answer SDP 接收成功')
      console.log('🔵 完整Answer SDP:')
      console.log(answerSdp)

      // 检查Answer中协商的编码
      const answerCodecs = answerSdp.match(/a=rtpmap:\d+ ([^\r\n]+)/g)
      console.log('📋 Answer中协商的编码:', answerCodecs)

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      setConnected(true)
      console.log('🎉 WebRTC 连接建立完成！等待 ICE 连接...')
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

  function retryPlayPatientStream() {
    console.log('🔄 手动刷新患者视频流...')
    if (hlsRef.current) {
      hlsRef.current.loadSource('http://192.168.20.209:8888/patientStream/index.m3u8')
    } else if (patientVideoRef.current) {
      patientVideoRef.current.load()
      patientVideoRef.current.play()
        .then(() => {
          console.log('✅ 患者流播放成功')
          setPatientPlaying(true)
        })
        .catch(err => {
          console.error('❌ 播放失败:', err.message)
        })
    }
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
            患者视频流 (HLS) {patientPlaying && '🟢 播放中'}
          </p>
          <video
            ref={patientVideoRef}
            autoPlay
            playsInline
            controls
            style={{
              width: 320,
              height: 240,
              background: '#000',
              border: patientPlaying ? '3px solid #52c41a' : '2px solid #ccc'
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
        <button
          onClick={retryPlayPatientStream}
          style={{
            padding: '10px 20px',
            backgroundColor: '#52c41a',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: 16
          }}
        >
          刷新患者视频
        </button>
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
