import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.development.local' });
import { parseSeedPhrase } from 'near-seed-phrase';
import * as nearAPI from 'near-api-js';

// const and helpers
const { Near, Account, KeyPair, keyStores, transactions, utils } = nearAPI;
const gas = BigInt('300000000000000');
const getAccount = (id) => new Account(connection, id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// setup account, network, keys
const accountId = process.env.NEAR_ACCOUNT_ID;
console.log(accountId);
const networkId = /testnet/gi.test(accountId) ? 'testnet' : 'mainnet';
const { publicKey, secretKey } = parseSeedPhrase(process.env.NEAR_SEED_PHRASE);
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

// Custom deployGlobalContractRaw method since it's not avail in near-api-js

async function deployGlobalContractRaw(isSandbox) {
    const account = getAccount(accountId);
    // !!! assumes only 1 full access key !!!
    const accessKeys = await account.getAccessKeys();
    const pubKeyStr = publicKey.toString();
    const accessKey = accessKeys.filter((k) => k.public_key === pubKeyStr)[0];

    let wasmPath;
    if (isSandbox) {
        return console.log('Sandbox WIP');
    } else {
        wasmPath = './contracts/proxy/target/near/contract.wasm';
    }

    const file = fs.readFileSync(wasmPath);

    // Construct custom global deployment action
    const action = new transactions.Action({
        deployGlobalContract: {
            code: file,
            deploy_mode: 'as-global-hash',
        },
    });

    // Create transaction with explicit global flags
    const block = await account.connection.provider.block({
        finality: 'final',
    });
    const transaction = transactions.createTransaction(
        accountId,
        keyPair.publicKey,
        accountId, // Special receiver for global deployments
        accessKey.access_key.nonce + BigInt(1),
        [action],
        utils.serialize.base_decode(block.header.hash),
    );

    // Serialize and send raw transaction
    const signedTx = await transactions.signTransaction(
        transaction,
        account.connection.signer,
        process.env.NEAR_ACCOUNT_ID,
        networkId,
    );

    let res;
    try {
        res = await account.connection.provider.sendJsonRpc(
            'broadcast_tx_commit',
            [Buffer.from(signedTx[1].encode()).toString('base64')],
        );
    } catch (e) {
        console.log(e);
    }

    console.log(res);
}

deployGlobalContractRaw();
