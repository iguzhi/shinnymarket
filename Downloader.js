const _ = require('lodash');
const moment = require('moment');
const { getDurationLabel, getDurationValue, randomStr } = require('./util');
const fs = require('fs');

const options = {
  flags: 'a',     // append模式
  encoding: 'utf8',  // utf8编码
};

class Downloader {
  constructor ({ symbols, duration, startDatetime, endDatetime, csvFileName }) {
    startDatetime = convertDatetime(startDatetime);
    this.props = {
      symbols: _.isArray(symbols) ? symbols : [symbols],
      duration: getDurationValue(duration),
      startDatetime,
      endDatetime: convertDatetime(endDatetime),
      csvFileName,
      currentDatetime: startDatetime
    };
    this.state = {};
  }

  init () {
    const { symbols, duration, startDatetime, endDatetime, csvFileName } = this.props;

    if (duration === 0 && symbols.lengths !== 1) {
      throw new Error('Tick序列不支持多合约');
    }

    this.state.task = tqSdk.createTask(this.downloadData()); // self._task = self._api.create_task(self._download_data())
  }

  // 判断是否下载完成
  isFinished () {
    return this.state.task.done();
  }

  // 获得下载进度百分比
  getProgress () {
    if (this.state.task.done()) {
      return 100;
    }

    const { currentDatetime, startDatetime, endDatetime } = this.props;
    return _.floor((currentDatetime - startDatetime) / (endDatetime - startDatetime) * 100);
  }

  // 下载数据, 多合约横向按时间对齐
  async downloadData () {
    const { symbols, duration, startDatetime, csvFileName, endDatetime } = this.props;
    const chartInfo = {
      aid: "set_chart",
      chart_id: 'PYSDK_downloader_' + randomStr(),
      ins_list: symbols.join(','),
      duration,
      view_width: 2000,
      focus_datetime: startDatetime,
      focus_position: 0,
    };

    await tqSdk.sendChan.send(chartInfo); // await self._api._send_chan.send(chart_info)
    const chart = tqSdk.getObj(tqSdk.data, ['charts', chartInfo.chart_id]); // chart = self._api._get_obj(self._api._data, ["charts", chart_info["chart_id"]])
    let currentId; // 当前数据指针
    const csvHeader = [];
    const dataCols = duration === 0
    ? ['lastPrice', 'highest', 'lowest', 'bidPrice1', 'bidVolume1', 'askPrice1', 'askVolume1', 'volume', 'amount', 'openInterest']
    : ['open', 'high', 'low', 'close', 'volume', 'openOi', 'closeOi'];

    const serials = [];

    for (let symbol of symbols) {
      let path = duration === 0 ? ['ticks', symbol] : ['klines', symbol, '0'];
      let serial = tqSdk.getObj(tqSdk.data, path); // serial = self._api._get_obj(self._api._data, path)
      serials.push(serial);
    }

    try {
      const writer = fs.createWriteStream(csvFileName, options);
      const updateChan = tqSdk.register_update_notify();
      for (d in updateChan) {
        if (chartInfo.items() > tqSdk.getObj(chart, ['state']).items()) { // if not (chart_info.items() <= self._api._get_obj(chart, ["state"]).items()):
          // 当前请求还没收齐回应, 不应继续处理
          continue;
        }
        let leftId = chart.get('left_id', -1);
        let rightId = chart.get('right_id', -1);

        if (leftId === -1 && rightId === -1 || tqSdk.data.get('mdhis_more_data') === true) {
          // 定位信息还没收到, 或数据序列还没收到
          continue;
        }

        for (let serial in serials) {
          // 检查合约的数据是否收到
          if (serial.get('last_id', -1) == -1) {
            continue;
          }
        }
        if (!currentId) {
          currentId = Math.max(leftId, 0);
        }

        while(currentId <= rightId) {
          let item = serials[0]['data'].get(String(currentId), {});
          if (item.get('datetime', 0) === 0 || item.datetime > endDatetime) {
            // 当前 id 已超出 last_id 或k线数据的时间已经超过用户限定的右端
            return;
          }
          if (csvHeader.length === 0) {
            csvHeader.push('datetime');
            for (let symbol of symbols) {
              for (let col of dataCols) {
                csvHeader.push(symbol + '.' + col);
              }
            }
            writer.write(csvHeader); // csv_writer.writerow(csv_header)
          }
          const row = [];
          for (let col of dataCols) {
            row.push(getValue(item, col));
          }
          for (let i = 1, l = symbols.length; i < leftId; i++) {
            let symbol = symbols[i];
            let tid = serials[0].get('binding, {}').get(symbol, {}).get(String(currentId), -1); // tid = serials[0].get("binding", {}).get(symbol, {}).get(str(current_id), -1)
            let k = tid === -1 ? {} : serials[i]['data'].get(String(tid), {});
            for (let col of dataCols) {
              row.push(getValue(k, col));
            }
          }
          writer.write(row); // csv_writer.writerow(row)
          currentId++;
          this.props.currentDatetime = item.datetime;
        }
        // 当前 id 已超出订阅范围, 需重新订阅后续数据
        delete chartInfo.focus_datetime; // chart_info.pop("focus_datetime", None)
        delete chartInfo.focus_position; // chart_info.pop("focus_position", None)
        chartInfo.left_kline_id = currentId;
        await tqSdk.sendChan.send(chartInfo); // await self._api._send_chan.send(chart_info)
      }

    }
    finally {
      // 释放chart资源
      await tqSdk._send_chan.send({ // self._api._send_chan.send({
        aid: 'set_chart',
        chart_id: chartInfo['chart_id'],
        ins_list: '',
        duration,
        view_width: 2000,
      });
    }
  }

}


function convertDatetime(datetime) {
  return (_.isString(datetime) ? new Date(datetime): datetime).getTime() * 1e6;
}

function getValue(obj, key) {
  if (!obj.hasOwnProperty(key)) {
    return '#N/A';
  }

  return obj[key];
}

