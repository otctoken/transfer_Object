import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createDAppKit, DAppKitProvider, useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { SuiClientTypes } from '@mysten/sui/client';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress, normalizeStructTag } from '@mysten/sui/utils';
import { ArrowUpRight, ArrowDown, ArrowRight, Box, Coins, Wallet, ShieldCheck, ExternalLink, RefreshCw, Check, Copy, Layers, Activity, Droplets } from 'lucide-react';
import { parseAmount, formatAmount } from './amount.mjs';
import './style.css';

const kit = createDAppKit({ networks: ['mainnet', 'testnet', 'devnet'], defaultNetwork: 'mainnet', createClient: network => new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` }) });
declare module '@mysten/dapp-kit-react' { interface Register { dAppKit: typeof kit } }
const SUI = normalizeStructTag('0x2::sui::SUI');
const short = (s: string) => s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
type Asset = { type: string; balance: string; symbol: string; decimals: number | null };
type Receipt = { digest: string; network: string; label: string; recipient: string };
type Preview = { tx: Transaction; sender: string; network: string; recipient: string; label: string };
function App() {
  const account = useCurrentAccount(), client = useCurrentClient(), network = useCurrentNetwork(), dapp = useDAppKit();
  const [tab, setTab] = useState<'coin' | 'object'>('coin');
  const [assets, setAssets] = useState<Asset[]>([]), [objects, setObjects] = useState<SuiClientTypes.Object[]>([]);
  const [coinType, setCoinType] = useState(SUI), [custom, setCustom] = useState(''), [amount, setAmount] = useState(''), [recipient, setRecipient] = useState(''), [objectId, setObjectId] = useState('');
  const [busy, setBusy] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [receipts, setReceipts] = useState<Receipt[]>([]), [copied, setCopied] = useState(false);
  const generation = useRef(0), context = useRef(''); context.current = `${network}:${account?.address}`;
  async function refresh() {
    const id = ++generation.current;
    if (!account) { setAssets([]); setObjects([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const balances: SuiClientTypes.Balance[] = []; const owned: SuiClientTypes.Object[] = [];
      let cursor: string | null | undefined;
      do { const page = await client.listBalances({ owner: account.address, cursor }); balances.push(...page.balances); cursor = page.hasNextPage ? page.cursor : null; } while (cursor);
      cursor = undefined;
      do { const page: SuiClientTypes.ListOwnedObjectsResponse = await client.listOwnedObjects({ owner: account.address, cursor }); owned.push(...page.objects); cursor = page.hasNextPage ? page.cursor : null; } while (cursor);
      const result = await Promise.all(balances.map(async b => {
        const meta = await client.getCoinMetadata({ coinType: b.coinType }).catch(() => ({ coinMetadata: null }));
        return { type: normalizeStructTag(b.coinType), balance: b.balance, symbol: meta.coinMetadata?.symbol || b.coinType.split('::').at(-1) || 'TOKEN', decimals: meta.coinMetadata?.decimals ?? (normalizeStructTag(b.coinType) === SUI ? 9 : null) };
      }));
      if (id === generation.current) { setAssets(result); setObjects(owned); }
    } catch (e) { if (id === generation.current) setError(`资产读取失败：${message(e)}`); }
    finally { if (id === generation.current) setLoading(false); }
  }
  useEffect(() => { setPreview(null); setAssets([]); setObjects([]); setAmount(''); setObjectId(''); setCoinType(SUI); setCustom(''); void refresh(); return () => { generation.current++; }; }, [account?.address, network]);
  const selected = assets.find(a => a.type === coinType);
  const sui = assets.find(a => a.type === SUI);
  const objectList = objects.filter(o => !o.type.includes('::coin::Coin<'));
  async function review(e: React.FormEvent) {
    e.preventDefault(); if (!account || busy) return;
    const key = context.current; setError(''); setBusy('正在检查与模拟交易…');
    try {
      if (!isValidSuiAddress(recipient.trim())) throw new Error('请输入完整的 Sui 收款地址（0x + 64 位十六进制）');
      const to = normalizeSuiAddress(recipient.trim());
      if (to === normalizeSuiAddress(account.address)) throw new Error('收款地址不能与当前钱包相同');
      if (!account.chains.includes(`sui:${network}`)) throw new Error('当前钱包账户不支持所选网络，请切换网络');
      const tx = new Transaction(); tx.setSender(account.address); let label = '';
      if (tab === 'coin') {
        const type = normalizeStructTag(coinType === 'custom' ? custom.trim() : coinType);
        const [{ coinMetadata }, { balance }] = await Promise.all([client.getCoinMetadata({ coinType: type }), client.getBalance({ owner: account.address, coinType: type })]);
        const decimals = coinMetadata?.decimals ?? (type === SUI ? 9 : null);
        if (decimals === null) throw new Error('无法读取该代币精度，不能安全换算数量');
        const units = parseAmount(amount.trim(), decimals);
        if (units > BigInt(balance.balance)) throw new Error('代币余额不足');
        if (type === SUI && units >= BigInt(balance.balance)) throw new Error('请保留一些 SUI 用于支付 Gas');
        tx.transferObjects([coinWithBalance({ type, balance: units })], to);
        label = `${amount.trim()} ${coinMetadata?.symbol || type.split('::').at(-1)}`;
      } else {
        if (!isValidSuiAddress(objectId.trim())) throw new Error('请输入完整的对象 ID');
        const { object } = await client.getObject({ objectId: objectId.trim() });
        if (object.owner.$kind !== 'AddressOwner' || normalizeSuiAddress(object.owner.AddressOwner) !== normalizeSuiAddress(account.address)) throw new Error('此对象不是当前地址直接持有的对象，不能直接转账');
        tx.transferObjects([tx.object(object.objectId)], to); label = `对象 ${short(object.objectId)}`;
      }
      // Build before simulation to resolve real gas payments, coin selection and exact inputs.
      const bytes = await tx.build({ client });
      const result = await client.simulateTransaction({ transaction: bytes });
      if (result.$kind === 'FailedTransaction') throw new Error(`模拟失败：${JSON.stringify(result.FailedTransaction.status)}`);
      if (key !== context.current) return;
      setPreview({ tx: Transaction.from(bytes), sender: account.address, network, recipient: to, label });
    } catch (e) { if (key === context.current) setError(message(e)); } finally { setBusy(''); }
  }
  async function send() {
    if (!preview || !account || busy) return;
    if (preview.sender !== account.address || preview.network !== network) { setPreview(null); setError('钱包或网络已改变，请重新检查'); return; }
    setBusy('请在钱包中确认…'); setError('');
    try {
      const result = await dapp.signAndExecuteTransaction({ transaction: preview.tx });
      if (result.$kind === 'FailedTransaction') throw new Error(`链上执行失败：${JSON.stringify(result.FailedTransaction.status)}`);
      setReceipts(old => [{ digest: result.Transaction.digest, network: preview.network, label: preview.label, recipient: preview.recipient }, ...old]);
      setPreview(null); setAmount(''); setObjectId('');
      try { await client.waitForTransaction({ digest: result.Transaction.digest }); } catch { /* Receipt remains available even if indexing times out. */ }
      await refresh();
    } catch (e) { setPreview(null); setError(message(e)); } finally { setBusy(''); }
  }
  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="#"><span className="logo"><Droplets size={24}/></span>Sui<span className="brand-light">Transfer</span></a><div className="workspace-label">WORKSPACE</div><button className="nav active" onClick={() => document.getElementById('transfer')?.scrollIntoView({ behavior: 'smooth' })}><ArrowUpRight size={19}/>资产转账<span className="nav-dot"/></button><a className="nav" href="#activity"><Activity size={19}/>本次交易</a><div className="side-bottom"><div className="built"><span className="sui-mark">◒</span><div>Built on Sui<small>为资产的自由流动而生</small></div></div><a href="https://github.com/otctoken/transfer_Object" target="_blank" rel="noreferrer">开源项目 <ArrowUpRight size={15}/></a></div></aside>
    <div className="main-shell"><header><div className="breadcrumb">工作台 <span>/</span> <strong>资产转账</strong></div><div className="header-actions"><div className="network"><i/><select aria-label="选择网络" value={network} disabled={!!busy} onChange={e => dapp.switchNetwork(e.target.value as typeof network)}><option value="mainnet">Sui Mainnet</option><option value="testnet">Sui Testnet</option><option value="devnet">Sui Devnet</option></select></div><ConnectButton/></div></header>
    <main><div className="intro"><div><div className="eyebrow"><span/> SIMPLE. DIRECT. ON SUI.</div><h1>让资产，自由流动<span>↗</span></h1><p>连接你的钱包，轻松发送代币与链上对象。</p></div><div className="intro-mark"><Layers size={70} strokeWidth={1}/></div></div>
    <div className="stats"><div><span className="stat-icon"><Wallet size={20}/></span><div><small>钱包状态</small><strong>{account ? short(account.address) : '尚未连接'}{account && <button className="icon-btn" aria-label="复制地址" onClick={async () => { try { await navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('无法复制，请从钱包复制地址'); } }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>}</strong></div></div><div><span className="stat-icon"><Droplets size={20}/></span><div><small>可用 SUI 余额</small><strong>{account ? (loading ? '读取中…' : sui ? formatAmount(sui.balance, 9) : '0') : '—'} <em>SUI</em></strong></div></div><div><span className="stat-icon"><Box size={20}/></span><div><small>持有链上对象</small><strong>{account ? (loading ? '…' : objectList.length) : '—'} <em>Objects</em></strong></div></div></div>
    <div className="content-grid"><section className="transfer-card" id="transfer"><div className="card-heading"><div><h2>发送资产</h2><p>每一次转账，由你掌控。</p></div><span className="small-icon"><ArrowUpRight size={22}/></span></div><div className="tabs"><button className={tab === 'coin' ? 'selected' : ''} disabled={!!busy} onClick={() => { setTab('coin'); setError(''); }}><Coins size={17}/>代币转账</button><button className={tab === 'object' ? 'selected' : ''} disabled={!!busy} onClick={() => { setTab('object'); setError(''); }}><Box size={17}/>对象转账</button></div>
    <form onSubmit={review}><fieldset disabled={!!busy || !!preview}>
      {tab === 'coin' ? <><label htmlFor="token">选择代币 <span>Token</span></label><div className="token-field"><span className="coin-icon">{selected?.symbol.slice(0, 1) || 'S'}</span><select id="token" value={coinType} onChange={e => setCoinType(e.target.value)}><option value={SUI}>SUI · Sui</option>{assets.filter(a => a.type !== SUI).map(a => <option key={a.type} value={a.type}>{a.symbol} · {short(a.type)}</option>)}<option value="custom">自定义 Coin Type…</option></select></div>{coinType === 'custom' && <input aria-label="自定义代币类型" placeholder="0x…::module::TOKEN" value={custom} onChange={e => setCustom(e.target.value)} required/>}<div className="label-row"><label htmlFor="amount">转账数量</label><small>余额：{selected && selected.decimals !== null ? formatAmount(selected.balance, selected.decimals) : '—'}</small></div><div className="amount-field"><input id="amount" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} required/><span>{selected?.symbol || (coinType === SUI ? 'SUI' : 'TOKEN')}</span></div><small className="field-hint">按代币精度精确转账，请预留 SUI 支付网络费用。</small></> : <><label htmlFor="object">对象 ID <span>Object ID</span></label><input id="object" className="mono" placeholder="0x…" value={objectId} onChange={e => setObjectId(e.target.value)} required/><small className="field-hint">支持当前地址直接拥有且允许公开转移的对象。</small>{objectList.length > 0 && <select aria-label="从持有对象中选择" value="" onChange={e => setObjectId(e.target.value)}><option value="">从我的对象中选择…</option>{objectList.map(o => <option key={o.objectId} value={o.objectId}>{o.type.split('::').at(-1)} · {short(o.objectId)}</option>)}</select>}</>}
      <div className="flow-divider"><span><ArrowDown size={15}/></span></div><label htmlFor="recipient">收款地址 <span>Recipient</span></label><input id="recipient" className="mono" placeholder="输入 Sui 地址，0x 开头" value={recipient} onChange={e => setRecipient(e.target.value)} required autoComplete="off"/><div className="network-fee"><span>网络费用</span><span>由 Sui 网络计算 · 使用 SUI 支付</span></div>
      {account ? <button className="primary" type="submit" disabled={!!busy}>{busy || '检查转账'}{!busy && <ArrowRight size={18}/>}</button> : <div className="connect-prompt"><Wallet size={17}/>请先点击右上角「Connect Wallet」连接钱包</div>}
    </fieldset></form><div className="secure-line"><ShieldCheck size={14}/>资产始终在你的钱包中，签名由钱包完成</div></section>
    <aside className="right-column"><section className="wallet-card"><div className="wallet-graphic"><Wallet size={30}/><span><Check size={13}/></span></div><h3>{account ? '钱包已连接' : '你的资产，由你掌控'}</h3><p>{account ? '资产从当前钱包直接发送至收款地址，无需托管或授权中间账户。' : '连接支持 Sui 的钱包，即可查看余额、选择资产并发起转账。'}</p><div className="wallet-status"><i className={account ? 'online' : ''}/>{account ? short(account.address) : '等待连接钱包'}</div></section><section className="guide"><div className="section-label">转账，只需三步 <span>01 — 03</span></div><div className="step"><b>01</b><div><h4>连接钱包</h4><p>选择钱包，确认当前网络。</p></div></div><div className="step"><b>02</b><div><h4>填写转账信息</h4><p>选择资产，输入数量与收款地址。</p></div></div><div className="step"><b>03</b><div><h4>确认并发送</h4><p>检查交易，在钱包中完成签名。</p></div></div></section><div className="note"><ShieldCheck size={18}/><p>发送前请核对地址与网络。对象转账须符合其合约规则，共享或锁定对象可能无法直接转出。</p></div></aside></div>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}
    <section className="activity" id="activity"><div className="activity-title"><h2>本次交易 <span>{receipts.length.toString().padStart(2, '0')}</span></h2><button disabled={loading || !account || !!busy} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'spin' : ''}/>刷新资产</button></div>{receipts.length ? receipts.map(r => <a className="receipt" key={r.digest} target="_blank" rel="noreferrer" href={`https://suiscan.xyz/${r.network}/tx/${r.digest}`}><Check size={19}/><div><strong>{r.label}</strong><small>发送至 {short(r.recipient)} · {r.network}</small></div><span>已成功</span><ExternalLink size={15}/></a>) : <div className="empty"><Activity size={26}/><div>还没有交易记录<small>成功发出的交易将显示在这里；仅保留本次会话。</small></div></div>}</section>
    <footer><span>© {new Date().getFullYear()} Sui Transfer</span><span><i/>非托管 · 链上直达 <span className="footer-divider">|</span> Powered by Sui</span></footer></main></div>
    {preview && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="review-title" className="modal"><span className="review-icon"><ShieldCheck size={27}/></span><h2 id="review-title">确认转账</h2><p>交易模拟已通过，请再次核对以下信息。</p><dl><dt>网络</dt><dd>{preview.network}</dd><dt>发送资产</dt><dd>{preview.label}</dd><dt>发送地址</dt><dd className="mono">{preview.sender}</dd><dt>收款地址</dt><dd className="mono">{preview.recipient}</dd></dl><p className="field-hint">网络费用以钱包确认为准。确认后将在钱包中请求签名。</p><button className="primary" disabled={!!busy} onClick={() => void send()}>{busy || '在钱包中确认'}<ArrowUpRight size={18}/></button><button className="cancel" disabled={!!busy} onClick={() => setPreview(null)}>返回修改</button></section></div>}
  </div>;
}
function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
createRoot(document.getElementById('root')!).render(<React.StrictMode><DAppKitProvider dAppKit={kit}><App/></DAppKitProvider></React.StrictMode>);

