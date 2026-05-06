# Pi Finnhub Stock Dashboard

A lightweight stock market tracker dashboard made for a Raspberry Pi. It uses a tiny Node server, serves a static dashboard, and calls Finnhub from the server so your API key is not exposed in browser code.

## Features

- Watchlist quotes with price, day change, high, low, open, and previous close
- US market open or closed status
- Short server-side caching to reduce Finnhub API calls

## Setup

1. Install Node.js 18 or newer on the Raspberry Pi.
2. Copy `.env.example` to `.env`.
3. Add your Finnhub API key:

```bash
FINNHUB_API_KEY=your_finnhub_api_key_here
PORT=3000
DEFAULT_SYMBOLS=SPY,GOOGL,AMZN,MSFT,SOXL,INTC,GLD,AMD,MU
```

4. Start the dashboard:

```bash
node server.js
```

5. Open the Pi dashboard from another device on the same network:

```text
http://raspberrypi.local:3000
```

If `raspberrypi.local` does not resolve, use the Pi's IP address instead.

## Run on Boot with systemd

Create `/etc/systemd/system/pi-finnhub-dashboard.service`:

```ini
[Unit]
Description=Pi Finnhub Stock Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/pi/pi-finnhub-dashboard
ExecStart=/usr/bin/node /home/pi/pi-finnhub-dashboard/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pi-finnhub-dashboard
sudo systemctl start pi-finnhub-dashboard
```

## Finnhub Notes

The app uses these Finnhub REST endpoints:

- `/quote`
- `/stock/profile2`
- `/stock/market-status`

The free tier has rate limits, so the server caches quote responses briefly and slower-changing data for longer.
# PiStockTracker
# PiStockTracker
