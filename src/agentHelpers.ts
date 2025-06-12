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
import { setKey, getImplicit, contractCall, getCurrentAccountId } from './nearProvider';

const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

// if running simulator otherwise this will be undefined
const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;

// in-memory randomness only available to this instance of TEE
const randomArray = new Uint8Array(32);
crypto.getRandomValues(randomArray);

/**
 * Gets the worker ephemeral account from the shade-agent-js api docker app
 * TODO error handling and return type checking
 */
export async function getAgentAccount(): Promise<any> {
    console.log(`http://${API_PATH}:${API_PORT}/api/address`);
    const res = await fetch(`http://${API_PATH}:${API_PORT}/api/address`).then(
        (r) => r.json(),
    );

    return res;
}

/**
 * Gets a signature with the worker account using the path and payload provided
 * @param {String} path - need a path to call MPC contract
 * @param {String} payload - need a payload (array of bytes) to sign
 * @returns {Promise<any>} The derived account ID
 *
 * TODO error handling and return type checking
 */
export async function signWithAgent(
    path: String,
    payload: Array<Number>,
): Promise<any> {
    const res = await fetch(`http://${API_PATH}:${API_PORT}/api/sign`, {
        method: 'POST',
        body: JSON.stringify({
            path,
            payload,
        }),
    }).then((r) => r.json());

    return res;
}
/**
 * Derives a worker account using TEE-based entropy
 * @param {Buffer | undefined} hash - User provided hash for seed phrase generation. When undefined, it will try to use TEE hardware entropy or JS crypto.
 * @returns {Promise<string>} The derived account ID
 */
export async function deriveAgentAccount(hash: Buffer | undefined) {
    // use TEE entropy or fallback to js crypto randomArray
    if (!hash) {
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
            console.log('NOT RUNNING IN TEE');
            // hash of in-memory ONLY
            hash = Buffer.from(
                await crypto.subtle.digest('SHA-256', randomArray),
            );
        }
    }

    // !!! data.secretKey should not be exfiltrated anywhere !!! no logs or debugging tools !!!
    const data = generateSeedPhrase(hash);
    const accountId = getImplicit(data.publicKey);
    // set the secretKey (inMemoryKeyStore only)
    setKey(accountId, data.secretKey);

    return accountId;
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
            methodName: 'register_worker',
            args: {
                quote_hex,
                collateral,
                checksum,
                tcb_info,
            },
        });
    } else {
        resContract = await contractCall({
            methodName: 'register_worker',
            args: {
                codehash,
            },
        });
    }

    return resContract;
}
