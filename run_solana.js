const Module = require('module');
const WebSocket = require("ws");
const mockClient = class {
  constructor() {
    this.webSocketFactory = (url, opts) => new (WebSocket.default || WebSocket)(url, opts);
  }
  connect() {} on() {} once() {} off() {} emit() {} send() {} call() { return Promise.resolve({}); } _connect() {}
};
const mock = mockClient; mock.Client = mockClient; mock.CommonClient = mockClient; mock.Server = class {}; mock.default = mock;

const originalRequire = Module.prototype.require;
Module.prototype.require = function(arg) {
  if (arg.includes('rpc-websockets')) return mock;
  return originalRequire.apply(this, arguments);
};

require('ts-node').register({ compilerOptions: { module: 'commonjs' } });
require('./lib/solana.ts');
