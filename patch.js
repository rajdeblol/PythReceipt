// Absolute path to the rpc-websockets that @solana/web3.js uses
const rpcPath = require.resolve("@solana/web3.js/node_modules/rpc-websockets");
const rpcWebsockets = require(rpcPath);
const WebSocket = require("ws");

// Patch missing CommonClient
if (rpcWebsockets.Client && !rpcWebsockets.CommonClient) {
  rpcWebsockets.CommonClient = rpcWebsockets.Client;
}

// Monkey-patch Client to use a working WebSocket factory in Node v25
const OldClient = rpcWebsockets.Client;
rpcWebsockets.Client = class extends OldClient {
  constructor(address, options) {
    super(address, options);
    this.webSocketFactory = (url, opts) => {
      const WS = WebSocket.default || WebSocket;
      return new WS(url, opts);
    };
  }
};

// Also patch CommonClient just in case @solana/web3.js uses it directly
rpcWebsockets.CommonClient = rpcWebsockets.Client;

console.log("✓ Applied global rpc-websockets monkey-patch at: " + rpcPath);
