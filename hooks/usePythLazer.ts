"use client"

import { useState, useEffect, useRef } from "react"

const WS_URL = "wss://pyth-lazer-0.dourolabs.app/v1/stream"
const API_KEY = process.env.NEXT_PUBLIC_PYTH_API_KEY

export interface LazerPrice {
  price: number
  confidence: number
  bestBid: number
  bestAsk: number
  feedId: number
}

// Feed mapping based on user snippet
const FEED_ID_MAP: Record<number, string> = {
  1: "BTC/USD",
  2: "ETH/USD",
  3: "SOL/USD"
}

export function usePythLazer(activeFeedId?: number) {
  const [prices, setPrices] = useState<Record<string, LazerPrice>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const subscribedIds = useRef<Set<number>>(new Set())

  const subscribe = (ids: number[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const newIds = ids.filter(id => !subscribedIds.current.has(id))
    if (newIds.length === 0) return

    console.log("[PythLazer] Subscribing to new IDs:", newIds)
    wsRef.current.send(JSON.stringify({
      type: "subscribe",
      subscriptionId: Date.now(), // Unique sub ID
      priceFeedIds: newIds,
      properties: ["price", "bestBidPrice", "bestAskPrice", "confidence"],
      channel: "real_time"
    }))
    newIds.forEach(id => subscribedIds.current.add(id))
  }

  useEffect(() => {
    if (!API_KEY) {
      console.warn("Pyth Lazer API Key not found")
      return
    }

    const ws = new WebSocket(`${WS_URL}?authorization=Bearer ${API_KEY}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[PythLazer] WebSocket connected")
      subscribe([1, 2, 3]) // Default core assets
      if (activeFeedId) subscribe([activeFeedId])
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Log raw message as requested for debugging
        console.log("[PythLazer] Raw message received:", data)

        if (data.type === "json_price_update" || data.type === "price_update") {
          const val = data.value || data
          const { priceFeedId, price, confidence, bestBidPrice, bestAskPrice } = val
          const label = FEED_ID_MAP[priceFeedId]

          if (label) {
            setPrices(prev => ({
              ...prev,
              [label]: {
                price: Number(price),
                // Confidence comes in micro-units (10^8), scaling back to decimal
                confidence: Number(confidence) / 1e8,
                bestBid: bestBidPrice ? Number(bestBidPrice) : 0,
                bestAsk: bestAskPrice ? Number(bestAskPrice) : 0,
                feedId: priceFeedId
              }
            }))
          }
        }
      } catch (err) {
        console.error("[PythLazer] Error parsing message", err)
      }
    }

    ws.onerror = (err) => console.error("[PythLazer] WebSocket error", err)
    ws.onclose = () => {
      console.log("[PythLazer] WebSocket disconnected")
      subscribedIds.current.clear()
    }

    return () => {
      ws.close()
    }
  }, []) // Keep connection alive

  // Handle dynamic subscription
  useEffect(() => {
    if (activeFeedId) {
      subscribe([activeFeedId])
    }
  }, [activeFeedId])

  return prices
}
