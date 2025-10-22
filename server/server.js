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
