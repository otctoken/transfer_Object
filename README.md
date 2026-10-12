# Sui Transfer

中文 Sui 非托管转账前端，React 19 + TypeScript + Vite + Mysten dApp Kit / Sui gRPC SDK。

## 本地运行

```sh
npm ci
npm run dev
```

生产构建：`npm run build`。精度测试：`npm test`。静态产物位于 `dist/`，可部署到静态托管。

## 功能

- Wallet Standard 钱包连接、断开及账户切换。
- Mainnet / Testnet / Devnet；分页读取余额和对象。
- SUI 与任意标准 Coin<T>：选择钱包代币或填写自定义 Coin Type，读取元数据精度，BigInt 精确换算，SDK 自动选择、合并、拆分资产。
- 直接持有的对象：通过 ID 或列表选择；校验所有权，交易构建及模拟检查合约可转移性。
- 明确展示发送方、接收方、资产与网络，确认后请求钱包签名；成功交易链接至 SuiScan。
- RPC 错误、余额不足、数量精度、签名拒绝及执行失败提示；账户/网络切换取消过期数据。

“任意”仍受 Sui 协议约束：对象须归当前账户直接所有且允许公开转移；共享、不可变、合约锁定对象需要其专用合约流程。代币需要可查询的 Coin Metadata（SUI 使用 9 位精度兜底）。数量不能超过余额或 u64，并须保留 Gas。无私钥输入、无后端托管、无自动签名。

公共 gRPC 节点可能限流，可在 `src/main.tsx` 的 `createClient` 中替换服务地址。交易记录仅在本次页面会话内保留。

## 验证范围

已执行类型检查、生产构建、精度边界单元测试。真实签名与链上转账需要用户钱包和资金，未代用户执行。
