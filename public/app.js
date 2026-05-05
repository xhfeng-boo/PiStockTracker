const summaryGrid = document.querySelector("#summaryGrid");
const marketStatus = document.querySelector("#marketStatus");
const updatedAt = document.querySelector("#updatedAt");

let refreshTimer;

init();

async function init() {
  await loadDashboard();
  refreshTimer = setInterval(loadDashboard, 30_000);
  window.addEventListener("beforeunload", () => clearInterval(refreshTimer));
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
  if (!stocks.length) {
    summaryGrid.innerHTML = `<div class="empty">No symbols loaded yet.</div>`;
    return;
  }

  summaryGrid.innerHTML = stocks.map(stockCard).join("");
}

function stockCard(stock) {
  if (stock.error) {
    return `
      <article class="stock-card" data-symbol="${stock.symbol}">
        <p class="stock-symbol">${stock.symbol}</p>
        <p class="error">${escapeHtml(stock.error)}</p>
      </article>
    `;
  }

  const isUp = Number(stock.change) >= 0;
  const logo = stock.logo
    ? `<img class="logo" src="${stock.logo}" alt="">`
    : `<div class="logo" aria-hidden="true"></div>`;

  return `
    <article class="stock-card" data-symbol="${stock.symbol}">
      <div class="stock-head">
        <div class="stock-name">
          <p class="stock-symbol">${stock.symbol}</p>
          <p class="company">${escapeHtml(stock.name)}</p>
        </div>
        ${logo}
      </div>
      <div class="price">${money(stock.price, stock.currency)}</div>
      <div class="change ${isUp ? "positive" : "negative"}">
        ${signed(stock.changePercent)}%
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
