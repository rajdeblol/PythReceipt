"use client"
import { useEffect, useState } from "react"

interface Props { score: number; verdict: string }

export function FairnessScore({ score, verdict }: Props) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0
      const step = score / 40
      const interval = setInterval(() => {
        current += step
        if (current >= score) { setDisplayed(score); clearInterval(interval) }
        else setDisplayed(Math.floor(current))
      }, 20)
      return () => clearInterval(interval)
    }, 800)
    return () => clearTimeout(timer)
  }, [score])
  const color = score >= 80
    ? { bar: "#00ff88", text: "text-[#00ff88]", label: "FAIR" }
    : score >= 50
    ? { bar: "#fbbf24", text: "text-[#fbbf24]", label: "BORDERLINE" }
    : { bar: "#ef4444", text: "text-[#ef4444]", label: "DISPUTED" }
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-xs text-gray-500 mb-1">FAIRNESS SCORE</div>
          <div className={`font-mono text-4xl font-bold tabular-nums ${color.text}`}>
            {displayed}<span className="text-lg text-gray-600">/100</span>
          </div>
        </div>
        <div className={`font-mono text-xs px-3 py-1.5 border ${score >= 80 ? "border-[#00ff88]/30 text-[#00ff88] bg-[#00ff88]/10" : score >= 50 ? "border-[#fbbf24]/30 text-[#fbbf24] bg-[#fbbf24]/10" : "border-[#ef4444]/30 text-[#ef4444] bg-[#ef4444]/10"}`}>
          {color.label}
        </div>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full score-bar-fill" style={{ "--score-width": `${score}%`, backgroundColor: color.bar } as React.CSSProperties} />
      </div>
      <div className="font-mono text-xs text-gray-500">
        {verdict === "Fair" && "Price was within oracle range at liquidation time"}
        {verdict === "Borderline" && "Price was within 1% of oracle range"}
        {verdict === "Questionable" && "Price deviated from oracle range by 1–3%"}
        {verdict === "Potentially Unfair" && "Significant deviation from oracle price detected"}
        {verdict === "No Data" && "Benchmark data unavailable for this timeframe"}
      </div>
    </div>
  )
}
