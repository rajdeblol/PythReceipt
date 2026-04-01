class Base {
  constructor() {
    this.on = () => {};
    this.once = () => {};
    this.off = () => {};
    this.emit = () => {};
    this.send = () => {};
    this.connect = () => {};
    this._connect = () => {};
  }
  call() { return Promise.resolve({}); }
  notify() {}
  subscribe() { return Promise.resolve({}); }
  unsubscribe() { return Promise.resolve({}); }
}

class Client extends Base {}
class CommonClient extends Base {}
class Server extends Base {}

module.exports = {
  Client,
  CommonClient,
  Server,
  default: Client,
  __esModule: true
};
