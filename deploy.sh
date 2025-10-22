#!/bin/bash
# 龙蜥服务器部署脚本
# 用途：一键部署 MediaMTX 远程医疗系统

set -e  # 遇到错误立即退出

echo "========================================="
echo "  MediaMTX 远程医疗系统 - 服务器部署"
echo "========================================="

# 1. 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 未检测到 Docker，正在安装..."

    # 龙蜥 OS 安装 Docker
    sudo yum install -y yum-utils
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    sudo systemctl start docker
    sudo systemctl enable docker

    echo "✅ Docker 安装完成"
else
    echo "✅ Docker 已安装: $(docker --version)"
fi

# 2. 检查 Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 不可用"
    exit 1
else
    echo "✅ Docker Compose 可用: $(docker compose version)"
fi

# 3. 获取服务器公网 IP
PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "未获取到")
PRIVATE_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "检测到的 IP 地址："
echo "  公网 IP: $PUBLIC_IP"
echo "  内网 IP: $PRIVATE_IP"
echo ""

read -p "请输入要使用的 IP 地址（回车使用公网 IP $PUBLIC_IP）: " CUSTOM_IP
SERVER_IP=${CUSTOM_IP:-$PUBLIC_IP}

echo "将使用 IP: $SERVER_IP"

# 4. 更新配置文件中的 IP 地址
echo ""
echo "正在更新配置文件中的 IP 地址..."

# 更新 mediamtx.yml
if [ -f "config/mediamtx.yml" ]; then
    sed -i "s/192\.168\.[0-9]\+\.[0-9]\+/$SERVER_IP/g" config/mediamtx.yml
    echo "✅ 已更新 config/mediamtx.yml"
fi

# 更新 web-doctor/src/App.jsx
if [ -f "web-doctor/src/App.jsx" ]; then
    sed -i "s/192\.168\.[0-9]\+\.[0-9]\+/$SERVER_IP/g" web-doctor/src/App.jsx
    echo "✅ 已更新 web-doctor/src/App.jsx"
fi

# 更新 miniapp-patient/pages/index/index.js
if [ -f "miniapp-patient/pages/index/index.js" ]; then
    sed -i "s/192\.168\.[0-9]\+\.[0-9]\+/$SERVER_IP/g" miniapp-patient/pages/index/index.js
    echo "✅ 已更新 miniapp-patient/pages/index/index.js"
fi

# 更新 transcode.sh
if [ -f "transcode.sh" ]; then
    sed -i "s/192\.168\.[0-9]\+\.[0-9]\+/$SERVER_IP/g" transcode.sh
    echo "✅ 已更新 transcode.sh"
fi

# 5. 配置防火墙
echo ""
echo "正在配置防火墙规则..."

# 检查是否使用 firewalld
if command -v firewall-cmd &> /dev/null && sudo systemctl is-active --quiet firewalld; then
    echo "检测到 firewalld，正在添加规则..."

    sudo firewall-cmd --permanent --add-port=1935/tcp   # RTMP
    sudo firewall-cmd --permanent --add-port=8554/tcp   # RTSP
    sudo firewall-cmd --permanent --add-port=8888/tcp   # HLS
    sudo firewall-cmd --permanent --add-port=8889/tcp   # WebRTC HTTP
    sudo firewall-cmd --permanent --add-port=8189/udp   # WebRTC ICE
    sudo firewall-cmd --permanent --add-port=8189/tcp   # WebRTC ICE TCP
    sudo firewall-cmd --permanent --add-port=9997/tcp   # API
    sudo firewall-cmd --permanent --add-port=5173/tcp   # Vite (开发)

    sudo firewall-cmd --reload
    echo "✅ firewalld 规则已添加"

# 检查是否使用 iptables
elif command -v iptables &> /dev/null; then
    echo "检测到 iptables，正在添加规则..."

    sudo iptables -A INPUT -p tcp --dport 1935 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 8554 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 8888 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 8889 -j ACCEPT
    sudo iptables -A INPUT -p udp --dport 8189 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 8189 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 9997 -j ACCEPT
    sudo iptables -A INPUT -p tcp --dport 5173 -j ACCEPT

    sudo service iptables save || true
    echo "✅ iptables 规则已添加"
else
    echo "⚠️  未检测到防火墙，请手动配置安全组开放以下端口："
    echo "    1935, 8554, 8888, 8889, 8189(UDP), 9997, 5173"
fi

# 6. 启动服务
echo ""
echo "正在启动 MediaMTX 服务..."
docker compose down 2>/dev/null || true
docker compose up -d

# 7. 等待服务启动
echo "等待服务启动..."
sleep 5

# 8. 检查服务状态
echo ""
echo "========================================="
echo "  服务状态检查"
echo "========================================="

if docker ps | grep -q mediamtx; then
    echo "✅ MediaMTX 容器运行中"
else
    echo "❌ MediaMTX 容器未运行"
    docker logs mediamtx --tail 20
fi

if docker ps | grep -q transcoder; then
    echo "✅ FFmpeg 转码容器运行中"
else
    echo "❌ FFmpeg 转码容器未运行"
    docker logs transcoder --tail 20
fi

# 9. 测试端口
echo ""
echo "正在测试服务端口..."

if curl -s http://localhost:9997/ > /dev/null; then
    echo "✅ MediaMTX API 端口 9997 可访问"
else
    echo "❌ MediaMTX API 端口 9997 不可访问"
fi

# 10. 显示访问信息
echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "📡 服务器地址: $SERVER_IP"
echo ""
echo "🔗 访问地址："
echo "  医生端 Web: http://$SERVER_IP:5173 (需先启动 npm run dev)"
echo "  MediaMTX API: http://$SERVER_IP:9997/"
echo ""
echo "📋 流地址："
echo "  医生推流 (WebRTC): http://$SERVER_IP:8889/doctorStream/whip"
echo "  患者推流 (RTMP): rtmp://$SERVER_IP:1935/patientStream"
echo "  患者播放 (RTMP): rtmp://$SERVER_IP:1935/doctorStream_aac"
echo "  医生播放 (HLS): http://$SERVER_IP:8888/patientStream/index.m3u8"
echo ""
echo "⚙️  管理命令："
echo "  查看日志: docker logs -f mediamtx"
echo "  重启服务: docker compose restart"
echo "  停止服务: docker compose down"
echo ""
echo "⚠️  注意事项："
echo "  1. 确保云服务器安全组已开放上述端口"
echo "  2. 小程序需在微信公众平台配置服务器域名白名单"
echo "  3. 生产环境建议配置 HTTPS 和 WSS"
echo ""
