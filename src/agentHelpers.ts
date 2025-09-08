import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: './.env.development.local' });
} else {
    // load .env in production
    dotenv.config();
}
import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import {
    setKey,
    getImplicit,
    contractCall,
    getCurrentAccountId,
    addKeysFromSecrets,
} from './near';

// if running simulator otherwise this will be undefined
const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;

// in-memory keystore for agent keys
let agentAccountId = null;
let currentAgentKeyIndex = 0;
const agentKeys = [];

/**
 * Sets the current signing key for the agent
 * @param {number} index - Valid index of agentKeys array
 * @throws {IndexOutOfBounds} If invalid agentKey index is used
 */
export function setAgentKey(index: number) {
    currentAgentKeyIndex = index;
    setKey(agentAccountId, agentKeys[currentAgentKeyIndex]);
}

/**
 * Uses the next available agent key in the agentKeys array as the current signing key for the agent
 */
export function nextAgentKey() {
    currentAgentKeyIndex++;
    if (currentAgentKeyIndex > agentKeys.length - 1) {
        currentAgentKeyIndex = 0;
    }
    console.log(`setAgentKey to ${currentAgentKeyIndex} / ${agentKeys.length}`);
    setAgentKey(currentAgentKeyIndex);
}

/**
 * Adds a key to the agent and pushes the key onto the in-memory keystore
 * @returns {Promise<boolean>} whether the key has been successfully added to the account
 */
export async function addAgentKeys(number: number) {
    const secrets = [];
    for (let i = 0; i < number; i++) {
        const data = await deriveAgentKey(undefined);
        secrets.push(data.secretKey);
    }
    const addKeyRes = await addKeysFromSecrets(secrets);
    if (addKeyRes) {
        agentKeys.push(...secrets);
    }
    return addKeyRes;
}

/**
 * Derives a new key for an agent using TEE based entropy if available
 * @param {Buffer | undefined} hash - User provided hash for seed phrase generation. When undefined, it will try to use TEE hardware entropy or JS crypto.
 * @returns {Promise<object>} The generated publicKey, secretKey, seedPhrase as an object
 */
async function deriveAgentKey(hash: Buffer | undefined) {
    // use TEE entropy or fallback to js crypto randomArray
    if (!hash) {
        // in-memory randomness only available to this instance of TEE
        const randomArray = new Uint8Array(32);
        crypto.getRandomValues(randomArray);

        try {
            // entropy from TEE hardware
            const client = new TappdClient(endpoint);
            const randomString = Buffer.from(randomArray).toString('hex');
            const keyFromTee = await client.deriveKey(
                randomString,
                randomString,
            );
            // hash of in-memory and TEE entropy
            hash = Buffer.from(
                await crypto.subtle.digest(
                    'SHA-256',
                    Buffer.concat([randomArray, keyFromTee.asUint8Array(32)]),
                ),
            );
        } catch (e) {
            console.log('Not in TEE. Using in-memory JS crypto entropy ONLY!');
            // hash of in-memory ONLY
            hash = Buffer.from(
                await crypto.subtle.digest('SHA-256', randomArray),
            );
        }
    }

    // !!! data.secretKey should not be exfiltrated anywhere !!! no logs or debugging tools !!!
    return generateSeedPhrase(hash);
}

/**
 * Derives a worker account using TEE-based entropy
 * @param {Buffer | undefined} hash - User provided hash for seed phrase generation. When undefined, it will try to use TEE hardware entropy or JS crypto.
 * @returns {Promise<string>} The derived account ID
 */
export async function deriveAgentAccount(hash: Buffer | undefined) {
    const data = await deriveAgentKey(hash);

    const accountId = getImplicit(data.publicKey);
    agentAccountId = accountId;
    // !!! secret key is pushed to in-memory agentKeys array ONLY
    agentKeys.push(data.secretKey);
    setAgentKey(agentKeys.length - 1);
    return agentAccountId;
}

/**
 * Registers a worker with the contract
 * @param {String | undefined} codehash - User provided codehash for proxy contract, running locally and NOT in a TEE
 * @returns {Promise<boolean>} Result of the registration
 */
export async function registerAgent(codehash: String | undefined) {
    // get tcb_info from tappd if we are running in a TEE, otherwise we're running locally so register worker with codehash "proxy"
    let resContract;
    if (!codehash) {
        // env prod in TEE
        const client = new TappdClient(endpoint);
        let tcb_info = (await client.getInfo()).tcb_info;

        // parse tcb_info
        if (typeof tcb_info !== 'string') {
            tcb_info = JSON.stringify(tcb_info);
        }

        // get TDX quote
        const accountId = getCurrentAccountId();
        const ra = await client.tdxQuote(accountId, 'raw');
        const quote_hex = ra.quote.replace(/^0x/, '');

        // get quote collateral
        const formData = new FormData();
        formData.append('hex', quote_hex);
        let collateral, checksum;
        // WARNING: this endpoint could throw or be offline
        const resHelper = await (
            await fetch('https://proof.t16z.com/api/upload', {
                method: 'POST',
                body: formData,
            })
        ).json();
        checksum = resHelper.checksum;
        collateral = JSON.stringify(resHelper.quote_collateral);

        // register the worker (returns bool)
        resContract = await contractCall({
            methodName: 'register_agent',
            args: {
                quote_hex,
                collateral,
                checksum,
                tcb_info,
            },
        });
    } else {
        resContract = await contractCall({
            methodName: 'register_agent',
            args: {
                codehash,
            },
        });
    }

    return resContract;
}
