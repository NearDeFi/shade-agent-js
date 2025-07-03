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

// new imports
import { KeyPairSigner } from '@near-js/signers';
import { JsonRpcProvider } from '@near-js/providers';
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
// setup keystore, set funding account and key
let _accountId = process.env.NEAR_ACCOUNT_ID?.replaceAll('"', '');
// console.log('accountId, contractId', _accountId, _contractId);
const { secretKey } = parseSeedPhrase(
    process.env.NEAR_SEED_PHRASE?.replaceAll('"', ''),
);

const keyPair = KeyPair.fromString(secretKey as KeyPairString);
let signer = new KeyPairSigner(keyPair);
const provider = new JsonRpcProvider({
    url:
        networkId === 'testnet'
            ? 'https://test.rpc.fastnear.com'
            : 'https://free.rpc.fastnear.com',
});

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
        if (e.type === 'AccountDoesNotExist') {
            console.log(e.type);
        } else {
            throw e;
        }
    }
    return balance;
};

// contract interactions

/**
 * Calls a view method on a NEAR contract
 * @param {Object} params - View call parameters
 * @param {string} [params.accountId] - Account ID to use for the call
 * @param {string} [params.contractId=_contractId] - Contract ID to call
 * @param {string} params.methodName - Contract method name
 * @param {Object} [params.args={}] - Method arguments
 * @returns {Promise<any>} Method result
 */
export const contractView = async ({
    accountId,
    contractId = _contractId,
    methodName,
    args = {},
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
 * @param {Object} params - Call parameters
 * @param {string} [params.accountId] - Account ID to use for the call
 * @param {string} [params.contractId=_contractId] - Contract ID to call
 * @param {string} params.methodName - Contract method name
 * @param {Object} [params.args] - Method arguments
 * @param {string} [params.deposit='0'] - Amount of NEAR to attach
 * @returns {Promise<any>} Transaction result
 */
export const contractCall = async ({
    accountId = undefined,
    contractId = _contractId,
    methodName,
    args,
    attachedDeposit = BigInt('0'),
}) => {
    const account = getAccount(accountId);
    let res;
    try {
        res = await account.functionCall({
            contractId,
            methodName,
            args,
            gas: GAS,
            attachedDeposit,
        });
    } catch (e) {
        console.log(e);
        if (/deserialize/gi.test(JSON.stringify(e))) {
            return console.log(`Bad arguments to ${methodName} method`);
        }
        if (e.context?.transactionHash) {
            const maxPings = 30;
            let pings = 0;
            while (
                res.final_execution_status != 'EXECUTED' &&
                pings < maxPings
            ) {
                // Sleep 1 second before next ping.
                await sleep(1000);
                // txStatus times out when waiting for 'EXECUTED'.
                // Instead we wait for an earlier status type, sleep between and keep pinging.
                res = await provider.txStatus(
                    e.context.transactionHash,
                    account.accountId,
                    'INCLUDED',
                );
                pings += 1;
            }
            if (pings >= maxPings) {
                console.warn(
                    `Request status polling exited before desired outcome.\n  Current status: ${res.final_execution_status}\nSignature Request will likley fail.`,
                );
            }
            return parseSuccessValue(res);
        }
        throw e;
    }
    return parseSuccessValue(res);
};

/**
 * Parses the success value from a NEAR transaction result
 * @param {Object} transaction - Transaction result object
 * @param {Object} transaction.status - Transaction status
 * @param {string} transaction.status.SuccessValue - Base64 encoded success value
 * @returns {any} Parsed success value or undefined if empty/invalid
 */
const parseSuccessValue = (transaction) => {
    if (transaction.status.SuccessValue.length === 0) return;

    try {
        return JSON.parse(
            Buffer.from(transaction.status.SuccessValue, 'base64').toString(
                'ascii',
            ),
        );
    } catch (e) {
        console.log(
            `Error parsing success value for transaction ${JSON.stringify(
                transaction,
            )}`,
        );
    }
};
