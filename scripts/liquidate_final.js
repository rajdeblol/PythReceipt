const Module = require('module');
const path = require('path');
const fs = require("fs");

// --- ULTIMATE GLOBAL INTERCEPTION (v4) ---
const WebSocket = require("ws");
const mockClient = class {
  constructor() {
    this.webSocketFactory = (url, opts) => {
      const WS = WebSocket.default || WebSocket;
      return new WS(url, opts);
    };
  }
  connect() {}
  on() {}
  once() {}
  off() {}
  emit() {}
  send() {}
  call() { return Promise.resolve({}); }
  _connect() {}
};

// Make the mock itself the constructor
const mock = mockClient; 
mock.Client = mockClient;
mock.CommonClient = mockClient;
mock.Server = class {};
mock.default = mock; // Circular for .default.default etc

const originalRequire = Module.prototype.require;
Module.prototype.require = function(arg) {
  if (arg.includes('rpc-websockets')) {
    return mock;
  }
  return originalRequire.apply(this, arguments);
};
console.log("✓ Global rpc-websockets interception active (v4)");
// ------------------------------------

const { Connection, Keypair } = require("@solana/web3.js");
const { AnchorProvider, Program, Wallet, BN } = require("@coral-xyz/anchor");
const { PythSolanaReceiver } = require("@pythnetwork/pyth-solana-receiver");
const { HermesClient } = require("@pythnetwork/hermes-client");

const BTC_USD_FEED = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

async function main() {
  const keypairPath = path.join(process.env.HOME, ".config/solana/id.json");
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idlPath = path.resolve(__dirname, "../target/idl/liquidation_lens.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const pythReceiver = new PythSolanaReceiver({ connection, wallet });
  const hermes = new HermesClient("https://hermes.pyth.network");
  
  console.log("Fetching price updates from Hermes...");
  try {
    const updates = await hermes.getLatestPriceUpdates([BTC_USD_FEED], { encoding: "base64" });
    const priceUpdateData = updates.binary.data;
    console.log(`✓ Got ${priceUpdateData.length} real VAA(s) from Hermes`);

    const txBuilder = pythReceiver.newTransactionBuilder({ closeUpdateAccounts: false });
    await txBuilder.addPostPriceUpdates(priceUpdateData);
    await txBuilder.addPriceConsumerInstructions(async (getPriceAccount) => {
      const priceUpdateAccount = getPriceAccount(BTC_USD_FEED);
      return [{
        instruction: await program.methods
          .triggerLiquidation(BTC_USD_FEED, new BN(0))
          .accounts({ priceUpdate: priceUpdateAccount, user: keypair.publicKey })
          .instruction(),
        signers: [],
      }];
    });

    console.log("Building transaction...");
    const builtTxs = await txBuilder.buildVersionedTransactions({ computeUnitPriceMicroLamports: 100000 });
    
    for (const { tx, signers } of builtTxs) {
      tx.sign([keypair, ...signers]);
      console.log("Sending transaction via REST...");
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      
      console.log(`✓ Signature: ${signature}`);
      console.log("Waiting for confirmation...");
      
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        const { value } = await connection.getSignatureStatus(signature);
        if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
          confirmed = true;
          break;
        }
        if (value?.err) throw new Error(`Tx failed: ${JSON.stringify(value.err)}`);
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 2000));
      }
      
      if (!confirmed) throw new Error("Confirmation timeout");
      
      console.log(`\n🚀 LIQUIDATION SUCCESSFUL!`);
      console.log(`Signature: ${signature}`);
      console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    }
  } catch (err) {
    console.error("Execution failed:", err);
  }
}

main().catch(console.error);
