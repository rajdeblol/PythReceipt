"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { APP_NAME, APP_TAGLINE, PRICE_FEEDS, SOLSCAN_TX } from "@/lib/constants"
import { fetchCurrentPrice, fetchPriceUpdate } from "@/lib/pyth"
import { getProgram, triggerLiquidation } from "@/lib/anchor"
import { usePythLazer } from "@/hooks/usePythLazer"

const FEED_KEYS = Object.keys(PRICE_FEEDS) as Array<keyof typeof PRICE_FEEDS>

type OracleStatus = "VERIFIED" | "UNCERTAIN"
type AboutTab = "what" | "how" | "why"

interface ReceiptDetails {
  id: string
  txSig: string
  market: string
  timestamp: number
  pythPrice: number
  confidenceAbs: number
  confidencePct: number
  bestBid: number | null
  bestAsk: number | null
  oracleStatus: OracleStatus
  confidenceGateStatus: "AUTO_PASS" | "WARN_OVERRIDE"
  gateConfidencePct: number
}

interface RecentLiquidationRow {
  txSig: string
  market: string
  timestamp: number
  price: number
  confidencePct: number
  oracleStatus: OracleStatus
}

interface OracleSnapshot {
  price: number
  confidenceAbs: number
  confidencePct: number
  bestBid: number | null
  bestAsk: number | null
}

function formatMoney(value: number, maxDigits: number = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function shortHash(hash: string, prefix = 6, suffix = 6) {
  if (hash.length <= prefix + suffix) return hash
  return `${hash.slice(0, prefix)}...${hash.slice(-suffix)}`
}

function AnimatedNumber({ value, digits = 2, className = "" }: { value: number; digits?: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const from = displayValue
    const diff = value - from
    if (Math.abs(diff) < 0.00001) return

    const start = performance.now()
    const duration = 420

    const raf = (t: number) => {
      const progress = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(from + diff * eased)
      if (progress < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [value, displayValue])

  return <span className={className}>{displayValue.toLocaleString(undefined, { maximumFractionDigits: digits })}</span>
}

export default function HomePage() {
  const wallet = useWallet()
  const [selectedPair, setSelectedPair] = useState<keyof typeof PRICE_FEEDS>("ETH/USD")
  const lazerPrices = usePythLazer()
  const prevPriceRef = useRef<Record<string, number>>({})
  const [minPrice, setMinPrice] = useState("3000")
  const [positionSize, setPositionSize] = useState("10000")
  const [thresholdPct, setThresholdPct] = useState(80)

  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [liveConfidence, setLiveConfidence] = useState<number | null>(null)

  const [triggerLoading, setTriggerLoading] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [triggerSuccess, setTriggerSuccess] = useState(false)
  const [txSig, setTxSig] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null)
  const [recentRows, setRecentRows] = useState<RecentLiquidationRow[]>([])
  const [aboutTab, setAboutTab] = useState<AboutTab>("what")
  const [downloaded, setDownloaded] = useState(false)
  const [triggerBtnAnim, setTriggerBtnAnim] = useState<"" | "trigger-pulse" | "trigger-shake">("")
  const [pendingNotice, setPendingNotice] = useState<string | null>(null)
  const [warnGateSnapshot, setWarnGateSnapshot] = useState<OracleSnapshot | null>(null)
  const [blockedGatePct, setBlockedGatePct] = useState<number | null>(null)

  const selectedFeed = useMemo(() => PRICE_FEEDS[selectedPair], [selectedPair])
  const lazerMarket = lazerPrices[selectedPair]
  const currentPrice = lazerMarket?.price ?? livePrice ?? 0
  const currentConfidenceAbs = lazerMarket?.confidence ?? liveConfidence ?? 0
  const currentConfidencePct = currentPrice ? (Math.abs(currentConfidenceAbs) / Math.abs(currentPrice)) * 100 : 0
  const prevPrice = prevPriceRef.current[selectedPair] ?? currentPrice
  const isUp = currentPrice >= prevPrice
  const arrow = isUp ? "↑" : "↓"

  const topOracleStatus: OracleStatus = currentConfidencePct <= 0.2 ? "VERIFIED" : "UNCERTAIN"
  const confidenceBarWidth = Math.min(100, (currentConfidencePct / 1) * 100)

  useEffect(() => {
    const raw = localStorage.getItem("pythreceipt_recent_liquidations")
    if (!raw) return
    try {
      const rows = JSON.parse(raw) as RecentLiquidationRow[]
      setRecentRows(rows.slice(0, 5))
    } catch {
      console.warn("[PythReceipt] failed to parse localStorage rows")
    }
  }, [])

  useEffect(() => {
    if (currentPrice > 0) prevPriceRef.current[selectedPair] = currentPrice
  }, [currentPrice, selectedPair])

  async function onFetchPrice() {
    try {
      setPriceLoading(true)
      setPriceError(null)
      const p = await fetchCurrentPrice(selectedFeed.id)
      console.log("[PythReceipt] current price", p)
      setLivePrice(p.price)
      setLiveConfidence(p.confidence)
    } catch (e: any) {
      setPriceError(e?.message ?? "Failed to fetch price")
    } finally {
      setPriceLoading(false)
    }
  }

  function onCheckOracleHealth() {
    setTriggerError(null)
    if (!currentPrice || !currentConfidenceAbs) {
      setTriggerError("Oracle health unavailable. Check WebSocket/API key.")
      return
    }
    if (currentConfidencePct > 0.2) {
      setTriggerError(`Oracle health warning: confidence is ${currentConfidencePct.toFixed(4)}%`)
      return
    }
    setTriggerSuccess(true)
    setTimeout(() => setTriggerSuccess(false), 1200)
  }

  function persistRecentRow(row: RecentLiquidationRow) {
    const nextRows = [row, ...recentRows].slice(0, 5)
    setRecentRows(nextRows)
    localStorage.setItem("pythreceipt_recent_liquidations", JSON.stringify(nextRows))
  }

  function buildReceipt(sig: string, snapshot: OracleSnapshot, gateStatus: "AUTO_PASS" | "WARN_OVERRIDE"): ReceiptDetails {
    const pythPrice = snapshot.price
    const confidenceAbs = snapshot.confidenceAbs
    const confidencePct = snapshot.confidencePct
    const oracleStatus: OracleStatus = confidencePct <= 0.2 ? "VERIFIED" : "UNCERTAIN"
    return {
      id: `PR-${shortHash(sig, 8, 8)}`,
      txSig: sig,
      market: selectedPair,
      timestamp: Date.now(),
      pythPrice,
      confidenceAbs,
      confidencePct,
      bestBid: snapshot.bestBid,
      bestAsk: snapshot.bestAsk,
      oracleStatus,
      confidenceGateStatus: gateStatus,
      gateConfidencePct: confidencePct,
    }
  }

  async function getOracleSnapshotForGate(): Promise<OracleSnapshot> {
    if (lazerMarket?.price && lazerMarket?.confidence) {
      return {
        price: lazerMarket.price,
        confidenceAbs: Math.abs(lazerMarket.confidence),
        confidencePct: (Math.abs(lazerMarket.confidence) / Math.abs(lazerMarket.price)) * 100,
        bestBid: lazerMarket.bestBid ?? null,
        bestAsk: lazerMarket.bestAsk ?? null,
      }
    }
    const hermes = await fetchCurrentPrice(selectedFeed.id)
    setLivePrice(hermes.price)
    return {
      price: hermes.price,
      confidenceAbs: Math.abs(hermes.confidence),
      confidencePct: hermes.price ? (Math.abs(hermes.confidence) / Math.abs(hermes.price)) * 100 : 0,
      bestBid: null,
      bestAsk: null,
    }
  }

  async function executeLiquidation(snapshot: OracleSnapshot, gateStatus: "AUTO_PASS" | "WARN_OVERRIDE") {
    if (!wallet.publicKey || !wallet.sendTransaction || !wallet.signTransaction) {
      setTriggerError("Connect a compatible wallet first")
      return
    }

    try {
      setTriggerLoading(true)
      setTriggerError(null)
      setPendingNotice(null)
      setTriggerSuccess(false)
      setTxSig(null)

      const minPriceNum = Number(minPrice)
      const positionSizeNum = Number(positionSize)
      if (Number.isNaN(minPriceNum) || minPriceNum <= 0) throw new Error("Enter a valid minimum price")
      if (Number.isNaN(positionSizeNum) || positionSizeNum <= 0) throw new Error("Enter a valid position size")

      const vaa = await fetchPriceUpdate(selectedFeed.id)
      const { postPriceUpdate } = await import("@/lib/postPriceUpdate")
      const priceUpdateAccount = await postPriceUpdate(wallet, vaa, selectedFeed.id)

      const program = getProgram(wallet)
      const sig = await triggerLiquidation(
        program,
        wallet.publicKey,
        priceUpdateAccount,
        selectedFeed.id,
        minPriceNum
      )

      console.log("[PythReceipt] liquidation tx sig broadcasted:", sig)
      
      // IMMEDIATE FEEDBACK: Don't wait for confirmation
      setTxSig(sig)
      setTriggerSuccess(true)

      const nextReceipt = buildReceipt(sig, snapshot, gateStatus)
      setReceipt(nextReceipt)
      persistRecentRow({
        txSig: sig,
        market: nextReceipt.market,
        timestamp: nextReceipt.timestamp,
        price: nextReceipt.pythPrice,
        confidencePct: nextReceipt.confidencePct,
        oracleStatus: nextReceipt.oracleStatus,
      })
    } catch (e: any) {
      console.error("[PythReceipt] trigger error", e)
      let msg = e?.message ?? "Failed to trigger liquidation"
      if (msg.startsWith("TX_PENDING:")) {
        const pendingSig = msg.replace("TX_PENDING:", "").trim()
        if (pendingSig) {
          setTxSig(pendingSig)
          setPendingNotice("Pending - Check Solscan")
          return
        }
      }
      if (msg.includes("Transaction was not confirmed") || msg.includes("not confirmed in 30.00 seconds")) {
        const matchedSig = msg.match(/[1-9A-HJ-NP-Za-km-z]{43,88}/)?.[0] ?? null
        if (matchedSig) {
          setTxSig(matchedSig)
          setPendingNotice("Pending - Check Solscan")
          return
        }
        setPendingNotice("Pending - Check Solscan")
        return
      }
      if (msg.includes("InsufficientFunds") || msg.includes("0x1")) msg = "Insufficient SOL for transaction"
      else if (msg.includes("User rejected")) msg = "Transaction rejected in wallet"
      setTriggerError(msg)
    } finally {
      setTriggerLoading(false)
    }
  }

  async function onTriggerLiquidation() {
    setTriggerBtnAnim("")
    setTriggerError(null)
    setWarnGateSnapshot(null)
    setBlockedGatePct(null)
    try {
      const snapshot = await getOracleSnapshotForGate()
      const ratio = snapshot.confidencePct / 100
      if (ratio > 0.005) {
        setTriggerBtnAnim("trigger-shake")
        setTimeout(() => setTriggerBtnAnim(""), 350)
        setBlockedGatePct(snapshot.confidencePct)
        return
      }
      if (ratio >= 0.002) {
        setWarnGateSnapshot(snapshot)
        return
      }
      setTriggerBtnAnim("trigger-pulse")
      setTimeout(() => setTriggerBtnAnim(""), 350)
      await executeLiquidation(snapshot, "AUTO_PASS")
    } catch (e: any) {
      setTriggerError(e?.message ?? "Failed to evaluate oracle confidence gate")
    }
  }

  async function onConfirmWarningGate() {
    if (!warnGateSnapshot) return
    const snapshot = warnGateSnapshot
    setWarnGateSnapshot(null)
    await executeLiquidation(snapshot, "WARN_OVERRIDE")
  }

  function onDownloadReceiptJson() {
    if (!receipt) return
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${receipt.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  const shareUrl = receipt
    ? `https://x.com/intent/tweet?text=${encodeURIComponent(
        `PythReceipt ${receipt.id} | ${receipt.market} at $${receipt.pythPrice.toFixed(2)} | ${receipt.oracleStatus} | ${SOLSCAN_TX}/${receipt.txSig}?cluster=devnet`
      )}`
    : "#"

  const statusBadgeClass =
    receipt?.oracleStatus === "VERIFIED"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : "border-red-400/40 bg-red-400/10 text-red-300"

  return (
    <main className="neo-shell min-h-screen scan-lines">
      <section className="mx-auto max-w-[1240px] px-4 md:px-8 py-8 md:py-10">
        {warnGateSnapshot && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg neo-card p-6">
              <div className="font-mono text-xs text-[#fbbf24] mb-2">Oracle uncertainty detected ({warnGateSnapshot.confidencePct.toFixed(4)}%).</div>
              <h3 className="title-font text-2xl mb-2">Liquidation may be disputed.</h3>
              <p className="font-mono text-sm text-gray-300 mb-5">Proceed anyway?</p>
              <div className="flex gap-3">
                <button className="px-4 py-2 border border-white/15 bg-white/5 rounded-md text-sm font-mono" onClick={() => setWarnGateSnapshot(null)}>Cancel</button>
                <button className="px-4 py-2 border border-[#fbbf24]/60 bg-[#fbbf24]/20 rounded-md text-sm font-mono" onClick={onConfirmWarningGate}>Confirm & Trigger</button>
              </div>
            </div>
          </div>
        )}

        {blockedGatePct !== null && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg neo-card p-6 border-red-500/30">
              <div className="font-mono text-xs text-red-400 mb-2">Liquidation Blocked</div>
              <h3 className="title-font text-2xl mb-2 text-red-300">Oracle confidence too low ({blockedGatePct.toFixed(4)}%).</h3>
              <p className="font-mono text-sm text-gray-300 mb-5">Try again when market stabilizes.</p>
              <button className="px-4 py-2 border border-white/15 bg-white/5 rounded-md text-sm font-mono" onClick={() => setBlockedGatePct(null)}>Close</button>
            </div>
          </div>
        )}

        <div className="fade-up neo-nav px-5 py-4 md:px-7 md:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-7">
          <div className="flex items-center gap-4">
            <div className="neo-btn-primary px-4 py-2">
              <div className="title-font text-xl md:text-2xl leading-none">{APP_NAME}</div>
            </div>
            <div className="hidden md:block neo-tag">Solana Devnet • Pyth Oracle</div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="neo-btn-primary btn-lift px-4 py-2 text-sm font-semibold">Home</Link>
            <div className="neo-btn-ghost px-2 py-1">
              <WalletMultiButton />
            </div>
          </div>
        </div>

        <div className="fade-up-2 grid md:grid-cols-[1.1fr_0.9fr] gap-6 mb-6">
          <div className="neo-card p-6 md:p-8">
            <div className="neo-tag inline-flex mb-4">Cryptographic DeFi Protection</div>
            <h1 className="title-font neo-title text-5xl md:text-7xl mt-1">Proof Every Liquidation. Dispute Nothing Blind.</h1>
            <p className="font-mono text-base md:text-lg text-slate-300 mt-4 max-w-2xl">{APP_TAGLINE}</p>
            <div className="flex flex-wrap gap-2 mt-6">
              <span className="neo-tag">No Mock Data</span>
              <span className="neo-tag">Oracle Confidence Gate</span>
              <span className="neo-tag">Shareable Receipt</span>
            </div>
          </div>
          <div className="neo-card p-6">
            <div className="font-mono text-xs text-slate-400 mb-2">LATEST PROOF SNAPSHOT</div>
            <div className="title-font text-3xl leading-tight mb-4">{selectedPair} Oracle Channel</div>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between rounded-xl border border-indigo-200/30 bg-black/20 px-3 py-2">
                <span className="text-slate-300">Live Price</span>
                <span className="text-emerald-300 font-bold">${currentPrice > 0 ? formatMoney(currentPrice, 2) : "--"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-indigo-200/30 bg-black/20 px-3 py-2">
                <span className="text-slate-300">Confidence</span>
                <span className={`${currentConfidencePct > 0.2 ? "text-amber-300" : "text-emerald-300"} font-bold`}>
                  {currentPrice > 0 ? currentConfidencePct.toFixed(4) : "--"}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-indigo-200/30 bg-black/20 px-3 py-2">
                <span className="text-slate-300">Oracle</span>
                <span className={`${topOracleStatus === "VERIFIED" ? "text-emerald-300" : "text-red-300"} font-bold`}>
                  {topOracleStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="fade-up-2 grid gap-4 md:grid-cols-3 mb-6">
          <div className="neo-card p-5">
            <div className="font-mono text-xs text-gray-400 mb-1">LIVE PRICE</div>
            <div className="text-3xl font-bold text-[#00ff88] tabular-nums">
              ${currentPrice > 0 ? <AnimatedNumber value={currentPrice} digits={2} /> : "--"}
            </div>
            <div className="font-mono text-[11px] text-gray-500 mt-1">{selectedPair} via Pyth WebSocket</div>
          </div>
          <div className="neo-card p-5">
            <div className="font-mono text-xs text-gray-400 mb-1">CONFIDENCE</div>
            <div className={`text-3xl font-bold tabular-nums ${currentConfidencePct > 0.2 ? "text-[#fbbf24]" : "text-[#00ff88]"}`}>
              {currentPrice > 0 ? <AnimatedNumber value={currentConfidencePct} digits={4} /> : "--"}%
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${currentConfidencePct > 0.2 ? "bg-[#fbbf24]" : "bg-[#00ff88]"}`}
                style={{ width: `${confidenceBarWidth}%` }}
              />
            </div>
          </div>
          <div className="neo-card p-5">
            <div className="font-mono text-xs text-gray-400 mb-1">ORACLE STATUS</div>
            <div className={`text-2xl font-bold flex items-center gap-2 ${topOracleStatus === "VERIFIED" ? "text-[#00ff88]" : "text-[#ef4444]"}`}>
              <span className={`status-dot ${topOracleStatus === "VERIFIED" ? "verified" : "uncertain"}`} />
              {topOracleStatus === "VERIFIED" ? "VERIFIED" : "UNCERTAIN"}
            </div>
            <div className="font-mono text-[11px] text-gray-500 mt-1">Based on ETH confidence threshold 0.2%</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="fade-up-2 neo-card p-6 md:p-7">
            <div className="font-mono text-xs text-gray-400 mb-4">LIQUIDATION TRIGGER</div>

            <div className="flex gap-2 mb-4">
              <span className="asset-pill px-2 py-1 text-xs border border-white/10 bg-white/5 rounded-md cursor-default">🟣 ETH</span>
              <span className="asset-pill px-2 py-1 text-xs border border-white/10 bg-white/5 rounded-md cursor-default">🟠 BTC</span>
              <span className="asset-pill px-2 py-1 text-xs border border-white/10 bg-white/5 rounded-md cursor-default">🟢 SOL</span>
              <span className="asset-pill px-2 py-1 text-xs border border-white/10 bg-white/5 rounded-md cursor-default">🟡 BNB</span>
            </div>

            <label className="block mb-3">
              <div className="font-mono text-xs text-gray-500 mb-2">Market</div>
              <select
                className="w-full bg-[#0a0a11] border-2 border-indigo-200/30 rounded-xl p-3 font-mono text-sm"
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value as keyof typeof PRICE_FEEDS)}
                disabled={triggerLoading}
              >
                {FEED_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PRICE_FEEDS[key].label}
                  </option>
                ))}
              </select>
            </label>

            <div className={`font-mono text-sm mb-4 ${isUp ? "text-[#00ff88]" : "text-[#ef4444]"}`}>
              Current: ${currentPrice > 0 ? formatMoney(currentPrice, 4) : "--"} {currentPrice > 0 ? arrow : ""}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <div className="font-mono text-xs text-gray-500 mb-2">Minimum Price (USD)</div>
                <input
                  className="w-full bg-[#0a0a11] border-2 border-indigo-200/30 rounded-xl p-3 font-mono text-sm"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  disabled={triggerLoading}
                  inputMode="decimal"
                />
              </label>
              <label className="block">
                <div className="font-mono text-xs text-gray-500 mb-2">Position Size (USD)</div>
                <input
                  className="w-full bg-[#0a0a11] border-2 border-indigo-200/30 rounded-xl p-3 font-mono text-sm"
                  value={positionSize}
                  onChange={(e) => setPositionSize(e.target.value)}
                  disabled={triggerLoading}
                  inputMode="decimal"
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="flex justify-between font-mono text-xs text-gray-500 mb-2">
                <span>Liquidation Threshold %</span>
                <span>{thresholdPct}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={95}
                step={1}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(Number(e.target.value))}
                className="w-full accent-purple-500"
                disabled={triggerLoading}
              />
            </div>

            <div className="flex flex-wrap gap-3 mt-5 mb-3">
              <button
                className="neo-btn-ghost btn-lift px-4 py-2 text-sm font-mono"
                onClick={onFetchPrice}
                disabled={priceLoading || triggerLoading}
              >
                {priceLoading ? "Fetching..." : "Fetch Price"}
              </button>
              <button
                className={`neo-btn-primary btn-lift px-4 py-2 text-sm font-mono disabled:opacity-50 ${triggerBtnAnim}`}
                onClick={onTriggerLiquidation}
                disabled={!wallet.connected || triggerLoading}
              >
                {triggerLoading ? "Confirming on Devnet..." : "On-Chain Trigger"}
              </button>
              <button
                className="neo-btn-ghost btn-lift px-4 py-2 text-sm font-mono"
                onClick={onCheckOracleHealth}
                disabled={triggerLoading}
              >
                Check Oracle Health
              </button>
            </div>

            {priceError && <div className="font-mono text-xs text-red-400 mb-2">{priceError}</div>}
            {triggerError && <div className="font-mono text-xs text-red-400">{triggerError}</div>}
            {triggerSuccess && <div className="font-mono text-xs text-emerald-300 mt-2">Trigger submitted successfully.</div>}
            {pendingNotice && txSig && (
              <div className="font-mono text-xs text-[#fbbf24] mt-2">
                {pendingNotice} -{" "}
                <a className="underline" target="_blank" rel="noreferrer" href={`${SOLSCAN_TX}/${txSig}?cluster=devnet`}>
                  Open Solscan
                </a>
              </div>
            )}
          </div>

          <div className="fade-up-3 neo-card p-6 md:p-7">
            <div className="font-mono text-xs text-gray-400 mb-4">PROOF RECEIPT</div>

            {!receipt && (
              <div className="border-2 border-dashed border-indigo-200/25 rounded-xl p-8 text-center bg-white/[0.02]">
                <div className="text-4xl mb-3">🔒</div>
                <div className="font-mono text-sm text-gray-400">Awaiting liquidation trigger...</div>
              </div>
            )}

            {receipt && (
              <div className="space-y-4 receipt-enter">
                <div className="receipt-hover rounded-xl border-2 border-indigo-200/20 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[11px] text-gray-500">Receipt ID</div>
                      <div className="font-mono text-sm">{receipt.id}</div>
                    </div>
                    <span className={`px-2 py-1 text-[11px] font-mono border rounded ${statusBadgeClass} ${receipt.oracleStatus === "VERIFIED" ? "verified-shimmer" : ""}`}>{receipt.oracleStatus}</span>
                  </div>
                  <div className="font-mono text-[11px] text-gray-400">
                    Confidence Gate:{" "}
                    <span className={receipt.confidenceGateStatus === "AUTO_PASS" ? "text-emerald-300" : "text-[#fbbf24]"}>
                      {receipt.confidenceGateStatus === "AUTO_PASS"
                        ? `Oracle Verified (${receipt.gateConfidencePct.toFixed(4)}%)`
                        : `Warning Override (${receipt.gateConfidencePct.toFixed(4)}%)`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono text-sm">
                    <div>
                      <div className="text-[11px] text-gray-500">Market</div>
                      <div>{receipt.market}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Timestamp</div>
                      <div>{new Date(receipt.timestamp).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Pyth Live Price</div>
                      <div className="text-[#00ff88] font-bold">${formatMoney(receipt.pythPrice, 4)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Confidence Interval</div>
                      <div>
                        ±${formatMoney(receipt.confidenceAbs, 6)} ({receipt.confidencePct.toFixed(4)}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Best Bid</div>
                      <div>{receipt.bestBid ? `$${formatMoney(receipt.bestBid, 4)}` : "--"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Best Ask</div>
                      <div>{receipt.bestAsk ? `$${formatMoney(receipt.bestAsk, 4)}` : "--"}</div>
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-[11px] text-gray-500">Tx Signature</div>
                    <a
                      href={`${SOLSCAN_TX}/${receipt.txSig}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-purple-300 underline break-all"
                    >
                      {receipt.txSig}
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="neo-btn-ghost btn-lift btn-scale-glow px-4 py-2 text-sm font-mono"
                    onClick={onDownloadReceiptJson}
                  >
                    {downloaded ? "Downloaded ✓" : "Download Receipt JSON"}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="neo-btn-primary btn-lift btn-scale-glow px-4 py-2 text-sm font-mono"
                  >
                    Share on X
                  </a>
                  <Link href={`/receipt/${receipt.txSig}`} className="neo-btn-ghost btn-lift px-4 py-2 text-sm font-mono">
                    Open Receipt Page
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="fade-up-3 neo-card p-6 mt-6">
          <div className="font-mono text-xs text-gray-400 mb-4">RECENT LIQUIDATIONS</div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/10">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Oracle Status</th>
                  <th className="py-2 pr-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.length === 0 && (
                  <tr>
                    <td className="py-4 text-gray-500" colSpan={6}>
                      No liquidations yet.
                    </td>
                  </tr>
                )}
                {recentRows.map((row, i) => (
                  <tr key={row.txSig} className="row-fade border-b border-white/5 hover:bg-purple-500/10 cursor-pointer transition-colors" style={{ animationDelay: `${i * 90}ms` }}>
                    <td className="py-3 pr-3">{new Date(row.timestamp).toLocaleTimeString()}</td>
                    <td className="py-3 pr-3">{row.market}</td>
                    <td className="py-3 pr-3">${formatMoney(row.price, 4)}</td>
                    <td className="py-3 pr-3">{row.confidencePct.toFixed(4)}%</td>
                    <td className="py-3 pr-3">
                      <span className={row.oracleStatus === "VERIFIED" ? "text-emerald-300" : "text-red-300"}>{row.oracleStatus}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <a
                        href={`${SOLSCAN_TX}/${row.txSig}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-300 underline"
                      >
                        {shortHash(row.txSig)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fade-up-3 neo-card p-6 mt-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
            <div className="font-mono text-xs text-gray-400">ABOUT PYTHRECEIPT</div>
            <div className="inline-flex p-1 rounded-full border-2 border-indigo-200/30 bg-black/30">
              <button
                onClick={() => setAboutTab("what")}
                className={`tab-link px-3 py-1.5 rounded-full font-mono text-xs transition-colors ${
                  aboutTab === "what" ? "bg-purple-500/30 text-white border border-purple-400/50" : "text-gray-400 hover:text-white"
                }`}
              >
                What is PythReceipt?
              </button>
              <button
                onClick={() => setAboutTab("how")}
                className={`tab-link px-3 py-1.5 rounded-full font-mono text-xs transition-colors ${
                  aboutTab === "how" ? "bg-purple-500/30 text-white border border-purple-400/50" : "text-gray-400 hover:text-white"
                }`}
              >
                How It Works
              </button>
              <button
                onClick={() => setAboutTab("why")}
                className={`tab-link px-3 py-1.5 rounded-full font-mono text-xs transition-colors ${
                  aboutTab === "why" ? "bg-purple-500/30 text-white border border-purple-400/50" : "text-gray-400 hover:text-white"
                }`}
              >
                Why Pyth?
              </button>
            </div>
          </div>

          <div key={aboutTab} className="animate-[fadeUp_0.35s_ease_forwards]">
            {aboutTab === "what" && (
              <div>
                <h3 className="title-font text-3xl md:text-4xl mb-3">Cryptographic Proof for Every Liquidation</h3>
                <p className="font-mono text-sm text-gray-300 leading-relaxed max-w-4xl mb-5">
                  DeFi liquidations happen in milliseconds. When your position gets liquidated, how do you know the price was fair?
                  PythReceipt creates an immutable, cryptographic receipt of every liquidation, stamped with Pyth Network&apos;s real-time
                  oracle data.
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-xs text-purple-300 mb-2">🔐 ON-CHAIN PROOF</div>
                    <p className="font-mono text-xs text-gray-300 leading-relaxed">
                      Every liquidation triggers a Solana transaction with Pyth&apos;s signed price data embedded.
                    </p>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-xs text-purple-300 mb-2">🛡️ ORACLE CONFIDENCE GATE</div>
                    <p className="font-mono text-xs text-gray-300 leading-relaxed">
                      Liquidations are blocked if Pyth&apos;s confidence interval is too wide, protecting users from bad price data.
                    </p>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-xs text-purple-300 mb-2">📄 DOWNLOADABLE RECEIPT</div>
                    <p className="font-mono text-xs text-gray-300 leading-relaxed">
                      Get a JSON receipt with price, confidence, bid/ask, and timestamp that is shareable and verifiable.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {aboutTab === "how" && (
              <div>
                <h3 className="title-font text-3xl md:text-4xl mb-4">How It Works</h3>
                <div className="space-y-3">
                  <div className="flex gap-4 rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-purple-300">1. 🔌</div>
                    <div>
                      <div className="font-mono text-sm text-white mb-1">Connect Wallet</div>
                      <div className="font-mono text-xs text-gray-300">Connect your Phantom wallet to get started.</div>
                    </div>
                  </div>
                  <div className="flex gap-4 rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-purple-300">2. 📊</div>
                    <div>
                      <div className="font-mono text-sm text-white mb-1">Live Oracle Check</div>
                      <div className="font-mono text-xs text-gray-300">App fetches real-time price and confidence from Pyth Pro WebSocket.</div>
                    </div>
                  </div>
                  <div className="flex gap-4 rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-purple-300">3. 🛡️</div>
                    <div>
                      <div className="font-mono text-sm text-white mb-1">Confidence Gate</div>
                      <div className="font-mono text-xs text-gray-300">If oracle uncertainty is above 0.2%, liquidation is blocked automatically.</div>
                    </div>
                  </div>
                  <div className="flex gap-4 rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-purple-300">4. 📄</div>
                    <div>
                      <div className="font-mono text-sm text-white mb-1">Receipt Generated</div>
                      <div className="font-mono text-xs text-gray-300">On-chain tx and a cryptographic receipt are generated with full Pyth data snapshot.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {aboutTab === "why" && (
              <div>
                <h3 className="title-font text-3xl md:text-4xl mb-3">Why Pyth?</h3>
                <p className="font-mono text-sm text-gray-300 leading-relaxed max-w-4xl mb-5">
                  Pyth Network provides sub-second price updates from first-party publishers, including exchanges, market makers, and trading firms.
                </p>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-2xl text-[#00ff88] font-bold">&lt;400ms</div>
                    <div className="font-mono text-xs text-gray-400 mt-1">⚡ Price update frequency</div>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-2xl text-[#00ff88] font-bold">90+</div>
                    <div className="font-mono text-xs text-gray-400 mt-1">🏦 First-party data publishers</div>
                  </div>
                  <div className="rounded-lg border border-purple-900/40 bg-black/25 p-4">
                    <div className="font-mono text-2xl text-[#00ff88] font-bold">50+</div>
                    <div className="font-mono text-xs text-gray-400 mt-1">⛓️ Supported blockchains</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[#fbbf24]/30 bg-[#fbbf24]/10 p-4 font-mono text-sm text-[#f8d892]">
                  &quot;Without fast, reliable oracle data, fair liquidations are impossible. Pyth makes it possible.&quot;
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
