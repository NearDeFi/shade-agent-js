import 'dotenv/config';
import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import { setKey, getImplicit, contractCall } from './nearProvider';

// if running simulator otherwise this will be undefined
const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;

// in-memory randomness only available to this instance of TEE
const randomArray = new Uint8Array(32);
crypto.getRandomValues(randomArray);

/**
 * Derives a worker account using TEE-based entropy
 * @param {Buffer | undefined} hash - User provided hash for seed phrase generation. When undefined, it will try to use TEE hardware entropy or JS crypto.
 * @returns {Promise<string>} The derived account ID
 */
export async function deriveWorkerAccount(hash: Buffer | undefined) {
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
export async function registerWorker(codehash: String | undefined) {
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
        const randomNumString = Math.random().toString();
        const ra = await client.tdxQuote(randomNumString);
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
                codehash: 'proxy',
            },
        });
    }

    return resContract;
}
