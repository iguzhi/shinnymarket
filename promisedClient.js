const WebSocket = require('ws');
const logger = require('../logger').getLogger('ws');

// const options = Symbol("options");
const uniqueId = Symbol("uniqueId");
const requestQueue = Symbol("requestQueue");
const noticeQueue = Symbol("noticeQueue");

let wsClient;

class PromisedClient {
  constructor(url, onNotice) {
    this.wsClient = null; // Websocket实例
    this.url = url || 'ws://127.0.0.1';
    this.onNotice = onNotice;
    this[uniqueId] = 0; // 请求的id，也是请求的key值（在请求序列里根据id找对应的包）
    this[requestQueue] = {};// 请求序列
    this[noticeQueue] = {};// server的通知序列
  }

  /**
   * 处理请求对应的响应
   */
  onRequest(rsp) {
    this[requestQueue][rsp.id].resolve(rsp.data); // 只返回resolve函数，不reject，可以在外面捕获
    delete this[requestQueue][rsp.id]; // 删除序列id对应数据包
  };

  init(onSocketClose) {
    // await只能接收resolve的值，reject的值需要在外面catch
    return new Promise((resolve, reject) => {
      const client = this.wsClient = new WebSocket(this.url);
      
      // 成功连接上
      client.on('open', () => {
        logger.info("client: client is opened.");
        heartbeat();
        resolve(true);
      });

      // 收到server发来的消息
      client.on('message', (message) => {
        // logger.info('client: received message %s', message);
        const data = parse(message);
        // 如果是我们发送的请求
        if (data.packetType === "response") {
          logger.info('client: received message %s', message);
          this.onRequest(data);
        }
        else { // 如果是server的通知
          this.onNotice(data);
        }
      });

      client.on('error', (err) => {
        logger.error('client: Error', err);
      });

      client.on('ping', heartbeat);

      // 传入onclose事件，以便于server主动断开时触发
      client.on('close', (event) => {
        clearTimeout(client.pingTimeout);
        onSocketClose && onSocketClose(event);
      });

      function heartbeat() {
        // console.log('heartbeat');
        clearTimeout(client.pingTimeout);
      
        // Use `WebSocket#terminate()`, which immediately destroys the connection,
        // instead of `WebSocket#close()`, which waits for the close timer.
        // Delay should be equal to the interval at which your server
        // sends out pings plus a conservative assumption of the latency.
        client.pingTimeout = setTimeout(() => {
          logger.info('ws client terminate');
          client.terminate();
        }, 10000 + 1000);
      }
    });
  }

  send({ data, serviceName }) {
    if (this.wsClient.readyState === WebSocket.OPEN) {
      logger.info('send: ', data, serviceName);
      return new Promise((resolve, reject) => {
        // 构建发送包
        const packet = {
          id: ++this[uniqueId],
          packetType: "request",
          serviceName,
          data
        };
  
        logger.info('send packet: ', packet);
        const packetStr = stringify(packet);
  
        this[requestQueue][packet.id] = {
          id: packet.id,
          packet,
          reject,
          resolve
        };
        this.wsClient.send(packetStr);
      });
    }
  }

  //主动关闭连接，并且重置数据
  close() {
    if (this.wsClient){
      this.wsClient.close();
      this.wsClient = null;
    }
  }
}

function stringify(packet = {}) {
  packet.wsClientTimestamp = Date.now();
  if (packet.data) {
    packet.data.wsClientTimestamp = packet.wsClientTimestamp;
  }
  return JSON.stringify(packet);
}

function parse(str = '{}') {
  return JSON.parse(str);
}

async function initWsClient(url, messageCallback) {
  wsClient = new PromisedClient(url, messageCallback);
  await wsClient.init();
}

function send({ data, serviceName }) {
  return wsClient.send({ data, serviceName });
}

module.exports = {
  initWsClient,
  sendToServer: send
};