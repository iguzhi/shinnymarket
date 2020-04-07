const DURATION_UNIT = {
  m: 60 * 1e9, // 1分钟
  h: 60 * 60 * 1e9, // 1小时
  d: 24 * 60 * 60 * 1e9, // 1天
};

exports.getDurationValue = function (duration = '1m') {
  if (duration === 0) {
    return duration;
  }

  let d = duration.match(/^(\d+)([mhd])$/);
  if (d && d[1] && d[2]) {
    let n = Number(d[1]);
    let unit = d[2];
    return n * DURATION_UNIT[unit];
  }
}

exports.getDurationLabel = function (duration) {
  let days = duration / DURATION_UNIT.d;
  if (days >= 1) {
    return `${days}d`;
  }

  let hours = duration / DURATION_UNIT.h;
  if (hours >= 1) {
    return `${hours}h`;
  }

  let minutes = duration / DURATION_UNIT.m;
  return `${minutes}m`;
}

exports.randomStr = function (len = 8) {
  const charts = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let s = '';
  for (let i = 0; i < len; i++) {
    s += charts[(Math.random() * 0x3e) | 0];
  }
  return s;
}
