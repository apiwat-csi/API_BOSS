# Luna Plus Boss Tracker

เว็บแอป Python + Flask สำหรับติดตามเวลาเกิด Boss จาก API `https://lunaplus.asia/boss-status/json`

## Features

- ดึงข้อมูลจาก field `array`
- แสดงข้อมูล Boss และ Channel
- แปลง Unix timestamp เป็นเวลาไทย `Asia/Bangkok`
- Countdown realtime ทุก 1 วินาที
- Auto refresh ทุก 10 วินาที
- Search ชื่อ Boss และชื่อแผนที่
- Filter ด้วย `category` และ `mapName`
- เรียง Boss ที่ใกล้เกิดที่สุดก่อน
- สีสถานะ: เขียวกำลังเกิด, เหลืองใกล้เกิด, แดงยังไม่เกิด
- Favorite Boss ด้วย `localStorage`
- Loading state และ error handling สำหรับ timeout, unavailable, invalid JSON
- Dockerfile สำหรับ deploy

## Requirements

- Python 3.11+

## ติดตั้งและรัน

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

เปิดเว็บที่ `http://localhost:5000`

## Config

แก้เวลาที่ `config.json` แล้ว refresh หน้าเว็บได้เลย ไม่ต้อง deploy ใหม่

```json
{
  "apiRefreshSeconds": 10,
  "soonBeforeSeconds": 300
}
```

## Environment Variables

```bash
BOSS_API_URL=https://lunaplus.asia/boss-status/json
BOSS_API_TIMEOUT=8
CLIENT_CONFIG_PATH=config.json
PORT=5000
LOG_LEVEL=INFO
DISCORD_WEBHOOK_URL=
```

`DISCORD_WEBHOOK_URL` เตรียมไว้สำหรับต่อยอดระบบแจ้งเตือน Discord webhook

## Docker

```bash
docker build -t boss-tracker .
docker run -p 5000:5000 boss-tracker
```

## โครงสร้างโปรเจกต์

```text
project/
├── app.py
├── requirements.txt
├── Dockerfile
├── models/
├── routes/
├── services/
├── templates/
├── static/
│   ├── css/
│   ├── js/
│   └── sounds/
└── README.md
```
