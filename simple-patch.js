const Module = require('module');
const mock = class { constructor() {} };
mock.Client = mock; mock.CommonClient = mock; mock.Server = class {}; mock.default = mock;

const originalRequire = Module.prototype.require;
Module.prototype.require = function(arg) {
  if (arg.includes('rpc-websockets')) return mock;
  return originalRequire.apply(this, arguments);
};
