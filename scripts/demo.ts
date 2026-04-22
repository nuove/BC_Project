import { network } from "hardhat";
import { keccak256, toBytes } from "viem";
import chalk from "chalk";
import Table from "cli-table3";

const h = (s: string) => keccak256(toBytes(s));
const as = async (viem: any, address: string, wallet: any) =>
  viem.getContractAt("IdentityRegistry", address, { client: { wallet } });

function section(title: string) {
  const width = 62;
  const pad = Math.floor((width - title.length - 2) / 2);
  const line = "─".repeat(width);
  console.log("\n" + chalk.cyan(line));
  console.log(chalk.cyan("│") + " ".repeat(pad) + chalk.bold.white(title) + " ".repeat(width - pad - title.length - 2) + chalk.cyan(" │"));
  console.log(chalk.cyan(line));
}

const ok      = (l: string, v: any) => console.log("  " + chalk.green("✔") + " " + chalk.gray(l.padEnd(38)) + chalk.white(String(v)));
const info    = (l: string, v: any) => console.log("  " + chalk.blue("ℹ") + " " + chalk.gray(l.padEnd(38)) + chalk.cyan(String(v)));
const warn    = (l: string, v: any) => console.log("  " + chalk.yellow("⚠") + " " + chalk.gray(l.padEnd(38)) + chalk.yellow(String(v)));
const blocked = (l: string, m: string) => console.log("  " + chalk.red("✘") + " " + chalk.gray(l.padEnd(38)) + chalk.red(m));
const txOk    = (fn: string) => console.log("  " + chalk.green("↳") + " " + chalk.dim(`${fn}() `) + chalk.green("confirmed"));
const shortAddr = (a: string) => chalk.yellow(a.slice(0,6) + "…" + a.slice(-4));
const boolBadge = (v: boolean) => v ? chalk.bgGreen.black(" YES ") : chalk.bgRed.white(" NO  ");
const levelBadge = (n: number) => {
  const labels: Record<number,string> = {0:"NONE",1:"BASIC",2:"KYC",3:"FULL"};
  const colors: Record<number,chalk.Chalk> = {0:chalk.bgGray.white,1:chalk.bgBlue.white,2:chalk.bgYellow.black,3:chalk.bgGreen.black};
  return (colors[n]??chalk.bgGray.white)(` ${labels[n]??n} `);
};

async function main() {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  const [admin,bankVerif,govVerif,uniVerif,alice,bob,carol,dave,bankSvc,govSvc] = wallets;

  section("DEPLOYMENT");
  const registry = await viem.deployContract("IdentityRegistry");
  ok("Contract deployed", shortAddr(registry.address));
  ok("Admin account",     shortAddr(admin.account.address));

  section("VERIFIER SETUP  (threshold = 3)");
  await registry.write.setRequiredApprovals([3]);
  await registry.write.addTrustedVerifier([bankVerif.account.address, 2]);
  await registry.write.addTrustedVerifier([govVerif.account.address,  3]);
  await registry.write.addTrustedVerifier([uniVerif.account.address,  1]);

  const vt = new Table({ head:[chalk.bold("Verifier"),chalk.bold("Role"),chalk.bold("Address"),chalk.bold("Weight")], colWidths:[10,22,16,10], style:{border:["cyan"]} });
  vt.push(
    [chalk.white("Bank"), chalk.gray("Financial authority"), shortAddr(bankVerif.account.address), chalk.yellow("2")],
    [chalk.white("Govt"), chalk.gray("Government portal"),   shortAddr(govVerif.account.address),  chalk.yellow("3")],
    [chalk.white("Uni"),  chalk.gray("University registry"), shortAddr(uniVerif.account.address),  chalk.yellow("1")],
  );
  console.log(vt.toString());
  info("Verification rule", "Bank+Uni (2+1=3)  OR  Govt alone (3)");

  const ATTR_NAME   = await registry.read.ATTR_NAME();
  const ATTR_DOB    = await registry.read.ATTR_DOB();
  const ATTR_SRN    = await registry.read.ATTR_SRN();
  const ATTR_EMAIL  = await registry.read.ATTR_EMAIL();
  const ATTR_GOV_ID = await registry.read.ATTR_GOV_ID();
  const ATTR_PHONE  = await registry.read.ATTR_PHONE();

  // ── ALICE ──────────────────────────────────────────────────────────────────
  section("ALICE SHARMA — Full KYC Verification");

  const aliceData = { name:"Alice Sharma", dob:"1999-03-22", srn:"PES1UG19CS042", email:"alice@pesu.edu.in", govId:"7891-4321-8765" };
  const at = new Table({ head:[chalk.bold("Attribute"),chalk.bold("Value"),chalk.bold("On-chain")], colWidths:[12,22,16], style:{border:["cyan"]} });
  for (const [k,v] of Object.entries(aliceData)) at.push([chalk.white(k),chalk.gray(v),chalk.dim("keccak256 only")]);
  console.log(at.toString());

  const aliceR = await as(viem, registry.address, alice);
  await aliceR.write.registerIdentity([h(Object.values(aliceData).join("|")), "QmAliceIdentityCID"]);
  txOk("registerIdentity");
  await aliceR.write.setAttribute([ATTR_NAME,   h(aliceData.name),  "QmAliceNameCID"]);
  await aliceR.write.setAttribute([ATTR_DOB,    h(aliceData.dob),   "QmAliceDobCID"]);
  await aliceR.write.setAttribute([ATTR_SRN,    h(aliceData.srn),   "QmAliceSrnCID"]);
  await aliceR.write.setAttribute([ATTR_EMAIL,  h(aliceData.email), "QmAliceEmailCID"]);
  await aliceR.write.setAttribute([ATTR_GOV_ID, h(aliceData.govId), "QmAliceGovCID"]);
  txOk("setAttribute ×5");
  console.log();

  info("Bank verifier votes (weight 2)...", "");
  const bankVerifR = await as(viem, registry.address, bankVerif);
  await bankVerifR.write.castVerificationVote([alice.account.address, 2]);
  let id = await registry.read.getIdentity([alice.account.address]);
  warn("Accumulated weight", `${id[8]} / 3  — below threshold`);

  info("University verifier votes (weight 1)...", "");
  const uniVerifR = await as(viem, registry.address, uniVerif);
  await uniVerifR.write.castVerificationVote([alice.account.address, 2]);
  id = await registry.read.getIdentity([alice.account.address]);
  ok("Accumulated weight",  `${id[8]} / 3  — threshold reached!`);
  ok("Identity verified",   boolBadge(id[5]) + "  Level: " + levelBadge(Number(id[7])));
  console.log();

  info("Alice grants Bank access to: name, dob only", "");
  await aliceR.write.grantAttributeAccess([bankSvc.account.address, ATTR_NAME]);
  await aliceR.write.grantAttributeAccess([bankSvc.account.address, ATTR_DOB]);
  txOk("grantAttributeAccess ×2");

  const bankSvcR = await as(viem, registry.address, bankSvc);
  const storedDob = await bankSvcR.read.getAttribute([alice.account.address, ATTR_DOB], { account: bankSvc.account.address });
  ok("Bank verifies DOB claim", storedDob === h(aliceData.dob) ? "✅  Hash match — confirmed" : "❌  Mismatch");
  try {
    await bankSvcR.read.getAttribute([alice.account.address, ATTR_SRN], { account: bankSvc.account.address });
  } catch { blocked("Bank reads SRN (not granted)", "Access denied — selective disclosure enforced"); }

  // ── BOB ────────────────────────────────────────────────────────────────────
  section("BOB MEHTA — Identity Update + Re-verification");

  const bobR = await as(viem, registry.address, bob);
  await bobR.write.registerIdentity([h("Bob Mehta|2000-11-05|PES2UG20EC101"), "QmBobIdentityCID"]);
  txOk("registerIdentity");
  const govVerifR = await as(viem, registry.address, govVerif);
  await govVerifR.write.castVerificationVote([bob.account.address, 3]);
  id = await registry.read.getIdentity([bob.account.address]);
  ok("Govt vote (weight 3) — verified", boolBadge(id[5]) + "  Level: " + levelBadge(Number(id[7])));
  console.log();

  warn("Bob changes legal name → must update identity", "");
  await bobR.write.updateIdentity([h("Bob Mehta-Nair|2000-11-05|PES2UG20EC101"), "QmBobUpdatedCID"]);
  txOk("updateIdentity");
  id = await registry.read.getIdentity([bob.account.address]);
  blocked("Verification reset", `isVerified = ${id[5]}  (re-verification required)`);
  console.log();

  await govVerifR.write.castVerificationVote([bob.account.address, 3]);
  id = await registry.read.getIdentity([bob.account.address]);
  ok("Bob re-verified", boolBadge(id[5]) + "  Level: " + levelBadge(Number(id[7])));

  // ── CAROL ──────────────────────────────────────────────────────────────────
  section("CAROL D'SOUZA — Revocation & Reactivation");

  const carolR = await as(viem, registry.address, carol);
  await carolR.write.registerIdentity([h("Carol D'Souza|1998-07-14|PES1UG18ME055"), "QmCarolIdentityCID"]);
  await govVerifR.write.castVerificationVote([carol.account.address, 3]);
  id = await registry.read.getIdentity([carol.account.address]);
  ok("Carol verified", boolBadge(id[5]));
  console.log();

  warn("Key compromised — Carol self-revokes", "");
  await carolR.write.revokeIdentity();
  txOk("revokeIdentity");
  id = await registry.read.getIdentity([carol.account.address]);
  blocked("isActive after revoke",      String(id[6]));
  blocked("isVerifiedAndActive",        String(await registry.read.isVerifiedAndActive([carol.account.address])));
  try {
    await govVerifR.write.castVerificationVote([carol.account.address, 3]);
  } catch { blocked("Vote on revoked identity", "Reverted — Identity is revoked"); }
  console.log();

  info("Admin reactivates Carol's account", "");
  await registry.write.reactivateIdentity([carol.account.address]);
  txOk("reactivateIdentity");
  id = await registry.read.getIdentity([carol.account.address]);
  ok("isActive restored",  boolBadge(id[6]));
  warn("isVerified reset",  boolBadge(id[5]) + "  (must re-verify)");

  // ── DAVE ───────────────────────────────────────────────────────────────────
  section("DAVE KRISHNAN — Insufficient Votes (Threshold Not Met)");

  const daveR = await as(viem, registry.address, dave);
  await daveR.write.registerIdentity([h("Dave Krishnan|2001-01-30|PES2UG21AI009"), "QmDaveIdentityCID"]);
  txOk("registerIdentity");
  await uniVerifR.write.castVerificationVote([dave.account.address, 1]);
  id = await registry.read.getIdentity([dave.account.address]);

  const dvt = new Table({ head:[chalk.bold("Verifier"),chalk.bold("Weight Added"),chalk.bold("Total"),chalk.bold("Threshold"),chalk.bold("Result")], colWidths:[12,14,9,12,18], style:{border:["cyan"]} });
  dvt.push([chalk.white("University"), chalk.yellow("+1"), chalk.yellow(String(id[8])), chalk.white("3"), chalk.red("⚠  Not reached")]);
  console.log(dvt.toString());
  blocked("isVerified",           String(id[5]));
  blocked("isVerifiedAndActive",  String(await registry.read.isVerifiedAndActive([dave.account.address])));
  info("Dave cannot access any service until weight ≥ 3", "");

  // ── GOVT PORTAL ────────────────────────────────────────────────────────────
  section("GOVT PORTAL — Multi-Attribute Selective Disclosure");

  await aliceR.write.setAttribute([ATTR_PHONE, h("+91-9876543210"), "QmAlicePhoneCID"]);
  await aliceR.write.grantAttributeAccess([govSvc.account.address, ATTR_NAME]);
  await aliceR.write.grantAttributeAccess([govSvc.account.address, ATTR_GOV_ID]);
  await aliceR.write.grantAttributeAccess([govSvc.account.address, ATTR_PHONE]);
  info("Alice grants Govt portal: name, govId, phone", "");

  const govSvcR = await as(viem, registry.address, govSvc);
  const rt = new Table({ head:[chalk.bold("Attribute"),chalk.bold("Claimed"),chalk.bold("Result")], colWidths:[12,24,16], style:{border:["cyan"]} });

  const checks: [string, any, string][] = [
    ["name",  ATTR_NAME,   aliceData.name],
    ["govId", ATTR_GOV_ID, aliceData.govId],
    ["phone", ATTR_PHONE,  "+91-9876543210"],
  ];
  for (const [label, key, val] of checks) {
    const stored = await govSvcR.read.getAttribute([alice.account.address, key], { account: govSvc.account.address });
    rt.push([chalk.white(label), chalk.gray(val), stored === h(val) ? chalk.green("✔  Hash match") : chalk.red("✘  Mismatch")]);
  }
  console.log(rt.toString());

  await aliceR.write.revokeAttributeAccess([govSvc.account.address, ATTR_PHONE]);
  try {
    await govSvcR.read.getAttribute([alice.account.address, ATTR_PHONE], { account: govSvc.account.address });
  } catch { blocked("Govt reads phone after revoke", "Access denied — revocation is immediate"); }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  section("FINAL STATE SUMMARY");

  const st = new Table({
    head: [chalk.bold("User"), chalk.bold("Address"), chalk.bold("Active"), chalk.bold("Verified"), chalk.bold("Level"), chalk.bold("Weight")],
    colWidths: [10,16,10,12,10,10],
    style: { border: ["cyan"] },
  });
  for (const [name, wallet] of [["Alice",alice],["Bob",bob],["Carol",carol],["Dave",dave]] as [string,any][]) {
    const d = await registry.read.getIdentity([wallet.account.address]);
    st.push([chalk.bold.white(name), shortAddr(wallet.account.address), boolBadge(d[6]), boolBadge(d[5]), levelBadge(Number(d[7])), chalk.yellow(String(d[8]))]);
  }
  console.log(st.toString());
  console.log();
}

main().catch((err) => { console.error(err); process.exit(1); });