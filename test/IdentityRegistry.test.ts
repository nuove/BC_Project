import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

describe("IdentityRegistry", async () => {
  let viem: any;
  let registry: any;
  let admin: any, verifier1: any, verifier2: any, user: any, bank: any;

  beforeEach(async () => {
    ({ viem } = await network.connect());
    [admin, verifier1, verifier2, user, bank] = await viem.getWalletClients();

    registry = await viem.deployContract("IdentityRegistry");
    await registry.write.setRequiredApprovals([2]);
    await registry.write.addTrustedVerifier([verifier1.account.address, 1]);
    await registry.write.addTrustedVerifier([verifier2.account.address, 1]);
  });

  const asUser = async (v: any, w: any) =>
    v.getContractAt("IdentityRegistry", (await v.deployContract("IdentityRegistry")).address);

  it("registers an identity", async () => {
    const r = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: user } });
    const hash = keccak256(toBytes("Alice|2001-07-14|SRN001"));
    await r.write.registerIdentity([hash, "QmCID"]);

    const id = await registry.read.getIdentity([user.account.address]);
    assert.equal(id[2].toLowerCase(), user.account.address.toLowerCase());
    assert.equal(id[5], false);  // isVerified
    assert.equal(id[6], true);   // isActive
  });

  it("verifies after 2 votes", async () => {
    const r = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: user } });
    await r.write.registerIdentity([keccak256(toBytes("Alice|2001-07-14|SRN001")), "QmCID"]);

    const rv1 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier1 } });
    const rv2 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier2 } });

    await rv1.write.castVerificationVote([user.account.address, 2]);
    assert.equal((await registry.read.getIdentity([user.account.address]))[5], false);

    await rv2.write.castVerificationVote([user.account.address, 2]);
    assert.equal(await registry.read.isVerifiedAndActive([user.account.address]), true);
  });

  it("resets verification after update", async () => {
    const r = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: user } });
    await r.write.registerIdentity([keccak256(toBytes("Alice|2001-07-14|SRN001")), "QmCID"]);

    const rv1 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier1 } });
    const rv2 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier2 } });
    await rv1.write.castVerificationVote([user.account.address, 2]);
    await rv2.write.castVerificationVote([user.account.address, 2]);

    await r.write.updateIdentity([keccak256(toBytes("Alice Singh|2001-07-14|SRN001")), "QmNewCID"]);
    assert.equal((await registry.read.getIdentity([user.account.address]))[5], false);
  });

  it("revokes and blocks voting", async () => {
    const r = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: user } });
    await r.write.registerIdentity([keccak256(toBytes("Alice|2001-07-14|SRN001")), "QmCID"]);
    await r.write.revokeIdentity();

    assert.equal((await registry.read.getIdentity([user.account.address]))[6], false);

    const rv1 = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: verifier1 } });
    await assert.rejects(
      () => rv1.write.castVerificationVote([user.account.address, 2]),
      /Identity is revoked/
    );
  });

  it("enforces attribute access control", async () => {
  const r = await viem.getContractAt("IdentityRegistry", registry.address, { client: { wallet: user } });
  await r.write.registerIdentity([keccak256(toBytes("Alice|2001-07-14|SRN001")), "QmCID"]);

  const ATTR_DOB = await registry.read.ATTR_DOB();
  const dobHash  = keccak256(toBytes("2001-07-14"));
  await r.write.setAttribute([ATTR_DOB, dobHash, "QmDobCID"]);

  // Bank can't read before access is granted
  await assert.rejects(
    () => registry.read.getAttribute([user.account.address, ATTR_DOB], { account: bank.account.address }),
    /Access denied/
  );

  // Grant access, now bank can read
  await r.write.grantAttributeAccess([bank.account.address, ATTR_DOB]);
  const result = await registry.read.getAttribute(
    [user.account.address, ATTR_DOB],
    { account: bank.account.address }
  );
  assert.equal(result, dobHash);

  // Revoke access, bank is blocked again
  await r.write.revokeAttributeAccess([bank.account.address, ATTR_DOB]);
  await assert.rejects(
    () => registry.read.getAttribute([user.account.address, ATTR_DOB], { account: bank.account.address }),
    /Access denied/
  );
});
});
