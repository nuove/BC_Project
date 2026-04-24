# Decentralized Identity Verification System

A prototype decentralized identity verification system built with Solidity (Hardhat), IPFS for encrypted off-chain storage, and a React + ethers.js frontend.

## Overview

This repository contains smart contracts, deployment scripts, and a prototype interface for registering digital identities, storing encrypted attributes on IPFS, selectively disclosing attributes to service providers, and a weighted multi-verifier system for identity verification.

## Quickstart

Prerequisites
- Node.js (recommended LTS 18.x or 20.x)
- npm

Install dependencies

```bash
npm install
```

Compile contracts

```bash
npx hardhat compile
```

Run tests

```bash
npx hardhat test
```

Run a local node (separate terminal)

```bash
npx hardhat node
```

Deploy locally (after starting node)

```bash
npx hardhat run --network localhost scripts/deploy_and_authorize.js
```

Notes
- Hardhat may warn that Node 25 is unsupported. Use Node LTS (18 or 20) if you see issues.
- The deploy script deploys IdentityRegistry and IdentityVerifier and authorizes the verifier-manager on the registry.

## Project structure
- contracts/ - Solidity smart contracts (IdentityRegistry.sol, IdentityVerifier.sol, AccessControl.sol)
- scripts/ - deployment scripts (deploy_and_authorize.js)
- test/ - tests (add Hardhat tests here)
- MiniProjectReport.md - project report and documentation

## Report
See MiniProjectReport.md for full project report, smart contract design, implementation details, testing plan, and security analysis.

## License
Unlicense

