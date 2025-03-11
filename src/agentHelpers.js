import 'dotenv/config';
import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import { setKey, getImplicit, contractCall } from './nearProvider';

// if running simulator otherwise this will be undefined
const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;

// in-memory randomness only available to this instance of TEE
const randomArray = new Uint8Array(32);
crypto.getRandomValues(randomArray);

export async function deriveWorkerAccount() {
    // env prod in TEE
    const client = new TappdClient(endpoint);
    // entropy from TEE hardware
    const randomString = Buffer.from(randomArray).toString('hex');
    const keyFromTee = await client.deriveKey(randomString, randomString);
    // hash of in-memory and TEE entropy
    const hash = await crypto.subtle.digest(
        'SHA-256',
        Buffer.concat([randomArray, keyFromTee.asUint8Array(32)]),
    );
    // !!! data.secretKey should not be exfiltrated anywhere !!! no logs or debugging tools !!!
    const data = generateSeedPhrase(hash);
    const accountId = getImplicit(data.publicKey);
    // set the secretKey (inMemoryKeyStore only)
    setKey(accountId, data.secretKey);

    return accountId;
}

export async function registerWorker() {
    // env prod in TEE
    const client = new TappdClient(endpoint);

    // get tcb info from tappd
    let { tcb_info } = await client.getInfo();
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
    const resContract = await contractCall({
        methodName: 'register_worker',
        args: {
            quote_hex,
            collateral,
            checksum,
            tcb_info,
        },
    });

    return resContract;
}
