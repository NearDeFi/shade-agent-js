import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import {
    setKey,
    getImplicit,
    getCurrentAccountId,
    addKeysFromSecrets,
    getAccount,
} from './near';
import { config } from './config';

// In-memory keystore for agent keys
let agentAccountId: string | null = null;
let currentAgentKeyIndex = 0;
const agentKeys: string[] = [];

// Set up Tappd client
const client = new TappdClient();

/**
 * Sets the current signing key for the agent from the in-memory keystore
 * @param index - Valid index of agentKeys array (0-based)
 * @returns void
 */
export function setAgentKey(index: number): void {
    currentAgentKeyIndex = index;
    if (agentAccountId) {
        setKey(agentAccountId, agentKeys[currentAgentKeyIndex]);
    }
}

/**
 * Rotates to the next available agent key in the agentKeys array
 * @returns void
 */
export function nextAgentKey(): void {
    currentAgentKeyIndex++;
    if (currentAgentKeyIndex > agentKeys.length - 1) {
        currentAgentKeyIndex = 0;
    }
    console.log(`setAgentKey to ${currentAgentKeyIndex} / ${agentKeys.length}`);
    setAgentKey(currentAgentKeyIndex);
}

/**
 * Generates and adds multiple keys to the agent account
 * @param number - Number of keys to generate and add
 * @returns Promise<boolean> - true if all keys were added successfully, false otherwise
 */
export async function addAgentKeys(number: number): Promise<boolean> {
    const secrets: string[] = [];
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
 * Derives a new key for an agent using TEE-based entropy if available
 * @param hash - User provided hash for seed phrase generation. When undefined, uses TEE hardware entropy or JS crypto
 * @returns Promise with object containing publicKey, secretKey, and seedPhrase
 */
async function deriveAgentKey(hash: Buffer | undefined): Promise<{ publicKey: string; secretKey: string; seedPhrase: string }> {
    // Use TEE entropy if in sandbox mode otherwise use fixed entropy
    if (hash === undefined) {
        // In-memory randomness only available to this instance of TEE
        const randomArray = new Uint8Array(32);
        crypto.getRandomValues(randomArray);

        // Entropy from TEE hardware
        const randomString = Buffer.from(randomArray).toString('hex');
        const keyFromTee = await client.deriveKey(
            randomString,
            randomString,
        );
        // Hash of in-memory and TEE entropy
        hash = Buffer.from(
            await crypto.subtle.digest(
                'SHA-256',
                Buffer.concat([randomArray, keyFromTee.asUint8Array(32)]),
            ),
        );
    }

    // !!! data.secretKey should not be exfiltrated anywhere !!! No logs or debugging tools !!!
    return generateSeedPhrase(hash);
}

/**
 * Derives a worker account using TEE-based entropy and sets it as the current agent account
 * @param hash - User provided hash for seed phrase generation. When undefined, uses TEE hardware entropy or JS crypto
 * @returns Promise<string> - The derived account ID
 */
export async function deriveAgentAccount(hash: Buffer | undefined): Promise<string> {
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
 * @param codehash - Provided codehash for proxy contract (local dev). If undefined, uses TEE attestation
 * @returns Promise<boolean> - true if registration was successful, false otherwise
 * @throws Error if account ID is required but not available for TDX quote
 */
export async function registerAgent(codehash: string | undefined): Promise<boolean> {
    // Get tcb_info from tappd if we are running in a TEE, otherwise we're running locally so register worker with the API codehash
    let resContract: boolean;
    const agentAccount = getAccount(agentAccountId || undefined);
    if (codehash === undefined) {
        let tcb_info = (await client.getInfo()).tcb_info;

        // Parse tcb_info
        if (typeof tcb_info !== 'string') {
            tcb_info = JSON.stringify(tcb_info);
        }

        // Get TDX quote
        const accountId = getCurrentAccountId();
        if (!accountId) {
            throw new Error('Account ID is required for TDX quote');
        }
        const ra = await client.tdxQuote(accountId, 'raw');
        const quote_hex = ra.quote.replace(/^0x/, '');

        // Get quote collateral
        const formData = new FormData();
        formData.append('hex', quote_hex);
        let collateral: string, checksum: string;
        // WARNING: this endpoint could throw or be offline
        const resHelper = await (
            await fetch('https://proof.t16z.com/api/upload', {
                method: 'POST',
                body: formData,
            })
        ).json();
        checksum = resHelper.checksum;
        collateral = JSON.stringify(resHelper.quote_collateral);
        
        // Register the worker (returns bool)
        resContract = await agentAccount.callFunction({
            contractId: config.contractId,
            methodName: 'register_agent',
            args: {
                quote_hex,
                collateral,
                checksum,
                tcb_info,
            },
            gas: BigInt('30000000000000'),
            waitUntil: 'EXECUTED',
        });
    } else {
        resContract = await agentAccount.callFunction({
            contractId: config.contractId,
            methodName: 'register_agent',
            args: {
                codehash,
            },
            gas: BigInt('30000000000000'),
            waitUntil: 'EXECUTED',
        });
    }

    return resContract;
}
