#!/bin/bash
# 【极致低延迟】Opus → AAC 音频转码
# 目标延迟：< 500ms

echo "等待 doctorStream 流..."
sleep 3

while true; do
    echo "[$(date '+%H:%M:%S')] 启动低延迟转码..."

    ffmpeg \
        -rtsp_transport tcp \
        -i rtsp://192.168.20.209:8554/doctorStream \
        \
        -c:v copy \
        \
        -c:a aac \
        -b:a 48k \
        -ar 44100 \
        -ac 1 \
        -profile:a aac_low \
        \
        -fflags nobuffer+fastseek+flush_packets \
        -flags low_delay \
        -strict experimental \
        -max_delay 0 \
        -max_interleave_delta 0 \
        -avoid_negative_ts make_zero \
        -f flv \
        \
        rtmp://192.168.20.209:1935/doctorStream_aac

    echo "[$(date '+%H:%M:%S')] FFmpeg 意外退出，1秒后重试..."
    sleep 1
done
