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
import { parseBase64Transaction, assertUnchangedBytes } from './base64-transaction.mjs';
import './style.css';

const kit = createDAppKit({ networks: ['mainnet', 'testnet', 'devnet'], defaultNetwork: 'mainnet', createClient: network => new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` }) });
declare module '@mysten/dapp-kit-react' { interface Register { dAppKit: typeof kit } }
const SUI = normalizeStructTag('0x2::sui::SUI');
const short = (s: string) => s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
type Asset = { type: string; balance: string; symbol: string; decimals: number | null };
type Receipt = { digest: string; network: string; label: string; recipient: string };
type Preview = { tx: Transaction; sender: string; network: string; recipient: string; label: string; base64?: string; details?: string; effects?: string };
function App() {
  const account = useCurrentAccount(), client = useCurrentClient(), network = useCurrentNetwork(), dapp = useDAppKit();
  const [tab, setTab] = useState<'coin' | 'object' | 'base64'>('coin');
  const [assets, setAssets] = useState<Asset[]>([]), [objects, setObjects] = useState<SuiClientTypes.Object[]>([]);
  const [coinType, setCoinType] = useState(SUI), [custom, setCustom] = useState(''), [amount, setAmount] = useState(''), [recipient, setRecipient] = useState(''), [objectId, setObjectId] = useState('');
  const [base64Input, setBase64Input] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
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
    } catch (e) { if (id === generation.current) setError(`Unable to load assets: ${message(e)}`); }
    finally { if (id === generation.current) setLoading(false); }
  }
  useEffect(() => { setPreview(null); setAssets([]); setObjects([]); setAmount(''); setObjectId(''); setCoinType(SUI); setCustom(''); void refresh(); return () => { generation.current++; }; }, [account?.address, network]);
  const selected = assets.find(a => a.type === coinType);
  const sui = assets.find(a => a.type === SUI);
  const objectList = objects.filter(o => !o.type.includes('::coin::Coin<'));
  async function review(e: React.FormEvent) {
    e.preventDefault(); if (!account || busy) return;
    const key = context.current; setError(''); setBusy('Checking and simulating…');
    try {
      if (tab === 'base64') {
        if (!account.chains.includes('sui:mainnet')) throw new Error('This wallet account does not support Mainnet.');
        const parsed = parseBase64Transaction(base64Input, account.address, network);
        const result = await client.simulateTransaction({ transaction: parsed.bytes, include: { balanceChanges: true, effects: true } });
        if (result.$kind === 'FailedTransaction') throw new Error('Mainnet simulation failed: ' + JSON.stringify(result.FailedTransaction.status));
        if (result.gasPaymentMocked) throw new Error('Simulation did not use real gas funds. Rebuild the transaction with a valid gas payment.');
        if (key !== context.current) return;
        setAcknowledged(false);
        setPreview({ tx: parsed.tx, base64: parsed.base64, sender: account.address, network: 'mainnet', recipient: '', label: 'Base64 transaction (' + parsed.data.commands.length + ' commands)', details: JSON.stringify(parsed.data, null, 2), effects: JSON.stringify({ balanceChanges: result.Transaction.balanceChanges, gasUsed: result.Transaction.effects.gasUsed }, null, 2) });
        return;
      }
      if (!isValidSuiAddress(recipient.trim())) throw new Error('Enter a full Sui recipient address (0x followed by 64 hexadecimal characters)');
      const to = normalizeSuiAddress(recipient.trim());
      if (to === normalizeSuiAddress(account.address)) throw new Error('The recipient must be different from the connected wallet');
      if (!account.chains.includes(`sui:${network}`)) throw new Error('This wallet account does not support the selected network');
      const tx = new Transaction(); tx.setSender(account.address); let label = '';
      if (tab === 'coin') {
        const type = normalizeStructTag(coinType === 'custom' ? custom.trim() : coinType);
        const [{ coinMetadata }, { balance }] = await Promise.all([client.getCoinMetadata({ coinType: type }), client.getBalance({ owner: account.address, coinType: type })]);
        const decimals = coinMetadata?.decimals ?? (type === SUI ? 9 : null);
        if (decimals === null) throw new Error('Unable to read token decimals; the amount cannot be converted safely');
        const units = parseAmount(amount.trim(), decimals);
        if (units > BigInt(balance.balance)) throw new Error('Insufficient token balance');
        if (type === SUI && units >= BigInt(balance.balance)) throw new Error('Keep some SUI available for gas');
        tx.transferObjects([coinWithBalance({ type, balance: units })], to);
        label = `${amount.trim()} ${coinMetadata?.symbol || type.split('::').at(-1)}`;
      } else {
        if (!isValidSuiAddress(objectId.trim())) throw new Error('Enter a full object ID');
        const { object } = await client.getObject({ objectId: objectId.trim() });
        if (object.owner.$kind !== 'AddressOwner' || normalizeSuiAddress(object.owner.AddressOwner) !== normalizeSuiAddress(account.address)) throw new Error('This object is not directly owned by the connected address');
        tx.transferObjects([tx.object(object.objectId)], to); label = `Object ${short(object.objectId)}`;
      }
      // Build before simulation to resolve real gas payments, coin selection and exact inputs.
      const bytes = await tx.build({ client });
      const result = await client.simulateTransaction({ transaction: bytes });
      if (result.$kind === 'FailedTransaction') throw new Error(`Simulation failed: ${JSON.stringify(result.FailedTransaction.status)}`);
      if (key !== context.current) return;
      setPreview({ tx: Transaction.from(bytes), sender: account.address, network, recipient: to, label });
    } catch (e) { if (key === context.current) setError(message(e)); } finally { setBusy(''); }
  }
  async function send() {
    if (!preview || !account || busy) return;
    if (preview.sender !== account.address || preview.network !== network) { setPreview(null); setError('Wallet or network changed. Please review the transfer again'); return; }
    setBusy('Confirm in your wallet…'); setError('');
    try {
      let result;
      if (preview.base64) {
        if (!acknowledged || network !== 'mainnet') throw new Error('Review and acknowledge the Mainnet transaction first.');
        const key = context.current;
        const signed = await dapp.signTransaction({ transaction: preview.tx, account, network: 'mainnet' });
        assertUnchangedBytes(preview.base64, signed.bytes);
        if (key !== context.current) throw new Error('Wallet or network changed. Nothing was submitted.');
        setBusy('Submitting to Mainnet…');
        const parsed = parseBase64Transaction(preview.base64, account.address, 'mainnet');
        result = await kit.getClient('mainnet').executeTransaction({ transaction: parsed.bytes, signatures: [signed.signature] });
      } else {
        result = await dapp.signAndExecuteTransaction({ transaction: preview.tx });
      }
      if (result.$kind === 'FailedTransaction') throw new Error(`On-chain execution failed: ${JSON.stringify(result.FailedTransaction.status)}`);
      setReceipts(old => [{ digest: result.Transaction.digest, network: preview.network, label: preview.label, recipient: preview.recipient }, ...old]);
      setPreview(null); setAmount(''); setObjectId(''); if (preview.base64) setBase64Input('');
      try { await client.waitForTransaction({ digest: result.Transaction.digest }); } catch { /* Receipt remains available even if indexing times out. */ }
      await refresh();
    } catch (e) { setPreview(null); setError(message(e)); } finally { setBusy(''); }
  }
  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="#"><span className="logo"><Droplets size={24}/></span>Sui<span className="brand-light">Transfer</span></a><div className="workspace-label">WORKSPACE</div><button className="nav active" onClick={() => document.getElementById('transfer')?.scrollIntoView({ behavior: 'smooth' })}><ArrowUpRight size={19}/>Transfers<span className="nav-dot"/></button><a className="nav" href="#activity"><Activity size={19}/>Session activity</a><div className="side-bottom"><div className="built"><span className="sui-mark">◒</span><div>Built on Sui<small>Made for assets in motion</small></div></div><a href="https://t.me/Sui_Nav" target="_blank" rel="noreferrer">Community<ArrowUpRight size={15}/></a></div></aside>
    <div className="main-shell"><header><div className="breadcrumb">Workspace <span>/</span> <strong>Transfers</strong></div><div className="header-actions"><div className="network"><i/><select aria-label="Select network" value={network} disabled={!!busy} onChange={e => dapp.switchNetwork(e.target.value as typeof network)}><option value="mainnet">Sui Mainnet</option><option value="testnet">Sui Testnet</option><option value="devnet">Sui Devnet</option></select></div><ConnectButton/></div></header>
    <main><div className="intro"><div><div className="eyebrow"><span/> SIMPLE. DIRECT. ON SUI.</div><h1>Move assets freely<span>↗</span></h1><p>Connect your wallet. Send tokens and on-chain objects with ease.</p></div><div className="intro-mark"><Layers size={70} strokeWidth={1}/></div></div>
    <div className="stats"><div><span className="stat-icon"><Wallet size={20}/></span><div><small>Wallet status</small><strong>{account ? short(account.address) : 'Not connected'}{account && <button className="icon-btn" aria-label="Copy address" onClick={async () => { try { await navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError('Unable to copy. Please copy the address from your wallet'); } }}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>}</strong></div></div><div><span className="stat-icon"><Droplets size={20}/></span><div><small>Available SUI</small><strong>{account ? (loading ? 'Loading…' : sui ? formatAmount(sui.balance, 9) : '0') : '—'} <em>SUI</em></strong></div></div><div><span className="stat-icon"><Box size={20}/></span><div><small>Owned objects</small><strong>{account ? (loading ? '…' : objectList.length) : '—'} <em>Objects</em></strong></div></div></div>
    <div className="content-grid"><section className="transfer-card" id="transfer"><div className="card-heading"><div><h2>Send assets</h2><p>Every transfer, in your control.</p></div><span className="small-icon"><ArrowUpRight size={22}/></span></div><div className="tabs"><button className={tab === 'coin' ? 'selected' : ''} disabled={!!busy} onClick={() => { setTab('coin'); setError(''); }}><Coins size={17}/>Tokens</button><button className={tab === 'object' ? 'selected' : ''} disabled={!!busy} onClick={() => { setTab('object'); setError(''); }}><Box size={17}/>Objects</button><button className={tab === 'base64' ? 'selected' : ''} disabled={!!busy} onClick={() => { setTab('base64'); setError(''); }}>Base64</button></div>
    <form onSubmit={review}><fieldset disabled={!!busy || !!preview}>
      {tab === 'base64' ? <><label htmlFor="base64">Transaction Base64 <span>Mainnet only</span></label><textarea id="base64" rows={8} spellCheck={false} autoComplete="off" placeholder="Paste Base64 from toBase64(await tx.build({ client }))" value={base64Input} onChange={e => setBase64Input(e.target.value)} required maxLength={200000}/><p className="field-hint">Paste complete transaction bytes. The embedded sender, gas settings and commands are preserved. No separate recipient or amount is needed.</p><p className="base64-notice">This can execute any transaction, including contract calls and asset transfers. Only sign transactions you understand. Simulation success does not mean a transaction is safe.</p>{network !== 'mainnet' && <button className="cancel" type="button" onClick={() => dapp.switchNetwork('mainnet')}>Switch to Sui Mainnet</button>}</> : <>{tab === 'coin' ? <><label htmlFor="token">Select token <span>Token</span></label><div className="token-field"><span className="coin-icon">{selected?.symbol.slice(0, 1) || 'S'}</span><select id="token" value={coinType} onChange={e => setCoinType(e.target.value)}><option value={SUI}>SUI · Sui</option>{assets.filter(a => a.type !== SUI).map(a => <option key={a.type} value={a.type}>{a.symbol} · {short(a.type)}</option>)}<option value="custom">Custom coin type…</option></select></div>{coinType === 'custom' && <input aria-label="Custom coin type" placeholder="0x…::module::TOKEN" value={custom} onChange={e => setCustom(e.target.value)} required/>}<div className="label-row"><label htmlFor="amount">Amount</label><small>Balance: {selected && selected.decimals !== null ? formatAmount(selected.balance, selected.decimals) : '—'}</small></div><div className="amount-field"><input id="amount" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} required/><span>{selected?.symbol || (coinType === SUI ? 'SUI' : 'TOKEN')}</span></div><small className="field-hint">Exact token precision. Keep SUI available for network fees.</small></> : <><label htmlFor="object">Object <span>Object ID</span></label><input id="object" className="mono" placeholder="0x…" value={objectId} onChange={e => setObjectId(e.target.value)} required/><small className="field-hint">Supports directly owned objects that allow public transfers.</small>{objectList.length > 0 && <select aria-label="Select an owned object" value="" onChange={e => setObjectId(e.target.value)}><option value="">Choose from your objects…</option>{objectList.map(o => <option key={o.objectId} value={o.objectId}>{o.type.split('::').at(-1)} · {short(o.objectId)}</option>)}</select>}</>}
      <div className="flow-divider"><span><ArrowDown size={15}/></span></div><label htmlFor="recipient">Recipient address <span>Recipient</span></label><input id="recipient" className="mono" placeholder="Enter a Sui address starting with 0x" value={recipient} onChange={e => setRecipient(e.target.value)} required autoComplete="off"/></>}<div className="network-fee"><span>Network fee</span><span>Calculated by Sui · Paid in SUI</span></div>
      {account ? <button className="primary" type="submit" disabled={!!busy}>{busy || (tab === 'base64' ? 'Review Mainnet transaction' : 'Review transfer')}{!busy && <ArrowRight size={18}/>}</button> : <div className="connect-prompt"><Wallet size={17}/>Select Connect Wallet above to get started</div>}
    </fieldset></form><div className="secure-line"><ShieldCheck size={14}/>Your assets stay in your wallet. You approve every signature.</div></section>
    <aside className="right-column"><section className="wallet-card"><div className="wallet-graphic"><Wallet size={30}/><span><Check size={13}/></span></div><h3>{account ? 'Wallet connected' : 'Your assets. Your control.'}</h3><p>{account ? 'Send assets directly to the recipient. No custodians or intermediary accounts.' : 'Connect a Sui wallet to view balances, choose assets and make a transfer.'}</p><div className="wallet-status"><i className={account ? 'online' : ''}/>{account ? short(account.address) : 'Waiting for your wallet'}</div></section><section className="guide"><div className="section-label">Three simple steps <span>01 — 03</span></div><div className="step"><b>01</b><div><h4>Connect your wallet</h4><p>Choose a wallet and check the network.</p></div></div><div className="step"><b>02</b><div><h4>Enter transfer details</h4><p>Choose an asset, amount and recipient.</p></div></div><div className="step"><b>03</b><div><h4>Confirm and send</h4><p>Review the transfer and sign in your wallet.</p></div></div></section><div className="note"><ShieldCheck size={18}/><p>Check the address and network before sending. Contract rules apply: shared or locked objects may not be directly transferable.</p></div></aside></div>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <section className="activity" id="activity"><div className="activity-title"><h2>Session activity <span>{receipts.length.toString().padStart(2, '0')}</span></h2><button disabled={loading || !account || !!busy} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'spin' : ''}/>Refresh assets</button></div>{receipts.length ? receipts.map(r => <a className="receipt" key={r.digest} target="_blank" rel="noreferrer" href={`https://suiscan.xyz/${r.network}/tx/${r.digest}`}><Check size={19}/><div><strong>{r.label}</strong><small>{r.recipient ? 'Sent to ' + short(r.recipient) : 'Submitted transaction'} · {r.network}</small></div><span>Confirmed</span><ExternalLink size={15}/></a>) : <div className="empty"><Activity size={26}/><div>No transfers yet<small>Successful transfers appear here for this session.</small></div></div>}</section>
    <footer><div className="social-links" aria-label="Community links"><a href="https://x.com/SuiSgGame" target="_blank" rel="noopener noreferrer">X / Twitter <ArrowUpRight size={12}/></a><a href="https://t.me/Sui_Nav" target="_blank" rel="noopener noreferrer">Telegram <ArrowUpRight size={12}/></a></div><span>© {new Date().getFullYear()} Sui Transfer</span><span><i/>Non-custodial · On-chain <span className="footer-divider">|</span> Powered by Sui</span></footer></main></div>
    {preview && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="review-title" className="modal"><span className="review-icon"><ShieldCheck size={27}/></span><h2 id="review-title">{preview.base64 ? "Review Mainnet transaction" : "Review your transfer"}</h2><p>Simulation passed. Double-check the details below.</p><dl><dt>Network</dt><dd>{preview.network}</dd><dt>Send assets</dt><dd>{preview.label}</dd><dt>Sender address</dt><dd className="mono">{preview.sender}</dd>{preview.recipient && <><dt>Recipient address</dt><dd className="mono">{preview.recipient}</dd></>}</dl>{preview.base64 && <><h3>Decoded transaction</h3><pre className="transaction-json">{preview.details}</pre><h3>Simulated balance changes and gas</h3><pre className="transaction-json">{preview.effects}</pre><label className="acknowledgement"><input type="checkbox" checked={acknowledged} disabled={!!busy} onChange={e => setAcknowledged(e.target.checked)}/>I have reviewed all commands and balance changes. I want to sign and submit this transaction to Mainnet.</label></>}<p className="field-hint">Review the final network fee in your wallet before signing.</p><button className="primary" disabled={!!busy || (!!preview.base64 && !acknowledged)} onClick={() => void send()}>{busy || 'Confirm in wallet'}<ArrowUpRight size={18}/></button><button className="cancel" disabled={!!busy} onClick={() => setPreview(null)}>Back to edit</button></section></div>}
  </div>;
}
function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
createRoot(document.getElementById('root')!).render(<React.StrictMode><DAppKitProvider dAppKit={kit}><App/></DAppKitProvider></React.StrictMode>);

