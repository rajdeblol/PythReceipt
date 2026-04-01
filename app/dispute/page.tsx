"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { SOLSCAN_TX } from "@/lib/constants"
import { LiquidationReceipt } from "@/lib/solana"

export default function DisputePage() {
  const searchParams = useSearchParams()
  const sig = searchParams.get("sig")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<LiquidationReceipt | null>(null)
  const [disputeStatus, setDisputeStatus] = useState<"IDLE" | "FILING" | "FILED">("IDLE")

  useEffect(() => {
    if (!sig) {
      setError("No transaction signature provided")
      setLoading(false)
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/receipt?sig=${sig}`)
        if (!res.ok) throw new Error("Failed to fetch receipt")
        const data = await res.json()
        setReceipt(data)
      } catch (e: any) {
        setError(e?.message ?? "Failed to load dispute data")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sig])

  const onFileDispute = () => {
    setDisputeStatus("FILING")
    // Simulated dispute filing
    setTimeout(() => {
      setDisputeStatus("FILED")
    }, 2000)
  }

  return (
    <main className="min-h-screen grid-bg scan-lines">
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="font-mono text-xs text-purple-300 underline">← Back to Dashboard</Link>
        <h1 className="title-font text-4xl mt-4">Dispute Center</h1>
        <p className="font-mono text-sm text-gray-400">Review and contest liquidations with high oracle uncertainty.</p>

        <div className="card glass mt-8 p-8 relative overflow-hidden group">
          {loading && <div className="font-mono text-sm text-gray-400">Loading audit trail...</div>}
          {error && <div className="font-mono text-sm text-red-100 bg-red-500/20 p-4 border border-red-500/30 rounded-lg">{error}</div>}

          {receipt && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-white/10">
                <div>
                  <div className="text-gray-500 text-[10px] uppercase tracking-widest font-bold">Audit Target</div>
                  <div className="font-mono text-sm select-all">{sig}</div>
                </div>
                <div className={`px-3 py-1 rounded text-xs font-bold border ${
                  receipt.fairnessLabel === "FAIR" 
                    ? "bg-green-500/10 text-green-400 border-green-500/20" 
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}>
                  {receipt.fairnessLabel} STATUS
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <div className="text-gray-500 text-[10px] uppercase font-bold">Execution Price</div>
                    <div className="text-2xl font-bold text-white">${receipt.price.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-[10px] uppercase font-bold">Confidence Gap</div>
                    <div className="text-xl font-mono text-red-400">±{receipt.confDisplay}</div>
                    <div className="text-[10px] text-gray-500 mt-1 uppercase italic tracking-tighter">High uncertainty detected at time of trigger</div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-300">Pyth Pro Snapshot</div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-gray-500">Asset</span>
                    <span>{receipt.assetLabel}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono border-t border-white/5 pt-3 mt-3">
                    <span className="text-gray-500">Confidence Gate</span>
                    <span className={receipt.confidenceGateStatus === "AUTO_PASS" ? "text-emerald-300" : "text-[#fbbf24]"}>
                      {receipt.confidenceGateStatus === "AUTO_PASS" ? "AUTO_PASS" : "WARN_OVERRIDE"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-gray-500">Gate Confidence %</span>
                    <span>{receipt.gateConfidencePct?.toFixed(4)}%</span>
                  </div>
                  <div className={`text-[10px] text-center p-2 rounded mt-3 uppercase font-bold ${
                    receipt.oracleStatus?.includes("VERIFIED") 
                      ? "bg-green-500/10 text-green-500" 
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {receipt.oracleStatus || "UNCERTAIN STATUS"}
                  </div>
                </div>
              </div>

              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
                <h4 className="text-red-300 font-bold mb-2">File Official Dispute</h4>
                <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                  Liquidations with a fairness score below 80 or oracle uncertainty exceeding 0.2% are eligible for full reimbursement via the Pyth Safety Fund (Simulated). Filing will anchor your dispute to the Solana blockchain.
                </p>

                {disputeStatus === "IDLE" && (
                  <button 
                    onClick={onFileDispute}
                    className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-300 font-bold text-sm transition-all shadow-lg shadow-red-500/10"
                  >
                    Anchoring Official Dispute
                  </button>
                )}

                {disputeStatus === "FILING" && (
                  <button disabled className="w-full py-3 bg-white/5 border border-white/10 rounded-lg text-gray-400 font-bold text-sm flex items-center justify-center gap-3">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Committing to Solana...
                  </button>
                )}

                {disputeStatus === "FILED" && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                    <div className="text-emerald-400 font-bold text-sm mb-1">Dispute Filed Successfully!</div>
                    <div className="text-xs text-gray-400 font-mono">Status: Pending Verification</div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-center">
                <a
                  href={`${SOLSCAN_TX}/${sig}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-gray-500 underline hover:text-purple-300"
                >
                  View original transaction on Solscan
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
