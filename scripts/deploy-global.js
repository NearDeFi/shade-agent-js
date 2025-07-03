import { execSync } from 'child_process';
import fs from 'fs';
import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: '../docker-api/.env.development.local' });
} else {
    // load .env in production
    dotenv.config();
}
import { parseSeedPhrase } from 'near-seed-phrase';
import * as nearAPI from 'near-api-js';
const {
    Near,
    Account,
    KeyPair,
    keyStores,
    utils: {
        PublicKey,
        format: { parseNearAmount },
    },
} = nearAPI;

// local vars for module
const _contractId = process.env.NEXT_PUBLIC_contractId.replaceAll('"', '');
export const contractId = _contractId;

const IS_SANDBOX = /sandbox/gim.test(contractId);
// deploy the contract bytes NOT the global contract if this is set... to anything
const DEPLOY_BYTES = process.env.DEPLOY_BYTES;
// default codehash is "proxy" for local development, contract will NOT verify anything in register_worker
const API_CODEHASH = process.env.API_CODEHASH || 'api';
const APP_CODEHASH = process.env.APP_CODEHASH || 'proxy';
const GLOBAL_CONTRACT_HASH = IS_SANDBOX
    ? '7YNvcAExky2iRBxJa5wEPofG9ddgmRLDCGHGFAuvBbL2'
    : '2pSLLgLnAM9PYD7Rj6SpdK9tJRz48GQ7GrnAXK6tmm8u';
const HD_PATH = `"m/44'/397'/0'"`;
const FUNDING_AMOUNT = parseNearAmount('1');
const GAS = BigInt('300000000000000');

export const networkId = /testnet/gi.test(contractId) ? 'testnet' : 'mainnet';
// setup keystore, set funding account and key
let _accountId = process.env.NEAR_ACCOUNT_ID.replaceAll('"', '');
// console.log('accountId, contractId', _accountId, _contractId);
const { secretKey } = parseSeedPhrase(
    process.env.NEAR_SEED_PHRASE.replaceAll('"', ''),
);
const keyStore = new keyStores.InMemoryKeyStore();
const keyPair = KeyPair.fromString(secretKey);
keyStore.setKey(networkId, _accountId, keyPair);
keyStore.setKey(networkId, _contractId, keyPair);

const config =
    networkId === 'testnet'
        ? {
              networkId,
              keyStore,
              nodeUrl: 'https://rpc.testnet.near.org',
              walletUrl: 'https://testnet.mynearwallet.com/',
              explorerUrl: 'https://testnet.nearblocks.io',
          }
        : {
              networkId,
              keyStore,
              nodeUrl: 'https://rpc.near.org',
              walletUrl: 'https://mynearwallet.com/',
              explorerUrl: 'https://nearblocks.io',
          };
const near = new Near(config);
const { connection } = near;
const { provider } = connection;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const getAccount = (id = _accountId) => new Account(connection, id);

async function deploy() {
    const accountId = _accountId;
    try {
        const account = getAccount(contractId);
        await account.deleteAccount(accountId);
    } catch (e) {
        console.log('error deleteAccount', e);
    }

    console.log('contract account deleted:', contractId);
    await sleep(1000);

    try {
        const account = getAccount(accountId);
        await account.createAccount(
            contractId,
            keyPair.getPublicKey(),
            FUNDING_AMOUNT,
        );
    } catch (e) {
        console.log('error createAccount', e);
    }

    console.log('contract account created:', contractId);
    await sleep(1000);

    let account = getAccount(contractId);
    if (DEPLOY_BYTES) {
        // deploys the contract bytes (original method and requires more funding)
        const file = fs.readFileSync(
            `./contracts/${
                APP_CODEHASH === 'proxy' ? 'proxy' : 'sandbox'
            }/target/near/contract.wasm`,
        );
        await account.deployContract(file);
        console.log('deployed bytes', file.byteLength);
        const balance = await account.getAccountBalance();
        console.log('contract balance', balance);
    } else {
        // deploys global contract using near-cli command
        try {
            execSync(
                `near contract deploy ${contractId} use-global-hash ${GLOBAL_CONTRACT_HASH} without-init-call network-config testnet sign-with-seed-phrase '${process.env.NEAR_SEED_PHRASE}' --seed-phrase-hd-path ${HD_PATH} send`,
            );
        } catch (e) {
            console.log('Error deploying global contract', e);
        }
    }

    console.log('contract deployed:', contractId);
    await sleep(1000);

    const initRes = await account.functionCall({
        contractId,
        methodName: 'init',
        args: {
            owner_id: accountId,
        },
        gas: GAS,
    });

    console.log('contract init result', initRes.status.SuccessValue === '');
    await sleep(1000);

    // NEEDS TO MATCH docker-compose.yaml shade-agent-api-image
    account = getAccount(accountId);
    const approveApiRes = await account.functionCall({
        contractId,
        methodName: 'approve_codehash',
        args: {
            codehash: API_CODEHASH,
        },
        gas: GAS,
    });

    console.log(
        'api approve_codehash result',
        approveApiRes.status.SuccessValue === '',
    );
    await sleep(1000);

    // NEEDS TO MATCH docker-compose.yaml shade-agent-app-image
    account = getAccount(accountId);
    const approveAppRes = await account.functionCall({
        contractId,
        methodName: 'approve_codehash',
        args: {
            codehash: APP_CODEHASH,
        },
        gas: GAS,
    });

    console.log(
        'app approve_codehash result',
        approveAppRes.status.SuccessValue === '',
    );
}

deploy();
