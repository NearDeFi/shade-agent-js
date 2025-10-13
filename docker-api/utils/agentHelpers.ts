import { TappdClient } from './tappd';
import { generateSeedPhrase } from 'near-seed-phrase';
import {
    setKey,
    getImplicit,
    getCurrentAccountId,
    addKeysFromSecrets,
    getAccount,
    parseNearAmount,
} from './near';
import { config } from './config';

// In-memory keystore for agent keys
let agentAccountId: string | null = null;
let currentAgentKeyIndex = 0;
const agentKeys: string[] = [];

let client: TappdClient | undefined = undefined;
// Set up Tappd client
if (config.isTEE) {
    client = new TappdClient();
}

/**
 * Sets the current signing key for the agent from the in-memory keystore
 * @param index - Index of the agentKeys array to set the current key to
 * @returns void
 * @throws Error if index is invalid or agent account is not set
 */
function setAgentKey(index: number): void {
    if (!agentAccountId) {
        throw new Error('Agent account ID is not set. Call deriveAgentAccount first.');
    }
    if (index < 0 || index >= agentKeys.length) {
        throw new Error(`Invalid key index: ${index}. Available keys: 0-${agentKeys.length - 1}`);
    }
    currentAgentKeyIndex = index;
    setKey(agentAccountId, agentKeys[currentAgentKeyIndex]);
}

/**
 * Rotates to the next available agent key in the agentKeys array
 * @returns void
 * @throws Error if no agent keys are available
 */
export function nextAgentKey(): void {
    if (agentKeys.length === 0) {
        throw new Error('No agent keys available. Call deriveAgentAccount or addAgentKeys first.');
    }
    if (agentKeys.length === 1) {
        return;
    }
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
 * @returns Promise<void>
 * @throws Error if number is invalid, agent account is not set, or key addition fails
 */
export async function addAgentKeys(number: number): Promise<void> {
    if (number === 0) {
        console.log('No keys to add');
        return;
    }
    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`Number of keys must be a positive integer. Got: ${number}`);
    }
    if (!agentAccountId) {
        throw new Error('Agent account ID is not set. Call deriveAgentAccount first.');
    }
    if (config.isTEE && !client) {
        throw new Error('Tappd client is not available in TEE environment');
    }

    try {
        const secrets: string[] = [];
        for (let i = 0; i < number; i++) {
            const data = await deriveAgentKey(undefined);
            secrets.push(data.secretKey);
        }
        await addKeysFromSecrets(secrets);
        agentKeys.push(...secrets);
        console.log(`Successfully added ${number} agent keys`);
        await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
        throw new Error(`Failed to add agent keys: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Derives a new key for the agent 
 * @param hash - User provided hash for seed phrase generation. When undefined, uses TEE hardware entropy and JS crypto
 * @returns Promise with object containing publicKey, secretKey, and seedPhrase
 * @throws Error if TEE client is required but not available, or key derivation fails
 */
async function deriveAgentKey(hash: Buffer | undefined): Promise<{ publicKey: string; secretKey: string; seedPhrase: string }> {
    try {
        // Use TEE entropy if in sandbox mode otherwise use fixed entropy
        if (hash === undefined) {
            if (config.isTEE && !client) {
                throw new Error('Tappd client is required for TEE entropy but not available');
            }
            
            // JS crypto random
            const randomArray = new Uint8Array(32);
            crypto.getRandomValues(randomArray);

            // Entropy from TEE hardware
            const randomString = Buffer.from(randomArray).toString('hex');
            const keyFromTee = await client!.deriveKey(
                randomString,
                randomString,
            );
            // Hash of JS crypto random and TEE entropy
            hash = Buffer.from(
                await crypto.subtle.digest(
                    'SHA-256',
                    Buffer.concat([randomArray, keyFromTee.asUint8Array(32)]),
                ),
            );
        }

        // !!! data.secretKey should not be exfiltrated anywhere !!! No logs or debugging tools !!!
        return generateSeedPhrase(hash);
    } catch (error) {
        throw new Error(`Failed to derive agent key: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Derives the agent account ID
 * @param hash - User provided hash for seed phrase generation. When undefined, uses TEE hardware entropy and JS crypto
 * @returns Promise<string> - The derived account ID
 * @throws Error if key derivation fails or account setup fails
 */
export async function deriveAgentAccount(hash: Buffer | undefined): Promise<string> {
    try {
        const data = await deriveAgentKey(hash);

        if (!data.publicKey || !data.secretKey) {
            throw new Error('Invalid key data received from derivation');
        }

        const accountId = getImplicit(data.publicKey);
        if (!accountId) {
            throw new Error('Failed to generate implicit account ID from public key');
        }
        
        agentAccountId = accountId;
        // !!! secret key is pushed to in-memory agentKeys array ONLY
        agentKeys.push(data.secretKey);
        setAgentKey(agentKeys.length - 1);
        
        console.log(`Derived agent account: ${accountId}`);
        return agentAccountId;
    } catch (error) {
        throw new Error(`Failed to derive agent account: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Registers the agent in the agent contract
 * @param codehash - Provided codehash (used in local dev). If undefined, uses TEE attestation
 * @returns Promise<boolean> - true if registration was successful, false otherwise
 */
export async function registerAgent(codehash: string | undefined): Promise<boolean> {
    if (!agentAccountId) {
        console.error('Agent account ID is not set. Call deriveAgentAccount first.');
        return false;
    }
    if (config.isTEE && !client) {
        console.error('Tappd client is not available in TEE environment');
        return false;
    }

    try {
        const agentAccount = getAccount(agentAccountId);
        
        if (codehash === undefined) {
            // TEE mode - use attestation
            if (!client) {
                console.error('Tappd client is required for TEE attestation');
                return false;
            }

            let tcb_info = (await client.getInfo()).tcb_info;

            // Parse tcb_info
            if (typeof tcb_info !== 'string') {
                tcb_info = JSON.stringify(tcb_info);
            }

            // Get TDX quote
            const accountId = getCurrentAccountId();
            if (!accountId) {
                console.error('Account ID is required for TDX quote');
                return false;
            }
            
            const ra = await client.tdxQuote(accountId, 'raw');
            const quote_hex = ra.quote.replace(/^0x/, '');

            // Get quote collateral
            const formData = new FormData();
            formData.append('hex', quote_hex);
            
            let collateral: string, checksum: string;
            try {
                const response = await fetch('https://proof.t16z.com/api/upload', {
                    method: 'POST',
                    body: formData,
                });
                
                if (!response.ok) {
                    console.error(`Failed to get quote collateral: HTTP ${response.status}`);
                    return false;
                }
                
                const resHelper = await response.json();
                checksum = resHelper.checksum;
                collateral = JSON.stringify(resHelper.quote_collateral);
            } catch (error) {
                console.error(`Failed to get quote collateral: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
            
            // Register the agent
            const txRes = await agentAccount.callFunction({
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
            
            // Check transaction status
            if ((txRes as any).status.SuccessValue !== '') {
                console.error('Registration transaction failed');
                return false;
            }
        } else {
            // Local dev mode - use codehash
            const txRes = await agentAccount.callFunction({
                contractId: config.contractId,
                methodName: 'register_agent',
                args: {
                    codehash,
                },
                gas: BigInt('30000000000000'),
                waitUntil: 'EXECUTED',
            });
            
            // Check transaction status
            if ((txRes as any).status.SuccessValue !== '') {
                console.error('Registration transaction failed');
                return false;
            }
        }
        
        return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to register agent: ${errorMessage}`);
        return false;
    }
}

/**
 * Funds the agent account with NEAR tokens
 * @param amount - Amount of NEAR to fund the account with (default: "0.3")
 * @returns Promise<void>
 * @throws Error if funding fails or agent account is not set
 */
export async function fundAgentAccount(amount: string): Promise<void> {
    if (!agentAccountId) {
        throw new Error('Agent account ID is not set. Call deriveAgentAccount first.');
    }

    console.log('Funding agent account');
    const transferAmount = BigInt(parseNearAmount(amount));
    const sponsorAccount = getAccount(config.sponsorAccountId);
    
    try {
        const txRes = await sponsorAccount.transfer({
            receiverId: agentAccountId,
            amount: transferAmount,
        });
        
        // Check transaction status
        if ((txRes.status as any).SuccessValue !== '') {
            throw new Error('Transfer transaction failed');
        }
        
        console.log(`Agent account funded: ${agentAccountId} with ${amount} NEAR`);

        await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error funding agent account: ${errorMessage}`);
        throw new Error(`Failed to fund agent account: ${errorMessage}`);
    }
}
