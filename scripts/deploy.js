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
const gas = BigInt('300000000000000');
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
const deploy = async (codehash) => {
    let wasmPath, fundingAmount;
    if (codehash) {
        return console.log('Sandbox WIP');
    } else {
        codehash = 'proxy';
        wasmPath = './contracts/proxy/target/near/contract.wasm';
        fundingAmount = parseNearAmount('5');
        keyStore.setKey(networkId, contractId, keyPair);
    }

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
            fundingAmount,
        );
    } catch (e) {
        console.log('error createAccount', e);
    }

    await sleep(1000);

    const file = fs.readFileSync(wasmPath);
    let account = getAccount(contractId);
    await account.deployContract(file);
    console.log('deployed bytes', file.byteLength);
    const balance = await account.getAccountBalance();
    console.log('contract balance', balance);

    await sleep(1000);

    const initRes = await account.functionCall({
        contractId,
        methodName: 'init',
        args: {
            owner_id: accountId,
        },
        gas,
    });

    console.log('initRes', initRes);

    await sleep(1000);
    // NEEDS TO MATCH docker-compose.yaml CODEHASH
    account = getAccount(accountId);
    const approveRes = await account.functionCall({
        contractId,
        methodName: 'approve_codehash',
        args: {
            codehash,
        },
        gas,
    });

    console.log('approveRes', approveRes);
};

deploy();
