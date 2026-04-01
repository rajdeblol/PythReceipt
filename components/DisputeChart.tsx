"use client"
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import { OHLCBar } from "@/lib/pyth"

interface Props { bars: OHLCBar[]; liquidationTime: number; liquidationPrice: number }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-[#0f0f0f] border border-purple-900/40 p-3 font-mono text-xs">
      <div className="text-gray-400 mb-1">{new Date(label * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="text-white">C: ${d.close?.toFixed(2)}</div>
      <div className="text-green-400">H: ${d.high?.toFixed(2)}</div>
      <div className="text-red-400">L: ${d.low?.toFixed(2)}</div>
    </div>
  )
}

export function DisputeChart({ bars, liquidationTime, liquidationPrice }: Props) {
  if (!bars.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 font-mono text-xs">NO BENCHMARK DATA</div>
  )
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="time" tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} tick={{ fill: "#4b5563", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={["auto", "auto"]} tick={{ fill: "#4b5563", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="high" stroke="rgba(0,255,136,0.2)" fill="transparent" strokeWidth={1} dot={false} activeDot={false} />
        <Area type="monotone" dataKey="close" stroke="#7c3aed" fill="url(#priceGrad)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#7c3aed" }} />
        <Area type="monotone" dataKey="low" stroke="rgba(239,68,68,0.2)" fill="transparent" strokeWidth={1} dot={false} activeDot={false} />
        <ReferenceLine x={liquidationTime} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "LIQ", position: "top", fill: "#fbbf24", fontSize: 9, fontFamily: "var(--font-mono)" }} />
        <ReferenceLine y={liquidationPrice} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth={1} label={{ value: `$${liquidationPrice.toFixed(2)}`, position: "right", fill: "#fbbf24", fontSize: 9, fontFamily: "var(--font-mono)" }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
