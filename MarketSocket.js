const EventEmitter = require('eventemitter3');
const WebSocket = require('ws');
const { getDurationLabel, getDurationValue, randomStr } = require('./util');
const MARKET_URL = 'wss://openmd.shinnytech.com/t/md/front/mobile';

class MarketSocket extends EventEmitter {
  constructor(url = MARKET_URL, options = {}) {
    super();
    if (typeof url === 'object') {
      options = url;
      url = MARKET_URL;
    }
    this.url = url;

    this.ws = null;
    this.queue = [];

    // 自动重连开关
    this.reconnect = true;
    this.reconnectTask = null;
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.reconnectMaxTimes = options.reconnectMaxTimes || 3;
    this.reconnectTimes = 0;

    this.data = {};

    this._init(false);
  }

  // string or object
  send(obj) {
    const objToJson = JSON.stringify(obj)
    if (this.isReady()) {
      this.ws.send(objToJson);
    } else {
      this.queue.push(objToJson);
    }
  }

  isReady() {
    return this.ws.readyState === WebSocket.OPEN
  }

  _init (isReconnection = true) {
    this.ws = new WebSocket(this.url);

    if (isReconnection) {
      this.reconnectTimes += 1;
    }

    this.ws.onmessage = (message) => {
      // eslint-disable-next-line no-eval
      const data = JSON.parse(message.data);
      this.emit('message', data);
      this.ws.send('{"aid":"peek_message"}');
    }

    this.ws.onclose = (event) => {
      this.emit('close', event);
      // 清空 queue
      this.queue = [];
      // 自动重连
      if (this.reconnect) {
        if (this.reconnectMaxTimes <= this.reconnectTimes) {
          clearTimeout(this.reconnectTask);
          this.emit('death', {
            msg: `超过重连次数 ${this.reconnectMaxTimes}`
          });
        }
        else {
          this.reconnectTask = setTimeout(() => {
            if (this.ws.readyState === WebSocket.CLOSED) {
              // 每次重连的时候设置 _this.reconnectUrlIndex
              this._init(true)
              this.emit('reconnect', {
                msg: `发起第 ${this.reconnectTimes} 次重连`
              });
            }
          }, this.reconnectInterval);
        }
      }
    }

    this.ws.onerror = error => {
      this.emit('error', error);
      this.ws.close();
    }

    this.ws.onopen = () => {
      this.emit('open', {
        msg: `建立与 ${this.url} 的连接成功`
      });
      if (this.reconnectTask) {
        clearTimeout(this.reconnectTask)
      }
      while (this.queue.length > 0) {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(this.queue.shift());
        }
        else {
          break;
        }
      }
    }
  }

  close() {
    this.ws.onclose = () => {};
    this.ws.close();
  }

  getKlines({ data, symbol, duration, toArray = true }) {
    if (data.aid === 'rtn_data') {
      let list = data.data;
      for (let i = 0, l = list.length; i < l; i++) {
        let d = list[i];
        if (Object.keys(d).length === 1 && d.klines) {
          for (let symbol in d.klines) {
            let symbolKlineData = d.klines[symbol];
            for (let durationValue in symbolKlineData) {
              let durationKlineData = symbolKlineData[durationValue].data;
              for (let id in durationKlineData) {
                durationKlineData[id].id = Number(id);
                durationKlineData[id].datetime /= 1e6; // 转换成毫秒
              }
              symbolKlineData[getDurationLabel(Number(durationValue))] = symbolKlineData[durationValue];
              delete symbolKlineData[durationValue];
            }
          }
          if (symbol) {
            let klines = d.klines[symbol];
            if (duration) {
              if (typeof duration === Number) {
                duration = getDurationLabel(duration);
              }
              let klinesData = klines[duration];
              if (!klinesData) {
                return null;
              }
              klinesData = klinesData.data;
              if (toArray) {
                return Object.values(klinesData).sort((a, b) => a.id - b.id);
              }
              else {
                return klinesData;
              }
            }
            else {
              return klines;
            }
          }
          else {
            return d.klines;
          }
        }
      }
    }
  }

  getTicks({ data, symbol, toArray = true }) {
    if (data.aid === 'rtn_data') {
      let list = data.data;
      for (let i = 0, l = list.length; i < l; i++) {
        let d = list[i];
        if (Object.keys(d).length === 1 && d.ticks) {
          for (let symbol in d.ticks) {
            let symbolTickData = d.ticks[symbol].data;
            for (let id in symbolTickData) {
              symbolTickData[id].id = Number(id);
              symbolTickData[id].datetime /= 1e6; // 转换成毫秒
            }
          }

          return symbol ? d.ticks[symbol] : d.ticks;
        }
      }
    }
  }

  getQuotes({ data, symbol }) {
    if (data.aid === 'rtn_data') {
      let list = data.data;
      for (let i = 0, l = list.length; i < l; i++) {
        let d = list[i];
        if (Object.keys(d).length === 1 && d.quotes) {
          return symbol ? d.quotes[symbol] : d.quotes;
        }
      }
    }
  }

  /**
   * 使用startDay和dayCount两个参数结合查询, 一次最多只能查10天的数据
   * 使用barCount查询, 一次最多查询10000根K线数据
   * startDay、dayCount和barCount 二者互斥, 如果都存在, 优先使用startDay、dayCount查询
   * @param {Integer} startDay 从哪一天开始查, 负数-n表示从当前时间往前查n天K线数据
   * @param {Integer} dayCount 查多少天的K线数据, 最大值是10, 最小值是1
   * @param {Integer} barCount 查多少根K线数据
   */
  requestKlines({ symbol, duration = '1m', startDay, dayCount, count }) {
    const params = {};
    if (typeof startDay !== 'undefined' && typeof dayCount !== 'undefined') {
      // if (startDay >= 0) {
      //   console.error('Error: startDay合法值必须为负整数');
      //   return;
      // }
      // if (dayCount > 10 || dayCount < 1) {
      //   console.error('Error: dayCount合法值必须为[1, 10]的整数');
      //   return;
      // }
      // params.trading_day_start = startDay * 3600 * 24 * 1e9;
      // params.trading_day_count = dayCount * 3600 * 24 * 1e9;
      params.trading_day_start = new Date(2020, 1, 1).getTime() * 1e6;
      params.trading_day_count = 1 * 3600 * 24 * 1e9;
      // params.trading_day_end = new Date(2020, 3, 28).getTime() * 1e6;
    }
    else if (typeof count !== 'undefined') {
      if (count > 10000 || count < 1) {
        console.error('Error: count合法值必须为[1, 10000]的整数');
        return;
      }
      params.view_width = count;
    }
    this.send({
      aid: 'set_chart',
      chart_id: 'kline_chart_' + randomStr(),
      ins_list: 'SHFE.rb2010,SHFE.ru2010,SHFE.cu2010',
      duration: getDurationValue(duration),
      // left_id: 0,
      // right_id: 0,
      // more_data: true,
      // ...params
      view_width: 20,
      focus_datetime: params.trading_day_start,
      focus_position: 0
    });
    // ins_list: symbols.join(','),
    //   duration,
    //   view_width: 2000,
    //   focus_datetime: startDatetime,
    //   focus_position: 0,
  }

  requestTicks({ symbol, startDay, dayCount, count }) {
    const params = {};
    if (typeof startDay !== 'undefined' && typeof dayCount !== 'undefined') {
      if (startDay >= 0) {
        console.error('Error: startDay合法值必须为负整数');
        return;
      }
      if (dayCount > 10 || dayCount < 1) {
        console.error('Error: dayCount合法值必须为[1, 10]的整数');
        return;
      }
      params.trading_day_start = startDay * 3600 * 24 * 1e9;
      params.trading_day_count = dayCount * 3600 * 24 * 1e9;
    }
    else if (typeof count !== 'undefined') {
      if (count > 10000 || count < 1) {
        console.error('Error: count合法值必须为[1, 10000]的整数');
        return;
      }
      params.view_width = count;
    }
    this.send({
      aid: 'set_chart',
      chart_id: 'chart_tick',
      ins_list: symbol,
      duration: 0,
      ...params
    });
  }

  requestQuotes({ symbol }) {
    this.send({
      aid: 'subscribe_quote',
      ins_list: symbol
    });
  }

}

module.exports = MarketSocket;
