import { HERMES_BASE, PYTH_BENCHMARKS_BASE } from "./constants"

export interface OHLCBar {
  time: number; open: number; high: number; low: number; close: number
}
export interface ParsedPrice {
  price: number; confidence: number; expo: number; publishTime: number
}

export async function fetchPriceUpdate(priceIdHex: string): Promise<string> {
  const url = `/api/pyth?id=${priceIdHex}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pyth Proxy failed: ${res.status}`)
  const data = await res.json()
  console.log("[PythReceipt] VAA fetched via proxy", data)
  return data.binary.data[0]
}

export async function fetchCurrentPrice(priceIdHex: string): Promise<ParsedPrice> {
  const url = `/api/pyth?id=${priceIdHex}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pyth Proxy failed: ${res.status}`)
  const data = await res.json()
  console.log("[PythReceipt] Current price via proxy", data)
  const parsed = data.parsed[0]
  return {
    price: Number(parsed.price.price) * Math.pow(10, parsed.price.expo),
    confidence: Number(parsed.price.conf) * Math.pow(10, parsed.price.expo),
    expo: parsed.price.expo,
    publishTime: parsed.price.publish_time,
  }
}

export async function fetchBenchmarkPrice(symbol: string, from: number, to: number): Promise<OHLCBar[]> {
  const url = `${PYTH_BENCHMARKS_BASE}/history?symbol=${encodeURIComponent(symbol)}&resolution=1&from=${from}&to=${to}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Benchmarks fetch failed: ${res.status}`)
  const data = await res.json()
  console.log("[PythReceipt] Benchmarks payload", data)
  if (data.s !== "ok") throw new Error("Benchmarks returned no data")
  return data.t.map((time: number, i: number) => ({
    time, open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i],
  }))
}

export function parsePythPrice(priceRaw: number | bigint, expo: number): number {
  return Number(priceRaw) * Math.pow(10, expo)
}

export function computeFairnessScore(
  liquidationPrice: number, bars: OHLCBar[], liquidationTimestamp: number
): { score: number; verdict: string; nearestBar: OHLCBar | null } {
  if (!bars.length) return { score: 0, verdict: "No Data", nearestBar: null }
  const nearest = bars.reduce((prev, curr) =>
    Math.abs(curr.time - liquidationTimestamp) < Math.abs(prev.time - liquidationTimestamp) ? curr : prev
  )
  const withinCandle = liquidationPrice >= nearest.low && liquidationPrice <= nearest.high
  const pctFromHigh = Math.abs(liquidationPrice - nearest.high) / nearest.high
  const pctFromLow = Math.abs(liquidationPrice - nearest.low) / nearest.low
  const minPct = Math.min(pctFromHigh, pctFromLow)
  if (withinCandle) return { score: 100, verdict: "Fair", nearestBar: nearest }
  if (minPct < 0.005) return { score: 85, verdict: "Fair", nearestBar: nearest }
  if (minPct < 0.01) return { score: 70, verdict: "Borderline", nearestBar: nearest }
  if (minPct < 0.03) return { score: 45, verdict: "Questionable", nearestBar: nearest }
  return { score: 15, verdict: "Potentially Unfair", nearestBar: nearest }
}
