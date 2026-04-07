"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { SOLANA_EXPLORER_TX } from "@/lib/constants"
import { LiquidationReceipt } from "@/lib/solana"

interface FailedReceipt {
  txSignature: string
  market: string
  timestampIso: string
  price: number
  confidence: number
  confidencePct: number
  bestBid: number | null
  bestAsk: number | null
  reason: string
}

export default function ReceiptPage() {
  const { txSig } = useParams<{ txSig: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<LiquidationReceipt | null>(null)
  const [failedReceipt, setFailedReceipt] = useState<FailedReceipt | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setLoading(true)
        setError(null)

        if (!txSig) throw new Error("Missing transaction signature")

        // Fetch immutable receipt from tx signature
        const res = await fetch(`/api/receipt?sig=${txSig}`)
        if (!res.ok) {
          const err = await res.json()
          const errMsg = err.error || "Failed to fetch receipt API"

          if (errMsg.includes("3012")) {
            const disputeRes = await fetch("/api/dispute/check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ signature: txSig }),
            })
            if (!disputeRes.ok) {
              if (!mounted) return
              setFailedReceipt({
                txSignature: txSig,
                market: "UNKNOWN",
                timestampIso: new Date().toISOString(),
                price: 0,
                confidence: 0,
                confidencePct: 0,
                bestBid: null,
                bestAsk: null,
                reason: "On-chain execution failed (Custom 3012).",
              })
              return
            }
            const dispute = await disputeRes.json()
            if (!mounted) return
            setFailedReceipt({
              txSignature: txSig,
              market: dispute.market || "UNKNOWN",
              timestampIso: dispute.oracle?.timestampIso || new Date().toISOString(),
              price: Number(dispute.oracle?.price || 0),
              confidence: Number(dispute.oracle?.confidence || 0),
              confidencePct: Number(dispute.oracle?.confidencePct || 0),
              bestBid: dispute.oracle?.bestBid ?? null,
              bestAsk: dispute.oracle?.bestAsk ?? null,
              reason: "On-chain execution failed (Custom 3012), but oracle snapshot at tx time is preserved below.",
            })
            return
          }
          throw new Error(errMsg)
        }
        const data: LiquidationReceipt = await res.json()
        
        if (!mounted) return
        setReceipt(data)
      } catch (e: any) {
        if (!mounted) return
        console.error("[PythReceipt] receipt error", e)
        setError(e?.message ?? "Failed to load receipt")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [txSig])

  return (
    <main className="min-h-screen grid-bg scan-lines">
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="font-mono text-xs text-purple-300 underline">← Back</Link>
        <h1 className="title-font text-4xl mt-4">Liquidation Receipt</h1>
        <p className="font-mono text-sm text-gray-400">Cryptographic proof anchored on Solana devnet</p>

        <div className="card glass mt-8 p-6 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="absolute -inset-[1px] bg-gradient-to-br from-purple-500/30 via-transparent to-emerald-500/30 rounded-[inherit] -z-10" />
          
          {loading && <div className="font-mono text-sm text-gray-400">Loading receipt...</div>}
          {error && (
            <div className="space-y-3">
              <div className="font-mono text-sm text-red-400">{error}</div>
              <Link href="/" className="inline-flex px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 rounded-md text-xs font-mono">
                Back to Trigger Page
              </Link>
            </div>
          )}

          {receipt && (
            <div className="space-y-4 font-mono text-sm">
              <div>
                <div className="text-gray-500 text-xs">Transaction Signature</div>
                <div className="break-all">{txSig}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">User</div>
                <div className="break-all">{receipt.user}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Liquidation Price</div>
                <div className="text-[#00ff88] text-xl">${receipt.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Oracle Feed ID</div>
                <div className="break-all">{receipt.priceId} <span className="text-gray-400">({receipt.assetLabel})</span></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-6 items-start">
                <div className="py-2">
                  <div className="text-gray-500 text-xs uppercase tracking-wider">Fairness Score</div>
                  <div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${receipt.fairnessScore}%`,
                            background: receipt.fairnessLabel === "FAIR"
                              ? "#1D9E75"
                              : receipt.fairnessLabel === "BORDERLINE"
                              ? "#EF9F27"
                              : "#E24B4A"
                          }}
                        />
                      </div>
                      <span className="font-bold text-lg">{receipt.fairnessScore}/100</span>
                    </div>
                    <span className="text-xs mt-1" style={{
                      color: receipt.fairnessLabel === "FAIR" ? "#1D9E75"
                        : receipt.fairnessLabel === "BORDERLINE" ? "#EF9F27" : "#E24B4A"
                    }}>{receipt.fairnessLabel}</span>
                  </div>
                </div>
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Confidence Interval</div>
                    <div className="text-[#00ff88] font-mono text-xl">{receipt.confDisplay}</div>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded font-mono text-[11px] text-gray-400">
                    Pyth confidence intervals indicate the precision of the price feed. A narrow interval relative to price suggests high market certainty.
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-gray-500 text-xs uppercase tracking-widest font-bold">Pyth Pro — High Fidelity Status</div>
                  <div className={`px-2 py-1 rounded text-[10px] font-bold ${
                    receipt.oracleStatus?.includes("VERIFIED") 
                      ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}>
                    {receipt.oracleStatus}
                  </div>
                </div>

                {receipt.pythData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Live Price</div>
                      <div className="text-xs font-mono text-white">${receipt.pythData.livePrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Confidence %</div>
                      <div className="text-xs font-mono text-white">{receipt.pythData.confidencePct}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Spread</div>
                      <div className="text-xs font-mono text-white">{receipt.pythData.spread}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Verified</div>
                      <div className="text-xs font-mono text-green-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Lazer Stream
                      </div>
                    </div>
                  </div>
                )}
                
                {receipt.pythData && (
                  <div className="mt-4 font-mono text-[9px] text-gray-500 flex flex-col gap-1 border-t border-white/5 pt-3">
                    <div className="flex justify-between items-center">
                      <span>{receipt.pythData.feedId}</span>
                      <span>Verified at: {receipt.timestampDisplay}</span>
                    </div>
                    <div className="text-[8px] opacity-50 uppercase tracking-tighter">Reference ISO: {receipt.pythData.timestamp}</div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-white/5 flex flex-wrap gap-4 items-center">
                <a
                  href={`${SOLANA_EXPLORER_TX}/${txSig}?cluster=devnet`}
                  className="text-purple-300 underline text-xs"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solana Explorer
                </a>
                <a
                  href={`https://solscan.io/tx/${txSig}?cluster=devnet`}
                  className="text-emerald-300 underline text-xs"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solscan
                </a>
              </div>
            </div>
          )}

          {failedReceipt && !receipt && (
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-500 text-xs">Attempt Receipt ID</div>
                  <div className="break-all">AR-{txSig.slice(0, 8)}...{txSig.slice(-8)}</div>
                </div>
                <span className="px-2 py-1 text-[11px] font-mono border rounded border-red-400/40 bg-red-400/10 text-red-300">FAILED</span>
              </div>

              <div className="text-red-300 text-xs">{failedReceipt.reason}</div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500 text-xs">Market</div>
                  <div>{failedReceipt.market}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Timestamp</div>
                  <div>{new Date(failedReceipt.timestampIso).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Oracle Price at Tx Time</div>
                  <div className="text-[#00ff88] text-xl">${failedReceipt.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Confidence</div>
                  <div>± ${failedReceipt.confidence.toLocaleString(undefined, { maximumFractionDigits: 6 })} ({failedReceipt.confidencePct.toFixed(4)}%)</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Best Bid</div>
                  <div>{failedReceipt.bestBid !== null ? `$${failedReceipt.bestBid.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "--"}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Best Ask</div>
                  <div>{failedReceipt.bestAsk !== null ? `$${failedReceipt.bestAsk.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "--"}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-wrap gap-4 items-center">
                <a
                  href={`${SOLANA_EXPLORER_TX}/${txSig}?cluster=devnet`}
                  className="text-purple-300 underline text-xs"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solana Explorer
                </a>
                <a
                  href={`https://solscan.io/tx/${txSig}?cluster=devnet`}
                  className="text-emerald-300 underline text-xs"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solscan
                </a>
                <Link href="/" className="inline-flex px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 rounded-md text-xs font-mono">
                  Trigger New Liquidation
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
