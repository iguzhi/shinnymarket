const EventEmitter = require('eventemitter3');
const WebSocket = require('ws');
const _ = require('lodash');
const { getDurationLabel, getDurationValue, randomStr, datetimeToNano } = require('./util');
const MARKET_URL = 'wss://openmd.shinnytech.com/t/md/front/mobile';

const uniqueId = Symbol("uniqueId");
const requestQueue = Symbol("requestQueue");
const noticeQueue = Symbol("noticeQueue");

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

    this._init(false);
  }

  send (data) {
    const objToJson = JSON.stringify(data);

    if (this.isReady()) {
      this.ws.send(objToJson);
    }
    else {
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
      const list = data.data;
      const rtnDataList = [];
      const charts = list[list.length - 2].charts;
      if (!charts) {
        return rtnDataList;
      }

      const chart = charts[this.klineChartId];

      if (!chart) {
        return rtnDataList;
      }

      const leftId = chart.left_id;
      const rightId = chart.right_id;

      if (!_.isNumber(leftId) || !_.isNumber(rightId)) {
        return rtnDataList;
      }

      loop1: // 幸亏有此语法啊
      for (let i = 0, l = list.length; i < l; i++) {
        let d = list[i];
        if (Object.keys(d).length === 1 && d.klines) {
          for (let symbol in d.klines) {
            let symbolKlineData = d.klines[symbol];
            for (let durationValue in symbolKlineData) {
              let durationKlineData = symbolKlineData[durationValue].data;
              if (!durationKlineData) {
                continue loop1;
              }
              for (let id in durationKlineData) {
                id = Number(id);
                if (id < leftId || id > rightId) {
                  delete durationKlineData[id];
                  continue;
                }
                durationKlineData[id].id = id;
                durationKlineData[id].datetime /= 1e6; // 转换成毫秒
              }
              symbolKlineData[getDurationLabel(Number(durationValue))] = symbolKlineData[durationValue];
              delete symbolKlineData[durationValue];
            }
          }

          let rtnData;
          if (symbol) {
            let klines = d.klines[symbol];
            if (!klines) {
              continue;
            }
            if (duration) {
              if (typeof duration === Number) {
                duration = getDurationLabel(duration);
              }
              let klinesData = klines[duration];
              if (!klinesData) {
                continue;
              }
              klinesData = klinesData.data;
              if (!klinesData) {
                continue;
              }
              if (toArray) {
                rtnData = Object.values(klinesData).sort((a, b) => a.id - b.id);
              }
              else {
                rtnData = klinesData;
              }
            }
            else {
              rtnData = klines;
            }
          }
          else {
            rtnData = d.klines;
          }
          rtnDataList.push(rtnData);
        }
      }
      return rtnDataList;
    }
  }

  getTicks({ data, symbol, toArray = true }) {
    if (data.aid === 'rtn_data') {
      const list = data.data;
      const charts = list[list.length - 2].charts;

      if (!charts) {
        return [];
      }

      const chart = charts[this.tickChartId];

      if (!chart) {
        return [];
      }

      const leftId = chart.left_id;
      const rightId = chart.right_id;

      if (!_.isNumber(leftId) || !_.isNumber(rightId)) {
        return [];
      }

      for (let i = 0, l = list.length; i < l; i++) {
        let d = list[i];
        if (Object.keys(d).length === 1 && d.ticks) {
          for (let symbol in d.ticks) {
            let symbolTickData = d.ticks[symbol].data;
            for (let id in symbolTickData) {
              id = Number(id);
              if (id < leftId || id > rightId) {
                delete symbolTickData[id];
                continue;
              }
              symbolTickData[id].id = id;
              symbolTickData[id].datetime /= 1e6; // 转换成毫秒
            }
          }

          if (symbol) {
            let tickData = d.ticks[symbol];

            if (toArray) {
              return Object.values(tickData).sort((a, b) => a.id - b.id);
            }
            else {
              return tickData;
            }
          }
          else {
            return d.ticks;
          }
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
   * @param {Integer} startDatetime 开始日期
   * @param {Integer} count 一次查多少根K线数据
   */
  requestKlines({ symbol = '', duration = '1m', startDatetime, count = 1998, chartId, multipleSymbols = false }) {
    let symbols = symbol.split(',');

    if (!multipleSymbols && symbols && symbols.length > 1) {
      // 实际上快期接口是支持一次订阅多个kline序列的, 但为了处理方便同时和requestTicks接口保持一致, 故这里默认也只支持单个合约订阅， 可通过multipleSymbols解锁多合约订阅功能
      throw new Error('Kline序列不支持多合约订阅');
    }

    const params = {
      aid: 'set_chart',
      chart_id: chartId || 'kline_chart_' + randomStr(),
      ins_list: symbol,
      duration: getDurationValue(duration),
      view_width: count,
      focus_datetime: datetimeToNano(startDatetime),
      focus_position: 0
    };

    this.klineChartId = params.chart_id;

    this.send(params);
    return params;
  }

  requestTicks({ symbol = '', startDatetime, count = 1998, chartId }) {
    let symbols = symbol.split(',');

    if (symbols && symbols.length > 1) {
      throw new Error('Tick序列不支持多合约订阅');
    }

    const params = {
      aid: 'set_chart',
      chart_id: chartId || 'tick_chart_' + randomStr(),
      ins_list: symbol,
      duration: 0,
      view_width: count,
      focus_datetime: datetimeToNano(startDatetime),
      focus_position: 0
    };

    this.tickChartId = params.chart_id;

    this.send(params);
    return params;
  }

  requestQuotes({ symbols = [] }) {
    if (_.isString(symbols)) {
      symbols = symbols.split(',');
    }

    const params = {
      aid: 'subscribe_quote',
      ins_list: symbols.join(',')
    };

    this.send(params);
    return params;
  }

}

module.exports = MarketSocket;
