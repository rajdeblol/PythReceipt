import { Connection, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js"
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor"
import { PROGRAM_ID, SOLANA_DEVNET_RPC } from "./constants"

import idl from "@/lib/idl.json"

export function getConnection() {
  return new Connection(SOLANA_DEVNET_RPC, "confirmed")
}

function isRpc429(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "")
  return msg.includes("429") || msg.toLowerCase().includes("too many requests")
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getProgram(wallet: any) {
  const connection = getConnection()
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" })
  return new Program(idl as Idl, provider)
}

export function getLiquidationRecordPDA(userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("liquidation"), userPubkey.toBuffer()],
    new PublicKey(PROGRAM_ID)
  )
}

export async function triggerLiquidation(
  program: Program, wallet: PublicKey, priceUpdateAccount: PublicKey,
  priceIdHex: string, minPriceUsd: number
): Promise<string> {
  const minPriceRaw = new BN(Math.floor(minPriceUsd * 1e8))
  const [liquidationRecord] = getLiquidationRecordPDA(wallet)
  const connection = program.provider.connection as Connection
  const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 300000 })

  await ensureLiquidationRecord(program, wallet, liquidationRecord)

  const tx = await (program.methods as any)
    .triggerLiquidation(priceIdHex, minPriceRaw)
    .accounts({
      user: wallet,
      priceUpdate: priceUpdateAccount,
      liquidationRecord,
      systemProgram: SystemProgram.programId
    })
    .preInstructions([computePriceIx])
    .transaction()

  tx.feePayer = wallet
  const latest = await connection.getLatestBlockhash("confirmed")
  tx.recentBlockhash = latest.blockhash

  let signature = ""
  try {
    signature = await (program.provider.wallet as any).sendTransaction(tx, connection, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    })
    console.log("[PythReceipt] triggerLiquidation sent:", signature)
    waitForConfirmed(connection, signature, 120000)
      .then((confirmed) => {
        if (confirmed) console.log("[PythReceipt] triggerLiquidation confirmed in background:", signature)
        else console.warn("[PythReceipt] confirmation timeout, keep checking explorer:", signature)
      })
      .catch((confirmErr) => {
        console.warn("[PythReceipt] background confirmation issue:", confirmErr)
      })
    return signature
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error("[PythReceipt] triggerLiquidation error:", msg)
    if (isRpc429(err)) {
      if (signature) return signature
      throw new Error("RPC rate-limited (429). Please retry in a few seconds.")
    }
    if (signature && (msg.includes("not confirmed") || msg.includes("timed out"))) {
      return signature
    }
    throw err
  }
}

async function waitForConfirmed(connection: Connection, signature: string, timeoutMs: number) {
  const started = Date.now()
  let backoffMs = 1500
  while (Date.now() - started < timeoutMs) {
    let status: Awaited<ReturnType<typeof connection.getSignatureStatuses>>["value"][number] = null
    try {
      const statusResp = await connection.getSignatureStatuses([signature])
      status = statusResp.value[0]
    } catch (err) {
      if (isRpc429(err)) {
        await sleep(backoffMs)
        backoffMs = Math.min(backoffMs * 2, 12000)
        continue
      }
      throw err
    }

    if (status?.err) {
      throw new Error(`On-chain error: ${JSON.stringify(status.err)}`)
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true
    }

    await sleep(backoffMs)
    backoffMs = Math.min(backoffMs + 350, 5000)
  }

  return false
}

async function ensureLiquidationRecord(program: Program, wallet: PublicKey, liquidationRecord: PublicKey) {
  const connection = program.provider.connection as Connection
  const existing = await connection.getAccountInfo(liquidationRecord, "confirmed")
  if (existing) {
    return
  }

  const methods: any = program.methods as any
  if (!methods?.initialize) {
    return
  }

  try {
    console.log("[PythReceipt] Initializing liquidation record PDA...")
    const tx = await methods
      .initialize()
      .accounts({
        user: wallet,
        liquidationRecord,
        systemProgram: SystemProgram.programId,
      })
      .transaction()

    tx.feePayer = wallet
    const latest = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = latest.blockhash

    const sig = await (program.provider.wallet as any).sendTransaction(tx, connection, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    })
    await waitForConfirmed(connection, sig, 120000)
    console.log("[PythReceipt] liquidation record initialized:", sig)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    if (
      msg.includes("already in use") ||
      msg.includes("already initialized") ||
      msg.includes("custom program error: 0x0")
    ) {
      return
    }
    throw e
  }
}

export interface LiquidationRecord {
  user: PublicKey; priceUsed: number; exponent: number; timestamp: number; priceId: string
}

export async function fetchLiquidationRecord(program: Program, userPubkey: PublicKey): Promise<LiquidationRecord> {
  const [pda] = getLiquidationRecordPDA(userPubkey)
  const record = await (program.account as any).liquidationRecord.fetch(pda)
  console.log("[PythReceipt] liquidationRecord", record)
  return {
    user: record.user,
    priceUsed: record.priceUsed.toNumber(),
    exponent: record.exponent,
    timestamp: record.timestamp.toNumber(),
    priceId: record.priceId,
  }
}
