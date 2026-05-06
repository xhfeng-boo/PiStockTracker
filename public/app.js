const summaryGrid = document.querySelector("#summaryGrid");
const marketStatus = document.querySelector("#marketStatus");
const updatedAt = document.querySelector("#updatedAt");

let latestStocks = [];
let refreshTimer;

init();

async function init() {
  await loadDashboard();
  refreshTimer = setInterval(loadDashboard, 30_000);
  window.addEventListener("beforeunload", () => clearInterval(refreshTimer));
  window.addEventListener("resize", () => drawStockCharts(latestStocks));
}

async function loadDashboard() {
  try {
    const data = await getJson("/api/dashboard");

    renderMarket(data.market);
    renderStocks(data.stocks);
    updatedAt.textContent = `Updated ${new Date(data.updatedAt).toLocaleString()}`;
  } catch (error) {
    summaryGrid.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function renderMarket(market) {
  if (!market) {
    marketStatus.textContent = "Market status unavailable";
    return;
  }

  const state = market.isOpen ? "Open" : "Closed";
  marketStatus.textContent = `US market ${state}`;
  marketStatus.className = `status ${market.isOpen ? "positive" : ""}`;
}

function renderStocks(stocks) {
  latestStocks = stocks;

  if (!stocks.length) {
    summaryGrid.innerHTML = `<div class="empty">No symbols loaded yet.</div>`;
    return;
  }

  summaryGrid.innerHTML = stocks.map(stockRow).join("");
  requestAnimationFrame(() => drawStockCharts(stocks));
}

function stockRow(stock) {
  if (stock.error) {
    return `
      <article class="stock-row" data-symbol="${stock.symbol}">
        <div class="stock-id">
          <p class="stock-symbol">${stock.symbol}</p>
          <p class="error">${escapeHtml(stock.error)}</p>
        </div>
      </article>
    `;
  }

  const isUp = Number(stock.change) >= 0;
  const logo = stock.logo
    ? `<img class="logo" src="${stock.logo}" alt="">`
    : `<div class="logo" aria-hidden="true"></div>`;

  return `
    <article class="stock-row" data-symbol="${stock.symbol}">
      <div class="stock-id">
        ${logo}
        <div class="stock-name">
          <p class="stock-symbol">${stock.symbol}</p>
          <p class="company">${escapeHtml(stock.name)}</p>
        </div>
      </div>

      <div class="stock-chart">
        <canvas class="sparkline" data-symbol="${stock.symbol}" aria-label="${stock.symbol} price chart"></canvas>
      </div>

      <div class="stock-metrics">
        <div class="price">${money(stock.price, stock.currency)}</div>
        <div class="change ${isUp ? "positive" : "negative"}">${signed(stock.changePercent)}%</div>
      </div>

      <div class="meta-grid">
        <span>Open ${money(stock.open, stock.currency)}</span>
        <span>Prev ${money(stock.previousClose, stock.currency)}</span>
        <span>High ${money(stock.high, stock.currency)}</span>
        <span>Low ${money(stock.low, stock.currency)}</span>
      </div>
    </article>
  `;
}

function drawStockCharts(stocks) {
  for (const stock of stocks) {
    const canvas = document.querySelector(`.sparkline[data-symbol="${stock.symbol}"]`);
    if (!canvas) continue;
    drawSparkline(canvas, stock.history || [], Number(stock.change) >= 0);
  }
}

function drawSparkline(canvas, points, isUp) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 120;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const prices = points
    .map((point) => Number(point.price))
    .filter((price) => Number.isFinite(price));

  if (prices.length === 0) {
    context.strokeStyle = "#343d40";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    return;
  }

  if (prices.length === 1) prices.unshift(prices[0]);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 8;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;

  context.strokeStyle = "#2c3437";
  context.lineWidth = 1;
  for (let i = 1; i <= 2; i += 1) {
    const y = pad + (plotHeight / 3) * i;
    context.beginPath();
    context.moveTo(pad, y);
    context.lineTo(width - pad, y);
    context.stroke();
  }

  const gradient = context.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, isUp ? "rgba(71, 209, 140, 0.24)" : "rgba(255, 111, 97, 0.24)");
  gradient.addColorStop(1, "rgba(27, 32, 34, 0)");

  context.beginPath();
  prices.forEach((price, index) => {
    const x = pad + (plotWidth / Math.max(prices.length - 1, 1)) * index;
    const y = pad + plotHeight - ((price - min) / range) * plotHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineTo(width - pad, height - pad);
  context.lineTo(pad, height - pad);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  prices.forEach((price, index) => {
    const x = pad + (plotWidth / Math.max(prices.length - 1, 1)) * index;
    const y = pad + plotHeight - ((price - min) / range) * plotHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = isUp ? "#47d18c" : "#ff6f61";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

async function getJson(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function money(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function signed(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
