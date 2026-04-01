// --- ULTIMATE DEPENDENCY PATCH ---
try {
  const rpcPath = require.resolve("rpc-websockets");
  const wsPath = require.resolve("ws");
  const WebSocket = require(wsPath);
  
  // Create a minimal working mock for rpc-websockets
const mockClient = class {
    webSocketFactory: any;
    constructor() {
      this.webSocketFactory = (url, opts) => {
        const WS = WebSocket.default || WebSocket;
        return new WS(url, opts);
      };
      this.address = "";
      this.connected = false;
    }
    connect() { this.connected = true; }
    on() {}
    once() {}
    off() {}
    emit() {}
    send() {}
    call() { return Promise.resolve({}); }
    _connect() {}
  };

  // Inject into cache
  require.cache[rpcPath] = {
    id: rpcPath,
    filename: rpcPath,
    loaded: true,
    exports: {
      Client: mockClient,
      CommonClient: mockClient,
      Server: class {}
    }
  };
  console.log("✓ Intercepted rpc-websockets in require.cache");
} catch (e) {
  console.warn("Pre-patch failed, continuing with luck...");
}
// ---------------------------------

// @ts-nocheck
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
import fs from "fs";

const BTC_USD_FEED = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

async function main() {
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
  );

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idl = JSON.parse(fs.readFileSync("./target/idl/liquidation_lens.json", "utf-8"));
  const program = new Program(idl, provider);

  const pythReceiver = new PythSolanaReceiver({ connection, wallet });
  const hermes = new HermesClient("https://hermes.pyth.network");
  
  console.log("Fetching price updates from Hermes...");
  const updates = await hermes.getLatestPriceUpdates([BTC_USD_FEED], { encoding: "base64" });
  const priceUpdateData = updates.binary.data;
  console.log(`✓ Got ${priceUpdateData.length} real VAA(s) from Hermes`);

  const txBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
  await txBuilder.addPostPriceUpdates(priceUpdateData);
  await txBuilder.addPriceConsumerInstructions(async (getPriceAccount) => {
    const priceUpdateAccount = getPriceAccount(BTC_USD_FEED);
    return [{
      instruction: await program.methods
        .triggerLiquidation(BTC_USD_FEED, new BN(0)) // 0 min price for demo
        .accounts({ priceUpdate: priceUpdateAccount, user: keypair.publicKey })
        .instruction(),
      signers: [],
    }];
  });

  console.log("Building transaction...");
  const builtTxs = await txBuilder.buildVersionedTransactions({ computeUnitPriceMicroLamports: 100000 });
  
  for (const { tx, signers } of builtTxs) {
    tx.sign([keypair, ...signers]);
    console.log("Sending transaction via REST (bypass WS)...");
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    console.log(`✓ Sent signature: ${signature}`);
    console.log("Waiting for confirmation (polling)...");
    
    let confirmed = false;
    for (let i = 0; i < 30; i++) {
      const { value } = await connection.getSignatureStatus(signature);
      if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
        confirmed = true;
        break;
      }
      if (value?.err) throw new Error(`Tx failed: ${JSON.stringify(value.err)}`);
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!confirmed) throw new Error("Confirmation timeout");
    
    console.log(`\n🚀 LIQUIDATION SUCCESSFUL!`);
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  }
}

main().catch(console.error);
