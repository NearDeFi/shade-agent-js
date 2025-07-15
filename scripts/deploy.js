import { execSync } from 'child_process';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.development.local' });

// const and helpers

import { parseSeedPhrase } from 'near-seed-phrase';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';
import { Account } from '@near-js/accounts';
import { NEAR } from '@near-js/tokens';
import { KeyPair } from '@near-js/crypto';
export const parseNearAmount = (amt) => NEAR.toUnits(amt);

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

// local vars for module
const contractId = process.env.NEXT_PUBLIC_contractId?.replaceAll('"', '');
const networkId = /testnet/gi.test(contractId) ? 'testnet' : 'mainnet';
let accountId, signer, keyPair;
const { NEAR_ACCOUNT_ID, NEAR_SEED_PHRASE } = process.env;
// if we're running within the API image and we have ENV vars for NEAR_ACCOUNT_ID and NEAR_SEED_PRASE
if (NEAR_ACCOUNT_ID && NEAR_SEED_PHRASE) {
    accountId = NEAR_ACCOUNT_ID.replaceAll('"', '');
    const { secretKey } = parseSeedPhrase(NEAR_SEED_PHRASE.replaceAll('"', ''));
    keyPair = KeyPair.fromString(secretKey);
    signer = new KeyPairSigner(keyPair);
}
const provider = new JsonRpcProvider({
    url:
        networkId === 'testnet'
            ? 'https://test.rpc.fastnear.com'
            : 'https://free.rpc.fastnear.com',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const getAccount = (id = _accountId) =>
    new Account(id, provider, signer);

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
