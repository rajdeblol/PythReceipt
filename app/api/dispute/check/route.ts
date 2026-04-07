import { NextRequest, NextResponse } from "next/server"
import { BorshCoder } from "@coral-xyz/anchor"
import bs58 from "bs58"
import idl from "@/lib/idl.json"
import { HERMES_BASE, PROGRAM_ID, SOLANA_DEVNET_RPC } from "@/lib/constants"

const PYTH_ROUTER_BASE = "https://pyth-lazer-0.dourolabs.app"
const PYTH_API_KEY = process.env.PYTH_API_KEY || process.env.NEXT_PUBLIC_PYTH_API_KEY

const PRICE_ID_TO_FEED_ID: Record<string, number> = {
  ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace: 2,
  e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43: 1,
  ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d: 3,
}

const PRICE_ID_TO_MARKET: Record<string, string> = {
  ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace: "ETH/USD",
  e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43: "BTC/USD",
  ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d: "SOL/USD",
}

function normalizePriceId(id: string) {
  return id.startsWith("0x") ? id.slice(2).toLowerCase() : id.toLowerCase()
}

function normalizeAccountKey(k: any): string {
  if (typeof k === "string") return k
  if (k?.pubkey) return String(k.pubkey)
  return String(k)
}

function getAllAccountKeys(tx: any): string[] {
  const staticKeys = (tx?.transaction?.message?.accountKeys ?? []).map(normalizeAccountKey)
  const loadedWritable = (tx?.meta?.loadedAddresses?.writable ?? []).map(normalizeAccountKey)
  const loadedReadonly = (tx?.meta?.loadedAddresses?.readonly ?? []).map(normalizeAccountKey)
  return [...staticKeys, ...loadedWritable, ...loadedReadonly]
}

function decodeTriggerPriceIdFromData(dataBase58: string): string | null {
  try {
    const raw = Buffer.from(bs58.decode(dataBase58))
    if (raw.length < 12) return null
    const strLen = raw.readUInt32LE(8)
    if (strLen <= 0 || strLen > 128) return null
    const start = 12
    const end = start + strLen
    if (end > raw.length) return null
    const maybePriceId = raw.subarray(start, end).toString("utf8")
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(maybePriceId)) return normalizePriceId(maybePriceId)
  } catch {
    return null
  }
  return null
}

function toDecimal(mantissa: string | number | null | undefined, exponent: number | null | undefined): number | null {
  if (mantissa === null || mantissa === undefined) return null
  const n = Number(mantissa)
  if (!Number.isFinite(n)) return null
  if (typeof exponent === "number") return n * Math.pow(10, exponent)
  return n
}

async function fetchTx(signature: string) {
  const res = await fetch(SOLANA_DEVNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
    }),
    cache: "no-store",
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || "RPC error")
  if (!json.result) throw new Error("Transaction not found on devnet")
  return json.result
}

function decodePriceIdHexFromTx(tx: any): string | null {
  const coder = new BorshCoder(idl as any)
  const accountKeys = getAllAccountKeys(tx)

  const allInstructions = [
    ...(tx?.transaction?.message?.instructions ?? []),
    ...((tx?.meta?.innerInstructions ?? []).flatMap((x: any) => x.instructions ?? [])),
  ]

  for (const ix of allInstructions) {
    if (typeof ix.data !== "string") continue
    const programId = ix.programId ?? accountKeys[ix.programIdIndex]
    if (programId !== PROGRAM_ID) continue

    try {
      const decoded: any = coder.instruction.decode(ix.data, "base58")
      if (decoded?.name === "triggerLiquidation" && decoded?.data?.priceIdHex) {
        return normalizePriceId(decoded.data.priceIdHex)
      }
    } catch {
      const manual = decodeTriggerPriceIdFromData(ix.data)
      if (manual) return manual
    }
  }

  const logs = String((tx?.meta?.logMessages ?? []).join(" ")).toLowerCase()
  for (const knownId of Object.keys(PRICE_ID_TO_FEED_ID)) {
    if (logs.includes(knownId)) return knownId
  }

  return null
}

async function fetchPythRouterPoint(feedId: number, timestampUs: string) {
  const body = {
    timestamp: timestampUs,
    channel: "real_time",
    priceFeedIds: [feedId],
    properties: ["price", "confidence", "bestBidPrice", "bestAskPrice", "exponent"],
    formats: ["solana"],
    parsed: true,
    jsonBinaryEncoding: "base64",
  }
  const res = await fetch(`${PYTH_ROUTER_BASE}/price`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PYTH_API_KEY ? { authorization: `Bearer ${PYTH_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Pyth Router history failed: ${res.status}`)
  const data = await res.json()
  const parsedFeed = data?.parsed?.priceFeeds?.[0]
  if (!parsedFeed) throw new Error("No Pyth Router parsed price feed found for timestamp")

  const exponent = parsedFeed.exponent ?? null
  const price = toDecimal(parsedFeed.price, exponent)
  const confidence = toDecimal(parsedFeed.confidence, exponent)
  const bestBid = toDecimal(parsedFeed.bestBidPrice, exponent)
  const bestAsk = toDecimal(parsedFeed.bestAskPrice, exponent)

  if (price === null || confidence === null) {
    throw new Error("Incomplete Pyth Router history payload")
  }
  const confidencePct = (Math.abs(confidence) / Math.abs(price)) * 100
  return {
    source: "pyth_pro_router",
    timestampUs: data?.parsed?.timestampUs ?? timestampUs,
    price,
    confidence,
    confidencePct,
    bestBid,
    bestAsk,
  }
}

async function fetchHermesFallback(priceIdHex: string, timestampSec: number) {
  const from = timestampSec - 120
  const to = timestampSec + 120
  const url = `${HERMES_BASE}/v2/updates/price/${from}?ids[]=${priceIdHex}&encoding=base64&parsed=true`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Hermes fallback failed: ${res.status}`)
  const data = await res.json()
  const parsed = data?.parsed?.[0]?.price
  if (!parsed) throw new Error("Hermes fallback missing parsed price")
  const exponent = parsed.expo
  const price = Number(parsed.price) * Math.pow(10, exponent)
  const confidence = Number(parsed.conf) * Math.pow(10, exponent)
  return {
    source: "hermes_fallback",
    timestampUs: String((parsed.publish_time ?? to) * 1_000_000),
    price,
    confidence,
    confidencePct: (Math.abs(confidence) / Math.abs(price)) * 100,
    bestBid: null,
    bestAsk: null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { signature } = await req.json()
    if (!signature || typeof signature !== "string") {
      return NextResponse.json({ error: "signature is required" }, { status: 400 })
    }

    const tx = await fetchTx(signature)
    const blockTimeSec = tx.blockTime
    if (!blockTimeSec) {
      return NextResponse.json({ error: "Transaction has no blockTime yet. Try again shortly." }, { status: 409 })
    }

    const priceIdHex = decodePriceIdHexFromTx(tx)
    if (!priceIdHex) {
      const timestampUs = String(blockTimeSec * 1_000_000)
      return NextResponse.json({
        signature,
        market: "UNKNOWN",
        priceIdHex: null,
        blockTimeSec,
        oracle: {
          source: "unresolved",
          timestampUs,
          timestampIso: new Date(blockTimeSec * 1000).toISOString(),
          price: 0,
          confidence: 0,
          confidencePct: 0,
          bestBid: null,
          bestAsk: null,
        },
        verdict: "UNKNOWN",
        verdictMessage: "Oracle feed could not be decoded from this transaction.",
      })
    }

    const market = PRICE_ID_TO_MARKET[priceIdHex] ?? "UNKNOWN"
    const feedId = PRICE_ID_TO_FEED_ID[priceIdHex]
    const timestampUs = String(blockTimeSec * 1_000_000)

    let oraclePoint: any
    try {
      if (!feedId) throw new Error("No Pyth Router feed mapping")
      oraclePoint = await fetchPythRouterPoint(feedId, timestampUs)
    } catch (routerErr) {
      console.warn("[PythReceipt] dispute router history failed, using fallback:", routerErr)
      oraclePoint = await fetchHermesFallback(priceIdHex, blockTimeSec)
    }

    const verdict = oraclePoint.confidencePct > 0.2 ? "DISPUTED" : "FAIR"
    const verdictMessage =
      verdict === "FAIR"
        ? `✅ FAIR LIQUIDATION — Oracle confidence was ${oraclePoint.confidencePct.toFixed(4)}% (below threshold)`
        : `⚠️ DISPUTED — Oracle confidence was ${oraclePoint.confidencePct.toFixed(4)}% (above safe threshold) at time of liquidation`

    return NextResponse.json({
      signature,
      market,
      priceIdHex,
      blockTimeSec,
      oracle: {
        source: oraclePoint.source,
        timestampUs: oraclePoint.timestampUs,
        timestampIso: new Date(Number(oraclePoint.timestampUs) / 1000).toISOString(),
        price: oraclePoint.price,
        confidence: oraclePoint.confidence,
        confidencePct: oraclePoint.confidencePct,
        bestBid: oraclePoint.bestBid,
        bestAsk: oraclePoint.bestAsk,
      },
      verdict,
      verdictMessage,
    })
  } catch (e: any) {
    console.error("[PythReceipt] /api/dispute/check error", e)
    return NextResponse.json({ error: e?.message ?? "Failed to check dispute" }, { status: 500 })
  }
}
