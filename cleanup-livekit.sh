#!/bin/bash
# 清理 LiveKit 遗留代码和依赖
# 当前方案只使用 MediaMTX + FFmpeg，不需要 LiveKit

set -e

echo "========================================="
echo "  清理 LiveKit 遗留代码"
echo "========================================="
echo ""

# 1. 备份 server 目录
if [ -d "server" ]; then
    echo "📦 备份 server/ 目录到 server.backup/..."
    cp -r server server.backup
    echo "✅ 备份完成"
fi

# 2. 移除 LiveKit 相关配置文件
echo ""
echo "🗑️  移除 LiveKit 配置文件..."

if [ -f "config/livekit.yaml" ]; then
    mv config/livekit.yaml config/livekit.yaml.backup
    echo "✅ 已备份 config/livekit.yaml"
fi

# 3. 清理 server 目录中的 LiveKit 依赖
if [ -d "server" ]; then
    echo ""
    echo "🧹 清理 server/ 目录..."

    # 移除 node_modules
    if [ -d "server/node_modules" ]; then
        rm -rf server/node_modules
        echo "✅ 已删除 server/node_modules"
    fi

    # 从 package.json 移除 livekit-server-sdk
    if [ -f "server/package.json" ]; then
        echo "📝 更新 server/package.json（移除 livekit-server-sdk）..."

        # 创建不包含 livekit 的新 package.json
        cat > server/package.json.new <<'EOF'
{
  "name": "mediamtx-server",
  "version": "1.0.0",
  "description": "MediaMTX API Server (LiveKit removed)",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "ws": "^8.18.0"
  }
}
EOF
        mv server/package.json.new server/package.json
        echo "✅ 已更新 server/package.json"
    fi
fi

# 4. 创建简化版 server.js（不依赖 LiveKit）
echo ""
echo "📝 创建简化版 server.js..."

cat > server/server.js.new <<'EOF'
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const serverHost = "http://192.168.20.209";

// API: 获取推流/播放地址
app.get("/url", (req, res) => {
  const role = req.query.role || "doctor";
  const streamKey = role === "doctor" ? "doctorStream" : "patientStream";

  const pushUrl = `rtmp://${serverHost.replace('http://', '')}:1935/${streamKey}`;
  const playUrl = `${serverHost}:8888/${streamKey}/index.m3u8`;

  res.json({
    role,
    pushUrl,
    playUrl,
  });
});

// 健康检查
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "MediaMTX API Server" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ MediaMTX API 服务已启动：http://localhost:${PORT}`);
  console.log(`📡 当前服务器: ${serverHost}`);
});
EOF

mv server/server.js server/server.js.backup
mv server/server.js.new server/server.js
echo "✅ 已创建简化版 server.js（已备份原文件）"

# 5. 更新 .gitignore
echo ""
echo "📝 更新 .gitignore..."

cat >> .gitignore <<'EOF'

# LiveKit 备份文件
server.backup/
config/livekit.yaml.backup
server/server.js.backup

# 遗留文档
TRTC-REPLACEMENT-PLAN.md.backup
EOF

echo "✅ 已更新 .gitignore"

# 6. 创建归档说明
echo ""
echo "📄 创建归档说明..."

cat > LIVEKIT-REMOVED.md <<'EOF'
# LiveKit 代码已移除

## 变更说明

本项目已从 LiveKit 架构迁移到 **MediaMTX + FFmpeg** 架构。

### 移除的组件

- ❌ LiveKit Server
- ❌ livekit-server-sdk (Node.js)
- ❌ config/livekit.yaml
- ❌ server/ 目录中的 LiveKit 相关代码

### 当前架构

```
医生端 (WebRTC) → MediaMTX → FFmpeg → 患者端 (RTMP)
患者端 (RTMP)   → MediaMTX → HLS    → 医生端 (HLS)
```

### 核心服务

1. **MediaMTX** (`bluenviron/mediamtx:latest`)
   - WebRTC 推流接收 (WHIP)
   - RTMP 推流接收
   - HLS 播放输出
   - RTSP 协议转换

2. **FFmpeg** (`jrottenberg/ffmpeg:6-alpine`)
   - 音频转码 (Opus → AAC)
   - 低延迟优化

### 备份文件位置

- `server.backup/` - 原 server 目录完整备份
- `config/livekit.yaml.backup` - LiveKit 配置备份
- `server/server.js.backup` - 原 server.js 备份

### 成本对比

| 方案 | 月费用 |
|------|--------|
| 腾讯云 TRTC | ¥7,300 |
| LiveKit 自建 | ¥1,500 |
| **MediaMTX 当前** | **¥700** |

### 相关文档

- 完整架构说明: `CLAUDE.md`
- 部署指南: `DEPLOY.md`
- Docker 配置: `docker-compose.yml`

---

**清理日期**: $(date '+%Y-%m-%d %H:%M:%S')
**清理脚本**: `cleanup-livekit.sh`
EOF

echo "✅ 已创建 LIVEKIT-REMOVED.md"

# 7. 显示总结
echo ""
echo "========================================="
echo "  清理完成！"
echo "========================================="
echo ""
echo "📊 清理总结："
echo "  ✅ 已备份 server/ → server.backup/"
echo "  ✅ 已备份 config/livekit.yaml"
echo "  ✅ 已备份 server/server.js"
echo "  ✅ 已移除 LiveKit SDK 依赖"
echo "  ✅ 已创建简化版 server.js"
echo "  ✅ 已创建归档说明文档"
echo ""
echo "⚠️  注意事项："
echo "  1. server/ 目录现在是可选的（当前架构不需要）"
echo "  2. 如需恢复，使用 server.backup/ 中的备份"
echo "  3. 建议提交前先测试当前功能是否正常"
echo ""
echo "🧪 测试命令："
echo "  docker compose restart"
echo "  curl http://localhost:9997/v3/paths/list"
echo ""
echo "📝 可选后续操作："
echo "  - 完全删除 server.backup/ 和 *.backup 文件"
echo "  - 更新 README.md 移除 LiveKit 相关说明"
echo "  - git add . && git commit -m 'Remove LiveKit dependencies'"
echo ""
