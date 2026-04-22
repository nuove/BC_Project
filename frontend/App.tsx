import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { ABI } from "./abi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Identity {
  identityHash: string;
  ipfsCID: string;
  owner: string;
  createdAt: bigint;
  updatedAt: bigint;
  isVerified: boolean;
  isActive: boolean;
  verificationLevel: number;
  approvalWeight: number;
}

interface LogEntry {
  id: number;
  time: string;
  type: "success" | "error" | "info" | "warn";
  msg: string;
}

interface AttrKey {
  label: string;
  key: string;
  constant: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #080c0f;
    --surface:  #0d1419;
    --border:   #1a2a35;
    --cyan:     #00e5ff;
    --cyan-dim: #007a8a;
    --green:    #00ff9d;
    --red:      #ff3b5c;
    --yellow:   #ffd166;
    --text:     #c8dde8;
    --muted:    #4a6070;
    --font-mono: 'JetBrains Mono', monospace;
    --font-sans: 'Syne', sans-serif;
  }

  html, body, #root { height: 100%; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    overflow-x: hidden;
  }

  /* scanline overlay */
  body::before {
    content: '';
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.07) 2px,
      rgba(0,0,0,0.07) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  .app { display: flex; flex-direction: column; min-height: 100vh; }

  /* ── Header ── */
  .header {
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
    position: sticky; top: 0; z-index: 100;
  }
  .header-logo {
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 800;
    color: var(--cyan);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    display: flex; align-items: center; gap: 10px;
  }
  .header-logo span { color: var(--muted); font-weight: 400; font-size: 12px; }
  .header-right { display: flex; align-items: center; gap: 12px; }

  /* ── Badges ── */
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px;
    border-radius: 2px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .badge-green  { background: rgba(0,255,157,0.12); color: var(--green); border: 1px solid rgba(0,255,157,0.25); }
  .badge-red    { background: rgba(255,59,92,0.12);  color: var(--red);   border: 1px solid rgba(255,59,92,0.25); }
  .badge-cyan   { background: rgba(0,229,255,0.10);  color: var(--cyan);  border: 1px solid rgba(0,229,255,0.25); }
  .badge-yellow { background: rgba(255,209,102,0.12);color: var(--yellow);border: 1px solid rgba(255,209,102,0.25); }
  .badge-muted  { background: rgba(74,96,112,0.20);  color: var(--muted); border: 1px solid var(--border); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  /* ── Buttons ── */
  button {
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    border: none;
    border-radius: 2px;
    padding: 8px 16px;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .btn-primary {
    background: var(--cyan);
    color: var(--bg);
  }
  .btn-primary:hover { background: #33eaff; box-shadow: 0 0 16px rgba(0,229,255,0.4); }
  .btn-secondary {
    background: transparent;
    color: var(--cyan);
    border: 1px solid var(--cyan-dim);
  }
  .btn-secondary:hover { border-color: var(--cyan); background: rgba(0,229,255,0.07); }
  .btn-danger {
    background: transparent;
    color: var(--red);
    border: 1px solid rgba(255,59,92,0.35);
  }
  .btn-danger:hover { border-color: var(--red); background: rgba(255,59,92,0.07); }
  .btn-ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .btn-ghost:hover { color: var(--text); border-color: var(--muted); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Inputs ── */
  input, select, textarea {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 2px;
    width: 100%;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--cyan-dim);
    box-shadow: 0 0 0 2px rgba(0,229,255,0.08);
  }
  input::placeholder { color: var(--muted); }
  label { display: block; color: var(--muted); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 5px; }

  /* ── Layout ── */
  .main { display: flex; flex: 1; }
  .sidebar {
    width: 220px;
    min-width: 220px;
    border-right: 1px solid var(--border);
    background: var(--surface);
    padding: 24px 0;
    position: sticky;
    top: 57px;
    height: calc(100vh - 57px);
    overflow-y: auto;
  }
  .nav-section { padding: 0 16px 8px; color: var(--muted); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 20px;
    cursor: pointer;
    color: var(--muted);
    transition: all 0.12s;
    border-left: 2px solid transparent;
    font-size: 12px;
  }
  .nav-item:hover { color: var(--text); background: rgba(0,229,255,0.04); }
  .nav-item.active { color: var(--cyan); border-left-color: var(--cyan); background: rgba(0,229,255,0.06); }
  .nav-icon { width: 16px; text-align: center; }

  .content { flex: 1; padding: 32px; max-width: 900px; }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .card-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(0,0,0,0.2);
  }
  .card-title {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    display: flex; align-items: center; gap: 8px;
  }
  .card-body { padding: 20px; }

  /* ── Grid ── */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .field { margin-bottom: 14px; }

  /* ── Identity display ── */
  .identity-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-box {
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 12px 14px;
  }
  .stat-label { color: var(--muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
  .stat-value { color: var(--text); font-size: 13px; font-weight: 500; }

  .hash-display {
    background: rgba(0,0,0,0.4);
    border: 1px solid var(--border);
    padding: 10px 14px;
    border-radius: 3px;
    font-size: 11px;
    color: var(--cyan-dim);
    word-break: break-all;
    letter-spacing: 0.04em;
  }

  /* ── Log ── */
  .log {
    background: rgba(0,0,0,0.5);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 12px 14px;
    max-height: 200px;
    overflow-y: auto;
    font-size: 11px;
  }
  .log-entry { display: flex; gap: 10px; padding: 2px 0; }
  .log-time { color: var(--muted); flex-shrink: 0; }
  .log-success { color: var(--green); }
  .log-error   { color: var(--red); }
  .log-info    { color: var(--cyan); }
  .log-warn    { color: var(--yellow); }

  /* ── Attribute table ── */
  .attr-row {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .attr-row:last-child { border-bottom: none; }
  .attr-name { color: var(--cyan); font-size: 12px; }

  /* ── Setup panel ── */
  .connect-panel {
    display: flex; align-items: center; justify-content: center;
    flex: 1; padding: 60px;
  }
  .connect-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 40px;
    text-align: center;
    max-width: 480px;
    width: 100%;
  }
  .connect-logo {
    font-family: var(--font-sans);
    font-size: 36px;
    font-weight: 800;
    color: var(--cyan);
    margin-bottom: 8px;
    text-shadow: 0 0 30px rgba(0,229,255,0.4);
  }
  .connect-sub { color: var(--muted); margin-bottom: 28px; font-size: 12px; line-height: 1.7; }
  .connect-field { margin-bottom: 14px; text-align: left; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
  .addr-chip {
    display: inline-block;
    background: rgba(0,229,255,0.08);
    border: 1px solid rgba(0,229,255,0.2);
    color: var(--cyan);
    padding: 4px 10px;
    border-radius: 2px;
    font-size: 11px;
  }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
  .tab {
    padding: 10px 18px;
    cursor: pointer;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 2px solid transparent;
    transition: all 0.12s;
    background: none;
    border-left: none; border-right: none; border-top: none;
    margin-bottom: -1px;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }

  /* ── Vote progress ── */
  .progress-bar {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin: 8px 0;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--cyan-dim), var(--cyan));
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  /* ── Section title ── */
  .section-title {
    font-family: var(--font-sans);
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }
  .section-sub { color: var(--muted); font-size: 12px; margin-bottom: 24px; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .glow { text-shadow: 0 0 20px rgba(0,229,255,0.5); }
  .mt8  { margin-top: 8px; }
  .mt16 { margin-top: 16px; }
  .flex { display: flex; }
  .gap8 { gap: 8px; }
  .gap12 { gap: 12px; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .w100 { width: 100%; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ts = () => new Date().toLocaleTimeString("en", { hour12: false });
const LEVEL_LABELS: Record<number, string> = { 0: "NONE", 1: "BASIC", 2: "KYC", 3: "FULL" };
const LEVEL_CLASSES: Record<number, string> = { 0: "badge-muted", 1: "badge-cyan", 2: "badge-yellow", 3: "badge-green" };

const ATTR_LABELS = ["name", "dob", "srn", "prn", "email", "phone", "govId", "photo"];

// ─── Components ───────────────────────────────────────────────────────────────

function Badge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className={`badge ${ok ? "badge-green" : "badge-red"}`}>
      <span className="dot" />
      {label ?? (ok ? "YES" : "NO")}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  return (
    <span className={`badge ${LEVEL_CLASSES[level] ?? "badge-muted"}`}>
      {LEVEL_LABELS[level] ?? level}
    </span>
  );
}

function Log({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="log">
      {entries.length === 0 ? (
        <span style={{ color: "var(--muted)" }}>// no activity yet</span>
      ) : (
        [...entries].reverse().map((e) => (
          <div key={e.id} className="log-entry">
            <span className="log-time">{e.time}</span>
            <span className={`log-${e.type}`}>{e.msg}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type Tab = "identity" | "attributes" | "verify" | "access" | "admin";

export default function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState("");
  const [contractAddr, setContractAddr] = useState(localStorage.getItem("contractAddr") ?? "");
  const [contractAddrInput, setContractAddrInput] = useState(localStorage.getItem("contractAddr") ?? "");
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>("identity");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logId, setLogId] = useState(0);

  // Identity state
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [lookupAddr, setLookupAddr] = useState("");
  const [lookedUpId, setLookedUpId] = useState<Identity | null>(null);

  // Register form
  const [regName, setRegName] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regSrn, setRegSrn] = useState("");
  const [regCid, setRegCid] = useState("QmPlaceholderCID");

  // Attribute form
  const [attrKey, setAttrKey] = useState("name");
  const [attrValue, setAttrValue] = useState("");
  const [attrCid, setAttrCid] = useState("QmAttrCID");
  const [attrKeys, setAttrKeys] = useState<Record<string, string>>({});

  // Verify form
  const [voteTarget, setVoteTarget] = useState("");
  const [voteLevel, setVoteLevel] = useState("2");
  const [isVerifier, setIsVerifier] = useState(false);
  const [verifierWeight, setVerifierWeight] = useState(0);
  const [requiredApprovals, setRequiredApprovals] = useState(0);

  // Access form
  const [accessService, setAccessService] = useState("");
  const [accessAttr, setAccessAttr] = useState("name");

  // Admin form
  const [adminVerifier, setAdminVerifier] = useState("");
  const [adminWeight, setAdminWeight] = useState("1");
  const [adminTarget, setAdminTarget] = useState("");
  const [adminRequired, setAdminRequired] = useState("3");
  const [isAdmin, setIsAdmin] = useState(false);

  const addLog = useCallback((type: LogEntry["type"], msg: string) => {
    setLogId((id) => {
      const next = id + 1;
      setLogs((l) => [...l.slice(-49), { id: next, time: ts(), type, msg }]);
      return next;
    });
  }, []);

  // ── Connect MetaMask ────────────────────────────────────────────────────────

  async function connectWallet() {
    if (!(window as any).ethereum) {
      addLog("error", "MetaMask not found — install it first");
      return;
    }
    try {
      const prov = new ethers.BrowserProvider((window as any).ethereum);
      await prov.send("eth_requestAccounts", []);
      const sgn = await prov.getSigner();
      const addr = await sgn.getAddress();
      setProvider(prov);
      setSigner(sgn);
      setAccount(addr);
      addLog("success", `Wallet connected: ${short(addr)}`);
      setConnected(true);
    } catch (e: any) {
      addLog("error", e.message ?? "Connection failed");
    }
  }

  function applyContract() {
    if (!signer || !contractAddrInput) return;
    try {
      const c = new ethers.Contract(contractAddrInput, ABI, signer);
      setContract(c);
      setContractAddr(contractAddrInput);
      localStorage.setItem("contractAddr", contractAddrInput);
      addLog("success", `Contract connected: ${short(contractAddrInput)}`);
    } catch (e: any) {
      addLog("error", "Invalid contract address");
    }
  }

  // ── Load identity & verifier info ───────────────────────────────────────────

  const loadMyIdentity = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const id = await contract.getIdentity(account);
      if (id.owner === ethers.ZeroAddress) { setIdentity(null); return; }
      setIdentity({
        identityHash: id.identityHash,
        ipfsCID: id.ipfsCID,
        owner: id.owner,
        createdAt: id.createdAt,
        updatedAt: id.updatedAt,
        isVerified: id.isVerified,
        isActive: id.isActive,
        verificationLevel: Number(id.verificationLevel),
        approvalWeight: Number(id.approvalWeight),
      });
    } catch { setIdentity(null); }
  }, [contract, account]);

  const loadVerifierStatus = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const iv = await contract.trustedVerifiers(account);
      const wt = iv ? Number(await contract.verifierWeights(account)) : 0;
      const ra = Number(await contract.requiredApprovals());
      setIsVerifier(iv);
      setVerifierWeight(wt);
      setRequiredApprovals(ra);
    } catch {}
  }, [contract, account]);

  const loadAdminStatus = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const adm = await contract.admin();
      setIsAdmin(adm.toLowerCase() === account.toLowerCase());
    } catch {}
  }, [contract, account]);

  const loadAttrKeys = useCallback(async () => {
    if (!contract) return;
    const keys: Record<string, string> = {};
    for (const k of ATTR_LABELS) {
      const fn = `ATTR_${k === "govId" ? "GOV_ID" : k.toUpperCase()}`;
      try { keys[k] = await (contract as any)[fn](); } catch {}
    }
    setAttrKeys(keys);
  }, [contract]);

  useEffect(() => {
    if (contract && account) {
      loadMyIdentity();
      loadVerifierStatus();
      loadAdminStatus();
      loadAttrKeys();
    }
  }, [contract, account]);

  // ── Register ────────────────────────────────────────────────────────────────

  async function registerIdentity() {
    if (!contract) return;
    try {
      const payload = `${regName}|${regDob}|${regSrn}`;
      const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      addLog("info", `Registering identity hash: ${hash.slice(0, 14)}…`);
      const tx = await contract.registerIdentity(hash, regCid);
      await tx.wait();
      addLog("success", "Identity registered on-chain");
      loadMyIdentity();
    } catch (e: any) {
      addLog("error", e.reason ?? e.message ?? "Registration failed");
    }
  }

  async function revokeIdentity() {
    if (!contract) return;
    try {
      const tx = await contract.revokeIdentity();
      await tx.wait();
      addLog("warn", "Identity revoked");
      loadMyIdentity();
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  // ── Attributes ──────────────────────────────────────────────────────────────

  async function setAttribute() {
    if (!contract || !attrValue) return;
    try {
      const nameHash = attrKeys[attrKey];
      if (!nameHash) { addLog("error", "Attribute key not loaded"); return; }
      const valueHash = ethers.keccak256(ethers.toUtf8Bytes(attrValue));
      const tx = await contract.setAttribute(nameHash, valueHash, attrCid);
      await tx.wait();
      addLog("success", `Attribute "${attrKey}" set`);
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  // ── Verify ──────────────────────────────────────────────────────────────────

  async function castVote() {
    if (!contract || !voteTarget) return;
    try {
      const tx = await contract.castVerificationVote(voteTarget, Number(voteLevel));
      await tx.wait();
      addLog("success", `Vote cast for ${short(voteTarget)} at level ${voteLevel}`);
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  async function lookupIdentity() {
    if (!contract || !lookupAddr) return;
    try {
      const id = await contract.getIdentity(lookupAddr);
      if (id.owner === ethers.ZeroAddress) {
        addLog("warn", "No identity found for that address");
        setLookedUpId(null); return;
      }
      setLookedUpId({
        identityHash: id.identityHash, ipfsCID: id.ipfsCID, owner: id.owner,
        createdAt: id.createdAt, updatedAt: id.updatedAt,
        isVerified: id.isVerified, isActive: id.isActive,
        verificationLevel: Number(id.verificationLevel),
        approvalWeight: Number(id.approvalWeight),
      });
      addLog("info", `Loaded identity for ${short(lookupAddr)}`);
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  // ── Access ──────────────────────────────────────────────────────────────────

  async function grantAccess() {
    if (!contract || !accessService) return;
    try {
      const nameHash = attrKeys[accessAttr];
      if (!nameHash) { addLog("error", "Attribute key not loaded"); return; }
      const tx = await contract.grantAttributeAccess(accessService, nameHash);
      await tx.wait();
      addLog("success", `Granted ${short(accessService)} access to "${accessAttr}"`);
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  async function revokeAccess() {
    if (!contract || !accessService) return;
    try {
      const nameHash = attrKeys[accessAttr];
      if (!nameHash) { addLog("error", "Attribute key not loaded"); return; }
      const tx = await contract.revokeAttributeAccess(accessService, nameHash);
      await tx.wait();
      addLog("warn", `Revoked ${short(accessService)} access to "${accessAttr}"`);
    } catch (e: any) {
      addLog("error", e.reason ?? e.message);
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async function addVerifier() {
    if (!contract || !adminVerifier) return;
    try {
      const tx = await contract.addTrustedVerifier(adminVerifier, Number(adminWeight));
      await tx.wait();
      addLog("success", `Verifier ${short(adminVerifier)} added (weight ${adminWeight})`);
      loadVerifierStatus();
    } catch (e: any) { addLog("error", e.reason ?? e.message); }
  }

  async function removeVerifier() {
    if (!contract || !adminVerifier) return;
    try {
      const tx = await contract.removeTrustedVerifier(adminVerifier);
      await tx.wait();
      addLog("warn", `Verifier ${short(adminVerifier)} removed`);
    } catch (e: any) { addLog("error", e.reason ?? e.message); }
  }

  async function setApprovals() {
    if (!contract) return;
    try {
      const tx = await contract.setRequiredApprovals(Number(adminRequired));
      await tx.wait();
      addLog("success", `Required approvals set to ${adminRequired}`);
      loadVerifierStatus();
    } catch (e: any) { addLog("error", e.reason ?? e.message); }
  }

  async function adminRevoke() {
    if (!contract || !adminTarget) return;
    try {
      const tx = await contract.adminRevokeIdentity(adminTarget);
      await tx.wait();
      addLog("warn", `Admin revoked identity of ${short(adminTarget)}`);
    } catch (e: any) { addLog("error", e.reason ?? e.message); }
  }

  async function adminReactivate() {
    if (!contract || !adminTarget) return;
    try {
      const tx = await contract.reactivateIdentity(adminTarget);
      await tx.wait();
      addLog("success", `Reactivated identity of ${short(adminTarget)}`);
    } catch (e: any) { addLog("error", e.reason ?? e.message); }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!connected || !contract) {
    return (
      <>
        <style>{css}</style>
        <div className="app">
          <div className="connect-panel">
            <div className="connect-card">
              <div className="connect-logo glow">IDCHAIN</div>
              <p style={{ color: "var(--cyan)", fontSize: 11, letterSpacing: "0.15em", marginBottom: 20 }}>
                DECENTRALIZED IDENTITY REGISTRY
              </p>
              <p className="connect-sub">
                Connect your MetaMask wallet and enter the deployed contract address to begin.
              </p>

              {!connected ? (
                <button className="btn-primary w100" onClick={connectWallet}>
                  ⬡ Connect MetaMask
                </button>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <span className="addr-chip">Connected: {short(account)}</span>
                  </div>
                  <hr className="divider" />
                  <div className="connect-field">
                    <label>Contract Address</label>
                    <input
                      value={contractAddrInput}
                      onChange={(e) => setContractAddrInput(e.target.value)}
                      placeholder="0x..."
                    />
                  </div>
                  <button className="btn-primary w100" onClick={applyContract}>
                    → Load Contract
                  </button>
                </>
              )}

              {logs.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <Log entries={logs} />
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* Header */}
        <header className="header">
          <div className="header-logo">
            ⬡ IDCHAIN
            <span>// {short(contractAddr)}</span>
          </div>
          <div className="header-right">
            {isAdmin && <span className="badge badge-yellow"><span className="dot" />ADMIN</span>}
            {isVerifier && <span className="badge badge-cyan"><span className="dot" />VERIFIER · W{verifierWeight}</span>}
            <span className="badge badge-green"><span className="dot" />{short(account)}</span>
          </div>
        </header>

        <div className="main">

          {/* Sidebar */}
          <nav className="sidebar">
            <div className="nav-section" style={{ marginBottom: 8 }}>Navigation</div>
            {([
              ["identity",   "◈", "My Identity"],
              ["attributes", "◎", "Attributes"],
              ["verify",     "◉", "Verify"],
              ["access",     "◐", "Access Control"],
              ["admin",      "◆", "Admin"],
            ] as [Tab, string, string][]).map(([id, icon, label]) => (
              <div
                key={id}
                className={`nav-item ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                <span className="nav-icon">{icon}</span>
                {label}
              </div>
            ))}

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
            <div className="nav-section" style={{ marginBottom: 8 }}>Activity</div>
            <div style={{ padding: "0 10px" }}>
              <Log entries={logs} />
            </div>
          </nav>

          {/* Content */}
          <main className="content">

            {/* ── IDENTITY TAB ─────────────────────────────────────────────── */}
            {tab === "identity" && (
              <>
                <div className="section-title">My Identity</div>
                <p className="section-sub">Register and manage your on-chain identity.</p>

                {identity ? (
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">◈ Identity Record</span>
                      <div className="flex gap8">
                        <Badge ok={identity.isActive} label={identity.isActive ? "ACTIVE" : "REVOKED"} />
                        <Badge ok={identity.isVerified} label={identity.isVerified ? "VERIFIED" : "UNVERIFIED"} />
                        <LevelBadge level={identity.verificationLevel} />
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="identity-grid">
                        <div className="stat-box">
                          <div className="stat-label">Owner</div>
                          <div className="stat-value">{short(identity.owner)}</div>
                        </div>
                        <div className="stat-box">
                          <div className="stat-label">Registered</div>
                          <div className="stat-value">
                            {new Date(Number(identity.createdAt) * 1000).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="stat-box">
                          <div className="stat-label">Approval Weight</div>
                          <div className="stat-value">
                            {identity.approvalWeight} / {requiredApprovals}
                          </div>
                        </div>
                      </div>

                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.min(100, (identity.approvalWeight / Math.max(requiredApprovals, 1)) * 100)}%` }}
                        />
                      </div>

                      <div className="field mt16">
                        <label>Identity Hash (on-chain)</label>
                        <div className="hash-display">{identity.identityHash}</div>
                      </div>
                      <div className="field">
                        <label>IPFS CID</label>
                        <div className="hash-display">{identity.ipfsCID}</div>
                      </div>

                      {identity.isActive && (
                        <div className="mt16">
                          <button className="btn-danger" onClick={revokeIdentity}>
                            ✕ Revoke My Identity
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">◈ Register New Identity</span>
                    </div>
                    <div className="card-body">
                      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 16 }}>
                        Your personal data is hashed locally — only the hash goes on-chain.
                      </p>
                      <div className="grid3">
                        <div className="field">
                          <label>Full Name</label>
                          <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Alice Sharma" />
                        </div>
                        <div className="field">
                          <label>Date of Birth</label>
                          <input type="date" value={regDob} onChange={e => setRegDob(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>SRN / PRN</label>
                          <input value={regSrn} onChange={e => setRegSrn(e.target.value)} placeholder="PES1UG21CS001" />
                        </div>
                      </div>
                      <div className="field">
                        <label>IPFS CID (encrypted document)</label>
                        <input value={regCid} onChange={e => setRegCid(e.target.value)} placeholder="QmYour..." />
                      </div>
                      {(regName || regDob || regSrn) && (
                        <div className="field">
                          <label>Identity Hash Preview (computed locally)</label>
                          <div className="hash-display">
                            {ethers.keccak256(ethers.toUtf8Bytes(`${regName}|${regDob}|${regSrn}`))}
                          </div>
                        </div>
                      )}
                      <button
                        className="btn-primary mt8"
                        onClick={registerIdentity}
                        disabled={!regName || !regDob || !regSrn}
                      >
                        → Register Identity
                      </button>
                    </div>
                  </div>
                )}

                {/* Lookup */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◈ Look Up Any Identity</span>
                  </div>
                  <div className="card-body">
                    <div className="flex gap8 items-center">
                      <input
                        value={lookupAddr}
                        onChange={e => setLookupAddr(e.target.value)}
                        placeholder="0x address to look up"
                        style={{ flex: 1 }}
                      />
                      <button className="btn-secondary" onClick={lookupIdentity}>Search</button>
                    </div>
                    {lookedUpId && (
                      <div style={{ marginTop: 16 }}>
                        <div className="identity-grid">
                          <div className="stat-box">
                            <div className="stat-label">Active</div>
                            <div className="stat-value"><Badge ok={lookedUpId.isActive} /></div>
                          </div>
                          <div className="stat-box">
                            <div className="stat-label">Verified</div>
                            <div className="stat-value"><Badge ok={lookedUpId.isVerified} /></div>
                          </div>
                          <div className="stat-box">
                            <div className="stat-label">Level</div>
                            <div className="stat-value"><LevelBadge level={lookedUpId.verificationLevel} /></div>
                          </div>
                        </div>
                        <div className="field mt8">
                          <label>Identity Hash</label>
                          <div className="hash-display">{lookedUpId.identityHash}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── ATTRIBUTES TAB ───────────────────────────────────────────── */}
            {tab === "attributes" && (
              <>
                <div className="section-title">Attributes</div>
                <p className="section-sub">Store hashes of personal attributes for selective disclosure.</p>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◎ Set Attribute</span>
                  </div>
                  <div className="card-body">
                    <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>
                      The raw value is hashed locally. Only <code style={{color:"var(--cyan)"}}>keccak256(value)</code> is stored on-chain.
                    </p>
                    <div className="grid2">
                      <div className="field">
                        <label>Attribute</label>
                        <select value={attrKey} onChange={e => setAttrKey(e.target.value)}>
                          {ATTR_LABELS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Value (hashed before storing)</label>
                        <input
                          value={attrValue}
                          onChange={e => setAttrValue(e.target.value)}
                          placeholder={attrKey === "dob" ? "1999-03-22" : attrKey === "email" ? "alice@example.com" : "value..."}
                        />
                      </div>
                    </div>
                    {attrValue && (
                      <div className="field">
                        <label>Hash Preview (what gets stored)</label>
                        <div className="hash-display">
                          {ethers.keccak256(ethers.toUtf8Bytes(attrValue))}
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <label>IPFS CID (encrypted raw attribute)</label>
                      <input value={attrCid} onChange={e => setAttrCid(e.target.value)} placeholder="QmAttr..." />
                    </div>
                    <button
                      className="btn-primary"
                      onClick={setAttribute}
                      disabled={!attrValue || !identity}
                    >
                      → Store Attribute Hash
                    </button>
                    {!identity && <span style={{ color: "var(--red)", marginLeft: 12, fontSize: 11 }}>Register identity first</span>}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◎ Standard Attribute Keys</span>
                  </div>
                  <div className="card-body">
                    <p style={{ color: "var(--muted)", fontSize: 11, marginBottom: 14 }}>
                      These are the <code style={{color:"var(--cyan)"}}>bytes32</code> keys used to identify attributes on-chain.
                    </p>
                    {ATTR_LABELS.map(k => (
                      <div key={k} className="attr-row">
                        <span className="attr-name">{k}</span>
                        <span className="hash-display" style={{ fontSize: 10 }}>
                          {attrKeys[k] ?? "loading…"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── VERIFY TAB ───────────────────────────────────────────────── */}
            {tab === "verify" && (
              <>
                <div className="section-title">Verification</div>
                <p className="section-sub">Cast weighted votes to verify identities.</p>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◉ Your Verifier Status</span>
                  </div>
                  <div className="card-body">
                    <div className="grid3">
                      <div className="stat-box">
                        <div className="stat-label">Is Verifier</div>
                        <div className="stat-value"><Badge ok={isVerifier} /></div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-label">Voting Weight</div>
                        <div className="stat-value" style={{ color: "var(--cyan)" }}>{isVerifier ? verifierWeight : "—"}</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-label">Required Threshold</div>
                        <div className="stat-value" style={{ color: "var(--yellow)" }}>{requiredApprovals}</div>
                      </div>
                    </div>
                    {!isVerifier && (
                      <p style={{ color: "var(--yellow)", fontSize: 11, marginTop: 12 }}>
                        ⚠ Your account is not a trusted verifier. Ask the admin to add you.
                      </p>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◉ Cast Verification Vote</span>
                  </div>
                  <div className="card-body">
                    <div className="grid2">
                      <div className="field">
                        <label>User Address to Verify</label>
                        <input value={voteTarget} onChange={e => setVoteTarget(e.target.value)} placeholder="0x..." />
                      </div>
                      <div className="field">
                        <label>Verification Level</label>
                        <select value={voteLevel} onChange={e => setVoteLevel(e.target.value)}>
                          <option value="1">1 — Basic</option>
                          <option value="2">2 — KYC</option>
                          <option value="3">3 — Full</option>
                        </select>
                      </div>
                    </div>
                    <button
                      className="btn-primary"
                      onClick={castVote}
                      disabled={!isVerifier || !voteTarget}
                    >
                      → Cast Vote
                    </button>
                    {!isVerifier && <span style={{ color: "var(--red)", marginLeft: 12, fontSize: 11 }}>Not a verifier</span>}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◉ Check Identity Status</span>
                  </div>
                  <div className="card-body">
                    <div className="flex gap8 items-center">
                      <input
                        value={lookupAddr}
                        onChange={e => setLookupAddr(e.target.value)}
                        placeholder="0x address"
                        style={{ flex: 1 }}
                      />
                      <button className="btn-secondary" onClick={lookupIdentity}>Lookup</button>
                    </div>
                    {lookedUpId && (
                      <div style={{ marginTop: 14 }}>
                        <div className="identity-grid">
                          <div className="stat-box">
                            <div className="stat-label">Verified</div>
                            <div className="stat-value"><Badge ok={lookedUpId.isVerified} /></div>
                          </div>
                          <div className="stat-box">
                            <div className="stat-label">Weight / Threshold</div>
                            <div className="stat-value">{lookedUpId.approvalWeight} / {requiredApprovals}</div>
                          </div>
                          <div className="stat-box">
                            <div className="stat-label">Level</div>
                            <div className="stat-value"><LevelBadge level={lookedUpId.verificationLevel} /></div>
                          </div>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(100, (lookedUpId.approvalWeight / Math.max(requiredApprovals, 1)) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── ACCESS CONTROL TAB ───────────────────────────────────────── */}
            {tab === "access" && (
              <>
                <div className="section-title">Access Control</div>
                <p className="section-sub">Grant or revoke service providers' access to your attribute hashes.</p>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◐ Grant / Revoke Attribute Access</span>
                  </div>
                  <div className="card-body">
                    <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>
                      The service address must call <code style={{ color: "var(--cyan)" }}>getAttribute()</code> to read your hash.
                      They verify your claim by hashing the value you provide off-chain.
                    </p>
                    <div className="grid2">
                      <div className="field">
                        <label>Service Address</label>
                        <input value={accessService} onChange={e => setAccessService(e.target.value)} placeholder="0x bank / portal address" />
                      </div>
                      <div className="field">
                        <label>Attribute</label>
                        <select value={accessAttr} onChange={e => setAccessAttr(e.target.value)}>
                          {ATTR_LABELS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap8 mt8">
                      <button className="btn-primary" onClick={grantAccess} disabled={!accessService || !identity}>
                        ✓ Grant Access
                      </button>
                      <button className="btn-danger" onClick={revokeAccess} disabled={!accessService || !identity}>
                        ✕ Revoke Access
                      </button>
                    </div>
                    {!identity && <p style={{ color: "var(--red)", fontSize: 11, marginTop: 8 }}>Register identity first</p>}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◐ How Selective Disclosure Works</span>
                  </div>
                  <div className="card-body">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      {[
                        ["1. Store hash", "You store keccak256(value) for each attribute on-chain"],
                        ["2. Grant service", "You allow a specific service address to read a specific attribute hash"],
                        ["3. Service verifies", "Service hashes your claimed value and compares — match = confirmed"],
                      ].map(([title, desc]) => (
                        <div key={title} className="stat-box">
                          <div style={{ color: "var(--cyan)", fontSize: 11, marginBottom: 6 }}>{title}</div>
                          <div style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── ADMIN TAB ────────────────────────────────────────────────── */}
            {tab === "admin" && (
              <>
                <div className="section-title">Admin Panel</div>
                <p className="section-sub">Manage verifiers and identity lifecycle. Admin only.</p>

                {!isAdmin && (
                  <div style={{ background: "rgba(255,59,92,0.08)", border: "1px solid rgba(255,59,92,0.25)", borderRadius: 3, padding: "12px 16px", marginBottom: 20, color: "var(--red)", fontSize: 12 }}>
                    ✕ Connected wallet is not the admin. These actions will revert.
                  </div>
                )}

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◆ Verifier Management</span>
                  </div>
                  <div className="card-body">
                    <div className="grid2">
                      <div className="field">
                        <label>Verifier Address</label>
                        <input value={adminVerifier} onChange={e => setAdminVerifier(e.target.value)} placeholder="0x..." />
                      </div>
                      <div className="field">
                        <label>Weight</label>
                        <input type="number" min="1" max="10" value={adminWeight} onChange={e => setAdminWeight(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap8">
                      <button className="btn-primary" onClick={addVerifier} disabled={!adminVerifier}>+ Add Verifier</button>
                      <button className="btn-danger" onClick={removeVerifier} disabled={!adminVerifier}>− Remove Verifier</button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◆ Verification Threshold</span>
                  </div>
                  <div className="card-body">
                    <div className="flex gap8 items-center">
                      <div style={{ flex: 1 }}>
                        <label>Required Approval Weight</label>
                        <input type="number" min="1" value={adminRequired} onChange={e => setAdminRequired(e.target.value)} />
                      </div>
                      <button className="btn-secondary" style={{ marginTop: 18 }} onClick={setApprovals}>Set Threshold</button>
                    </div>
                    <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
                      Current threshold: <span style={{ color: "var(--yellow)" }}>{requiredApprovals}</span>
                    </p>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">◆ Identity Lifecycle</span>
                  </div>
                  <div className="card-body">
                    <div className="field">
                      <label>Target User Address</label>
                      <input value={adminTarget} onChange={e => setAdminTarget(e.target.value)} placeholder="0x..." />
                    </div>
                    <div className="flex gap8">
                      <button className="btn-danger" onClick={adminRevoke} disabled={!adminTarget}>Force Revoke</button>
                      <button className="btn-secondary" onClick={adminReactivate} disabled={!adminTarget}>Reactivate</button>
                    </div>
                  </div>
                </div>
              </>
            )}

          </main>
        </div>
      </div>
    </>
  );
}
