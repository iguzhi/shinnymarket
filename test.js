const { MarketSocket } = require('./index');

let fs = require('fs');
 
let options = {
  flags: 'a',     // append模式
  encoding: 'utf8',  // utf8编码
};
 
let stdout = fs.createWriteStream('./stdout.log', options);
// let stderr = fs.createWriteStream('./stderr.log', options);

// 创建logger
// let logger = new console.Console(stdout, stderr);
 let logger = new console.Console(stdout);

const socket = new MarketSocket();
let startTime = Date.now();
let symbol = 'CFFEX.T2012', duration = '1m'
let endId, finalBars = [];
socket.on('message', data => {
  if (!data || data.aid !== 'rtn_data' || !data.data) {
    return;
  }


  // const clonedData = _.cloneDeep(data)

  let { bars, rightId, hasMoreData }  = socket.getKlines({ data, symbol, duration, endId });
  if (rightId) {
    endId = rightId;
  }
  console.log('bars.length', bars && bars.length, 'rightId', rightId, 'hasMoreData', hasMoreData)
  if (bars && bars.length) {
    finalBars = finalBars.concat(bars);
    if (!hasMoreData) {
      finalBars = finalBars.sort((a, b) => a.id - b.id)
      console.log('finalBars', finalBars.length)
    }
  }

  logger.log(JSON.stringify(data));
  console.log('time', Date.now() - startTime)

  // logger.log(JSON.stringify(data));
  // console.log('##aaa: ' + JSON.stringify(
  //   socket.getKlines({ data, symbol: 'SHFE.rb2010', duration: '1m' })
  // ))
  // console.log(JSON.stringify(socket.getByPath(['quotes', 'SHFE.au2006'], data.data)));
  console.log('\n\n');
});

socket.on('reconnect', data => {
  console.log(data);
});

socket.on('death', data => {
  console.log(data);
});

socket.on('open', data => {
  console.log(data);
});

socket.on('error', data => {
  console.log(data);
});

socket.requestKlines({
  symbol,
  duration,
  // startDatetime: '2020-09-22',
});


// socket.requestTicks({
//   symbols: 'SHFE.rb2010',
//   startDatetime: '2020-03-22',
//   endDatetime: '2020-03-24',
//   count: 10
// });
// socket.sendQuotes({
//   symbol: 'SHFE.ag2006'
// }); // {"aid":"subscribe_quote","ins_list":"CFFEX.IF2004,CFFEX.IH2004,CFFEX.IC2004,CFFEX.TF2006,CFFEX.T2006,CFFEX.TS2006,SHFE.cu2005,SHFE.au2006,SHFE.ag2006"}
