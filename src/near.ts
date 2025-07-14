import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: './.env.development.local' });
} else {
    console.log('loading prod env vars');
    // load .env in production
    dotenv.config();
}

import { parseSeedPhrase } from 'near-seed-phrase';
import { getProvider } from './nearProvider';
import { KeyPairSigner } from '@near-js/signers';
import { Account } from '@near-js/accounts';
import { NEAR } from '@near-js/tokens';
import { KeyPair, KeyPairString, PublicKey } from '@near-js/crypto';

export const parseNearAmount = (amt) => NEAR.toUnits(amt);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAS = BigInt('300000000000000');

// local vars for module
const _contractId = process.env.NEXT_PUBLIC_contractId?.replaceAll('"', '');
export const contractId = _contractId;
export const networkId = /testnet/gi.test(contractId) ? 'testnet' : 'mainnet';
let _accountId, signer;
const { NEAR_ACCOUNT_ID, NEAR_SEED_PHRASE } = process.env;
// if we're running within the API image and we have ENV vars for NEAR_ACCOUNT_ID and NEAR_SEED_PRASE
if (NEAR_ACCOUNT_ID && NEAR_SEED_PHRASE) {
    _accountId = NEAR_ACCOUNT_ID.replaceAll('"', '');
    const { secretKey } = parseSeedPhrase(NEAR_SEED_PHRASE.replaceAll('"', ''));
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    signer = new KeyPairSigner(keyPair);
}

const provider = getProvider(process.env.NEAR_RPC_JSON);

// helpers

/**
 * Sets a key pair for an account in the in-memory keystore
 * @param {string} accountId - NEAR account ID
 * @param {string} secretKey - Account's secret key
 */
export const setKey = (accountId, secretKey) => {
    if (!accountId || !secretKey) {
        return console.log('ERROR: setKey missing args');
    }
    // user passed in a seed phrase
    if (secretKey.indexOf(' ') > -1) {
        secretKey = parseSeedPhrase(secretKey).secretKey;
    }
    _accountId = accountId;
    const keyPair = KeyPair.fromString(secretKey);
    // set in-memory keystore only
    // console.log('setKey', networkId, accountId, keyPair);
    signer = new KeyPairSigner(keyPair);
};

/**
 * Converts a public key string to an implicit account ID
 * @param {string} pubKeyStr - Public key string
 * @returns {string} Implicit account ID (hex encoded)
 */
export const getImplicit = (pubKeyStr) =>
    Buffer.from(PublicKey.from(pubKeyStr).data).toString('hex').toLowerCase();

/**
 * Creates a NEAR Account instance
 * @param {string} [id=_accountId] - NEAR account ID
 * @returns {Account} NEAR Account instance
 */
export const getAccount = (id = _accountId) =>
    new Account(id, provider, signer);

/**
 * Returns the current account ID (typically the agent account after setKey has been called in deriveAgentAccount)
 * @returns {String} Agent Account ID
 */
export const getCurrentAccountId = () => _accountId;

/**
 * Gets the balance of a NEAR account
 * @param {string} accountId - NEAR account ID
 * @returns {Promise<{available: string}>} Account balance
 */
export const getBalance = async (accountId) => {
    let balance = BigInt('0');
    try {
        const account = getAccount(accountId);
        balance = await account.getBalance();
    } catch (e) {
        console.log('getBalance error: ', e.type);
    }
    return balance;
};

// contract interactions

/**
 * Calls a view method on a NEAR contract
 * @param {string} methodName - Contract method name
 * @param {Object} args - Method arguments
 * @param {string} [accountId = _accountId] - Account ID to use for the call, default is the agent account ID, _accountId
 * @param {string} [contractId = _contractId] - Contract ID to call, default is the contractId from env, _contractId
 * @returns {Promise<any>} Method result
 */
export const contractView = async ({
    methodName,
    args = {},
    accountId = _accountId,
    contractId = _contractId,
}) => {
    const account = getAccount(accountId);

    let res;
    try {
        res = await account.callFunction({
            contractId,
            methodName,
            args,
            gas: GAS,
        });
    } catch (e) {
        if (/deserialize/gi.test(JSON.stringify(e))) {
            console.log(`Bad arguments to ${methodName} method`);
        }
        throw e;
    }
    return res;
};

/**
 * Calls a change method on a NEAR contract
 * @param {string} methodName - Contract method name
 * @param {Object} args - Method arguments
 * @param {string} [accountId = _accountId] - Account ID to use for the call, default is the agent account ID, _accountId
 * @param {string} [contractId = _contractId] - Contract ID to call, default is the contractId from env, _contractId
 * @param {bigint} [gas] - gas
 * @param {bigint} [deposit='0'] - near to attach in yoctoNEAR
 * @returns {Promise<any>} Transaction result
 */
export const contractCall = async ({
    methodName,
    args,
    accountId = _accountId,
    contractId = _contractId,
    attachedDeposit = BigInt('0'),
    gas = GAS,
}) => {
    const account = getAccount(accountId);
    let res;
    try {
        res = await account.functionCall({
            contractId,
            methodName,
            args,
            gas,
            attachedDeposit,
        });
    } catch (e) {
        console.log(e);
        if (/deserialize/gi.test(JSON.stringify(e))) {
            return console.log(`Bad arguments to ${methodName} method`);
        }
        throw e;
    }

    // temp fix for CCCs when tx.status == 'Started' we don't have the result yet, waiting for tx.status.SuccessValue
    const maxPings = 30;
    let pings = 0;
    while (res.status?.SuccessValue === undefined && pings < maxPings) {
        await sleep(1000);
        res = await (provider as any).txStatus(
            res.transaction.hash,
            account.accountId,
            'EXECUTED',
        );
        pings += 1;
    }
    if (pings >= maxPings) {
        throw new Error(
            'Transaction did not return res.status.SuccessValue within 30s',
        );
    }
    return await parseSuccessValue(res);
};

/**
 * Parses the success value from a NEAR transaction result
 * @param {Object} transaction - Transaction result object
 * @param {Object} transaction.status - Transaction status
 * @param {string} transaction.status.SuccessValue - Base64 encoded success value
 * @returns {any} Parsed success value or undefined if empty/invalid
 */
const parseSuccessValue = (res) => {
    if (res?.status?.SuccessValue === undefined) {
        throw new Error('SuccessValue is undefined in transaction result');
    }
    if (res?.status?.SuccessValue?.length === 0) return '';

    return JSON.parse(
        Buffer.from(res.status.SuccessValue, 'base64').toString('ascii'),
    );
};
