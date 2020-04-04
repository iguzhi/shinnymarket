const { MarketSocket } = require('./index');

const socket = new MarketSocket();

socket.on('message', data => {
  console.log(JSON.stringify(data))
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

/*socket.requestKlines({
  symbol: 'SHFE.rb2010',
  duration: '1m',
  // startDay: -1,
  // dayCount: 1// 3600 * 24 * 1e9
  count: 100
});*/
socket.requestTicks({
  symbol: 'SHFE.rb2010',
  // startDay: -1,
  // dayCount: 1// 3600 * 24 * 1e9
  count: 100
});
// socket.sendQuotes({
//   symbol: 'SHFE.ag2006'
// }); // {"aid":"subscribe_quote","ins_list":"CFFEX.IF2004,CFFEX.IH2004,CFFEX.IC2004,CFFEX.TF2006,CFFEX.T2006,CFFEX.TS2006,SHFE.cu2005,SHFE.au2006,SHFE.ag2006"}
