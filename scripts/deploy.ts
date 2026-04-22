import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

async function main() {
  const { viem } = await network.connect();

  const wallets = await viem.getWalletClients();
  const [admin, verifier1, verifier2, verifier3, user, bank] = wallets;

  const registry = await viem.deployContract("IdentityRegistry");
  console.log("Deployed to:", registry.address);

  await registry.write.setRequiredApprovals([2]);
  await registry.write.addTrustedVerifier([verifier1.account.address, 1]);
  await registry.write.addTrustedVerifier([verifier2.account.address, 1]);
  await registry.write.addTrustedVerifier([verifier3.account.address, 1]);
  console.log("Verifiers added.");

  const identityHash = keccak256(toBytes("Alice|2001-07-14|PES1UG21CS001"));

  // Get a contract instance connected as `user`
  const registryAsUser = await viem.getContractAt("IdentityRegistry", registry.address, {
    client: { wallet: user }
  });

  await registryAsUser.write.registerIdentity([identityHash, "QmTestCID"]);
  console.log("Identity registered for:", user.account.address);

  const ATTR_DOB  = await registry.read.ATTR_DOB();
  const ATTR_SRN  = await registry.read.ATTR_SRN();
  const ATTR_NAME = await registry.read.ATTR_NAME();

  await registryAsUser.write.setAttribute([ATTR_DOB,  keccak256(toBytes("2001-07-14")),    "QmDobCID"]);
  await registryAsUser.write.setAttribute([ATTR_SRN,  keccak256(toBytes("PES1UG21CS001")), "QmSrnCID"]);
  await registryAsUser.write.setAttribute([ATTR_NAME, keccak256(toBytes("Alice Kumar")),   "QmNameCID"]);
  console.log("Attributes set.");

  const registryAsV1 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier1 } });
  const registryAsV2 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier2 } });

  await registryAsV1.write.castVerificationVote([user.account.address, 2]);
  await registryAsV2.write.castVerificationVote([user.account.address, 2]);
  console.log("Votes cast.");

  const verified = await registry.read.isVerifiedAndActive([user.account.address]);
  console.log("isVerifiedAndActive:", verified);

  await registryAsUser.write.grantAttributeAccess([bank.account.address, ATTR_DOB]);

  const registryAsBank = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: bank } });
  const storedHash = await registryAsBank.read.getAttribute([user.account.address, ATTR_DOB]);
  const match = storedHash === keccak256(toBytes("2001-07-14"));
  console.log("Bank DOB verification:", match ? "✅ Passed" : "❌ Failed");
}

main().catch((err) => { console.error(err); process.exit(1); });
