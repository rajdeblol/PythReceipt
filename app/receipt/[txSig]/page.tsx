"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useWallet } from "@solana/wallet-adapter-react"
import { PublicKey, SystemProgram } from "@solana/web3.js"
import { SOLANA_EXPLORER_TX } from "@/lib/constants"
import { LiquidationReceipt } from "@/lib/solana"
import { getProgram, getLiquidationRecordPDA } from "@/lib/anchor"

export default function ReceiptPage() {
  const { txSig } = useParams<{ txSig: string }>()
  const wallet = useWallet()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<LiquidationReceipt | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setLoading(true)
        setError(null)

        if (!txSig) throw new Error("Missing transaction signature")

        // 1. First ensure account is initialized (if wallet is connected)
        if (wallet.publicKey) {
          const program = getProgram(wallet);
          const [receiptPDA] = getLiquidationRecordPDA(wallet.publicKey);

          try {
            // First try to fetch (Account name is liquidationRecord in our IDL)
            await (program.account as any).liquidationRecord.fetch(receiptPDA);
            console.log("[PythReceipt] account initialized, proceeding to fetch receipt");
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            if (msg.includes('Account does not exist') || msg.includes('3012')) {
              console.warn("[PythReceipt] account 3012 - initializing now...");
              try {
                // Initialize first then we can fetch
                await (program.methods as any).initialize()
                  .accounts({
                    user: wallet.publicKey,
                    liquidationRecord: receiptPDA,
                    systemProgram: SystemProgram.programId
                  })
                  .rpc();
                console.log("[PythReceipt] initialization successful");
              } catch (initErr: any) {
                console.error("[PythReceipt] initialization failed:", initErr);
                throw new Error("Failed to initialize on-chain record: " + (initErr?.message ?? initErr));
              }
            } else {
              console.error("[PythReceipt] fetch account error:", e);
              // continue anyway if it's not a 3012, or re-throw
            }
          }
        }

        // 2. Then fetch receipt data from API
        const res = await fetch(`/api/receipt?sig=${txSig}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || "Failed to fetch receipt API")
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
  }, [txSig, wallet.publicKey])

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
          {error && <div className="font-mono text-sm text-red-400">{error}</div>}

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
        </div>
      </section>
    </main>
  )
}
