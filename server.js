import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const finnhubBaseUrl = "https://finnhub.io/api/v1";

loadEnv();

const apiKey = process.env.FINNHUB_API_KEY;
const port = Number(process.env.PORT || 3000);
const defaultSymbols = cleanSymbols(process.env.DEFAULT_SYMBOLS || "SPY,GOOGL,AMZN,MSFT,SOXL,INTC,TSLA,QQQ,GLD,AMD,MU");
const cache = new Map();
const priceHistory = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(url, res);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong on the dashboard server." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Stock dashboard running at http://localhost:${port}`);
});

async function routeApi(url, res) {
  if (url.pathname === "/api/config") {
    sendJson(res, 200, { defaultSymbols });
    return;
  }

  if (!apiKey) {
    sendJson(res, 500, {
      error: "Missing FINNHUB_API_KEY. Add it to a .env file before starting the server."
    });
    return;
  }

  if (url.pathname === "/api/dashboard") {
    const symbols = cleanSymbols(url.searchParams.get("symbols") || defaultSymbols.join(","));
    if (symbols.length === 0) {
      sendJson(res, 400, { error: "Add at least one stock symbol." });
      return;
    }

    const limitedSymbols = symbols.slice(0, 12);
    const [quotes, market] = await Promise.all([
      Promise.all(limitedSymbols.map(getStockSummary)),
      cached("market-status-us", 60_000, () => finnhub("/stock/market-status", { exchange: "US" }))
    ]);

    sendJson(res, 200, {
      symbols: limitedSymbols,
      market,
      stocks: quotes.filter(Boolean),
      updatedAt: new Date().toISOString()
    });
    return;
  }

  if (url.pathname === "/api/search") {
    const query = String(url.searchParams.get("q") || "").trim();
    if (query.length < 1) {
      sendJson(res, 200, { result: [] });
      return;
    }

    const results = await cached(`search:${query.toUpperCase()}`, 300_000, () =>
      finnhub("/search", { q: query })
    );
    sendJson(res, 200, {
      result: Array.isArray(results.result) ? results.result.slice(0, 10) : []
    });
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

async function getStockSummary(symbol) {
  try {
    const [quote, profile] = await Promise.all([
      cached(`quote:${symbol}`, 20_000, () => finnhub("/quote", { symbol })),
      cached(`profile:${symbol}`, 600_000, () => finnhub("/stock/profile2", { symbol }))
    ]);

    const price = quote.c ?? null;
    const previousClose = quote.pc ?? null;
    const history = updatePriceHistory(symbol, price, previousClose);

    return {
      symbol,
      name: profile.name || symbol,
      logo: profile.logo || "",
      exchange: profile.exchange || "",
      currency: profile.currency || "USD",
      price,
      change: quote.d ?? null,
      changePercent: quote.dp ?? null,
      high: quote.h ?? null,
      low: quote.l ?? null,
      open: quote.o ?? null,
      previousClose,
      history,
      timestamp: quote.t ? new Date(quote.t * 1000).toISOString() : null
    };
  } catch (error) {
    return { symbol, error: error.message };
  }
}

function updatePriceHistory(symbol, price, previousClose) {
  const now = Date.now();
  const points = priceHistory.get(symbol) || [];

  if (points.length === 0 && isFiniteNumber(previousClose)) {
    points.push({ time: now - 60_000, price: Number(previousClose) });
  }

  if (isFiniteNumber(price)) {
    const last = points.at(-1);
    if (!last || last.price !== Number(price) || now - last.time > 45_000) {
      points.push({ time: now, price: Number(price) });
    }
  }

  const trimmed = points.slice(-80);
  priceHistory.set(symbol, trimmed);
  return trimmed;
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

async function finnhub(pathname, params = {}) {
  const url = new URL(`${finnhubBaseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("token", apiKey);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || `Finnhub returned HTTP ${response.status}`);
  }

  return data;
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = normalize(join(publicDir, safePath));

  if (!resolved.startsWith(publicDir) || !existsSync(resolved)) {
    sendJson(res, 404, { error: "File not found." });
    return;
  }

  const body = await readFile(resolved);
  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(resolved)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function cleanSymbols(value) {
  return String(value)
    .split(",")
    .map(cleanSymbol)
    .filter(Boolean)
    .filter((symbol, index, symbols) => symbols.indexOf(symbol) === index);
}

function cleanSymbol(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 15);
}

function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
