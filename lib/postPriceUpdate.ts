import { Connection, PublicKey } from "@solana/web3.js"
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver"
import { SOLANA_DEVNET_RPC } from "./constants"

function isRpc429(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "")
  return msg.includes("429") || msg.toLowerCase().includes("too many requests")
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForAccount(
  connection: Connection,
  account: PublicKey,
  timeoutMs: number = 12000
) {
  const started = Date.now()
  let backoffMs = 900
  while (Date.now() - started < timeoutMs) {
    let info = null
    try {
      info = await connection.getAccountInfo(account, "confirmed")
    } catch (err) {
      if (isRpc429(err)) {
        await sleep(backoffMs)
        backoffMs = Math.min(backoffMs * 2, 9000)
        continue
      }
      throw err
    }
    if (info) return
    await sleep(backoffMs)
    backoffMs = Math.min(backoffMs + 250, 2200)
  }
  console.warn("[PythReceipt] price update account not visible yet, continuing anyway")
}

export async function postPriceUpdate(wallet: any, vaaBase64: string, priceIdHex: string): Promise<PublicKey> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed")
  const pythReceiver = new PythSolanaReceiver({ connection, wallet })
  const transactionBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false })
  const normalizedId = priceIdHex.startsWith("0x") ? priceIdHex : `0x${priceIdHex}`
  console.log("[PythReceipt] postPriceUpdate for ID:", normalizedId, "VAA len:", vaaBase64.length)
  await transactionBuilder.addPostPriceUpdates([vaaBase64])
  await transactionBuilder.addPriceConsumerInstructions(async () => [])
  const transactions = await transactionBuilder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 250000,
  })
  const priceUpdateAccount = transactionBuilder.getPriceUpdateAccount(normalizedId)
  for (const built of transactions) {
    try {
      const sig = await wallet.sendTransaction(built.tx, connection, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      })
      console.log("[PythReceipt] postPriceUpdate tx sent:", sig)
    } catch (e: any) {
      if (isRpc429(e)) {
        console.warn("[PythReceipt] postPriceUpdate rate-limited; tx may still land, continuing...")
        continue
      }
      if (e.message?.includes("already been processed") || e.logs?.some((l: string) => l.includes("already been processed"))) {
        console.log("[PythReceipt] Price update already processed, skipping...")
        continue
      }
      console.error("[PythReceipt] postPriceUpdate error:", e)
      throw e
    }
  }
  await waitForAccount(connection, priceUpdateAccount, 12000)
  console.log("[PythReceipt] priceUpdateAccount", priceUpdateAccount.toBase58())
  return priceUpdateAccount
}
