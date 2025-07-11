import { execSync } from 'child_process';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.development.local' });
import { parseSeedPhrase } from 'near-seed-phrase';
import * as nearAPI from 'near-api-js';

// const and helpers
const {
    Near,
    Account,
    KeyPair,
    keyStores,
    utils: {
        format: { parseNearAmount },
    },
} = nearAPI;

// deploy the contract bytes NOT the global contract if there's a cmd line arg of "bytes"
const DEPLOY_BYTES = false;
// default codehash is "proxy" for local development, contract will NOT verify anything in register_worker
const CODEHASH =
    process.env.API_CODEHASH || process.env.APP_CODEHASH || 'proxy';
const GLOBAL_CONTRACT_HASH =
    CODEHASH === 'proxy'
        ? 'GMXJXnVK9vYd7CSYPtbA56rPau2h5J4YjsSsCfegGi4G'
        : 'GMXJXnVK9vYd7CSYPtbA56rPau2h5J4YjsSsCfegGi4G';
const HD_PATH = `"m/44'/397'/0'"`;
const FUNDING_AMOUNT = parseNearAmount('1');
const GAS = BigInt('300000000000000');

const getAccount = (id) => new Account(connection, id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// setup account, network, keys
const accountId = process.env.NEAR_ACCOUNT_ID;
const contractId = process.env.NEXT_PUBLIC_contractId;
const networkId = /testnet/gi.test(accountId) ? 'testnet' : 'mainnet';
console.log('accountId, contractId', accountId, contractId);
const { secretKey } = parseSeedPhrase(process.env.NEAR_SEED_PHRASE);
const keyStore = new keyStores.InMemoryKeyStore();
const keyPair = KeyPair.fromString(secretKey);
keyStore.setKey(networkId, accountId, keyPair);
keyStore.setKey(networkId, contractId, keyPair);

// config near
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

// deploys sandbox contract with codehash if provided, otherwise deploys proxy contract
const deploy = async () => {
    try {
        const account = getAccount(contractId);
        await account.deleteAccount(accountId);
    } catch (e) {
        console.log('error deleteAccount', e);
    }

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

    await sleep(1000);

    let account = getAccount(contractId);
    if (DEPLOY_BYTES) {
        // deploys the contract bytes (original method and requires more funding)
        const file = fs.readFileSync(
            `./contracts/${
                CODEHASH === 'proxy' ? 'proxy' : 'sandbox'
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

    await sleep(1000);

    const initRes = await account.functionCall({
        contractId,
        methodName: 'init',
        args: {
            owner_id: accountId,
        },
        gas: GAS,
    });

    console.log('initRes', initRes);

    await sleep(1000);
    // NEEDS TO MATCH docker-compose.yaml CODEHASH
    account = getAccount(accountId);
    const approveRes = await account.functionCall({
        contractId,
        methodName: 'approve_codehash',
        args: {
            codehash: CODEHASH,
        },
        gas: GAS,
    });

    console.log('approveRes', approveRes, CODEHASH);
};

deploy();
