import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const RPC = "https://api.devnet.solana.com"

async function main() {
  const walletPath = process.env.WALLET_PATH ?? path.join(os.homedir(), ".config/solana/id.json")
  const sol = Number(process.env.SOL ?? "2")

  const secret = JSON.parse(fs.readFileSync(walletPath, "utf-8")) as number[]
  const kp = Keypair.fromSecretKey(Uint8Array.from(secret))

  const connection = new Connection(RPC, "confirmed")
  const before = await connection.getBalance(kp.publicKey)
  console.log("[PythReceipt] wallet:", kp.publicKey.toBase58())
  console.log("[PythReceipt] balance before:", before / LAMPORTS_PER_SOL)

  const sig = await connection.requestAirdrop(kp.publicKey, Math.floor(sol * LAMPORTS_PER_SOL))
  await connection.confirmTransaction(sig, "confirmed")

  const after = await connection.getBalance(kp.publicKey)
  console.log("[PythReceipt] airdrop tx:", sig)
  console.log("[PythReceipt] balance after:", after / LAMPORTS_PER_SOL)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
