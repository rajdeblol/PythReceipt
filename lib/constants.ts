export const APP_NAME = "PythReceipt"
export const APP_TAGLINE = "Cryptographic proof for every liquidation."
export const PROGRAM_ID = "4JbvDU6ejse5QLhjDUrdLVjgfGGRick1byDtsJFWErxb"
export const PYTH_RECEIVER_PROGRAM_ID = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
export const PRICE_FEEDS = {
  "ETH/USD": {
    id: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    symbol: "Crypto.ETH/USD",
    label: "ETH/USD",
  },
  "SOL/USD": {
    id: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    symbol: "Crypto.SOL/USD",
    label: "SOL/USD",
  },
  "BTC/USD": {
    id: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    symbol: "Crypto.BTC/USD",
    label: "BTC/USD",
  },
}
export const SOLANA_DEVNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com"
export const SOLANA_EXPLORER_TX = "https://explorer.solana.com/tx"
export const SOLSCAN_TX = "https://solscan.io/tx"
export const PYTH_BENCHMARKS_BASE = "https://benchmarks.pyth.network/v1/shims/tradingview"
export const HERMES_BASE = "https://hermes.pyth.network"
