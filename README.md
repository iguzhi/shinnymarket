# shinnymarket
快期行情

## requestKlines
参数: 订阅的合约、K线周期、开始时间、结束时间

1. 支持同时订阅多个合约
2. 根据参数推送历史数据, 交易时段推送完历史数据后还推送实时数据

## requestTicks
参数：合约、开始时间、结束时间

1. 一次仅能订阅一个合约, 不支持多合约
2. 根据参数推送历史数据, 交易时段推送完历史数据后还推送实时数据