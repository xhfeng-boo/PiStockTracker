const summaryGrid = document.querySelector("#summaryGrid");
const marketStatus = document.querySelector("#marketStatus");
const updatedAt = document.querySelector("#updatedAt");
const calendarWeek = document.querySelector("#calendarWeek");
const weatherLocation = document.querySelector("#weatherLocation");
const weatherWeek = document.querySelector("#weatherWeek");

let latestStocks = [];
let refreshTimer;
let weatherTimer;

init();

async function init() {
  renderCalendarWeek();
  await Promise.all([loadDashboard(), loadWeather()]);
  refreshTimer = setInterval(loadDashboard, 30_000);
  weatherTimer = setInterval(loadWeather, 30 * 60_000);
  window.addEventListener("beforeunload", () => {
    clearInterval(refreshTimer);
    clearInterval(weatherTimer);
  });
  window.addEventListener("resize", () => drawStockCharts(latestStocks));
}

function renderCalendarWeek() {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  calendarWeek.innerHTML = days
    .map((date) => {
      const isToday = date.toDateString() === today.toDateString();
      return `
        <article class="calendar-day ${isToday ? "today" : ""}">
          <div class="calendar-date">
            <span class="day-name">${date.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <span class="day-number">${date.getDate()}</span>
          </div>
          <div class="calendar-events">
            <p class="calendar-empty">Calendar not connected</p>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadWeather() {
  try {
    const data = await getJson("/api/weather");
    renderWeather(data);
  } catch (error) {
    weatherWeek.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function renderWeather(data) {
  weatherLocation.textContent = data.location || "Weather";

  if (!data.days?.length) {
    weatherWeek.innerHTML = `<div class="empty">No forecast available.</div>`;
    return;
  }

  weatherWeek.innerHTML = data.days
    .map((day) => {
      const date = new Date(`${day.date}T12:00:00`);
      return `
        <article class="weather-day">
          <div class="weather-date">
            <span class="weather-name">${date.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <span class="weather-number">${date.getDate()}</span>
          </div>
          <div class="weather-icon" aria-hidden="true">${weatherSymbol(day.code)}</div>
          <div class="weather-details">
            <strong>${escapeHtml(day.summary)}</strong>
            <span>${round(day.high)}° / ${round(day.low)}°</span>
          </div>
          <div class="rain-chance">${day.precipitation ?? 0}%</div>
        </article>
      `;
    })
    .join("");
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

function weatherSymbol(code) {
  if (code === 0) return "☀";
  if ([1, 2].includes(code)) return "◐";
  if (code === 3) return "☁";
  if ([45, 48].includes(code)) return "≋";
  if ([51, 53, 55, 56, 57].includes(code)) return "☂";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "☔";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⚡";
  return "•";
}

function round(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  return Math.round(Number(value));
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
