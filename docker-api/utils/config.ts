import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { TappdClient } from './tappd';

/**
 * Detects if the application is running in a TEE (Trusted Execution Environment)
 * 
 * If it is running in a TEE but this fails for whatever reason,
 * then it will generate a deterministic account ID for the agent.
 * This could be dangerous, however, it will not be able to register in the contract
 * as it will not provide the attestation, which is required for registration.
 * 
 * @returns Promise<boolean> - true if running in a verified TEE environment, false otherwise
 */
async function detectTEE(): Promise<boolean> {
    // First check if socket exists
    if (!existsSync('/var/run/tappd.sock')) {
        return false;
    }
    
    // Then test if Tappd client actually works
    try {
        const client = new TappdClient();
        await client.getInfo();
        return true;
    } catch (error) {
        return false;
    }
}

// Load environment variables based on environment
const isTEE = await detectTEE();
if (!isTEE) {
    // For local load .env.development.local
    dotenv.config({ path: './.env.development.local' });
} else {
    // For production load .env
    dotenv.config();
}

/**
 * Validates and retrieves a required environment variable
 * @param key - The environment variable key to retrieve
 * @returns The environment variable value
 * @throws Error if the environment variable is not set
 */
function getRequiredEnv(key: string): string {
    const value = process.env[key]?.replaceAll('"', '');
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

// Parse environment variables
const contractId = getRequiredEnv('AGENT_CONTRACT_ID');

// Compute derived values once at boot
// Determine if running in sandbox mode based on contract ID prefix
// let isSandbox: boolean;
// if (contractId.startsWith('ac-proxy.')) {
//     isSandbox = false;
// } else if (contractId.startsWith('ac-sandbox.')) {
//     isSandbox = true;
// } else {
//     throw new Error(`Contract ID must start with 'ac-proxy.' or 'ac-sandbox.'. Got: ${contractId}`);
// }

// Determine network ID based on contract ID suffix
let networkId: 'testnet' | 'mainnet';
if (contractId.endsWith('.testnet')) {
    networkId = 'testnet';
} else if (contractId.endsWith('.mainnet')) {
    networkId = 'mainnet';
} else {
    throw new Error(`Contract ID must be a .testnet or .mainnet account ID. Got: ${contractId}`);
}

// Parse and export all environment variables
export const config = {
    // Contract configuration 
    contractId,
    
    // Network configuration
    nearRpcJson: process.env.NEAR_RPC_JSON?.replaceAll("'", '') || '',
    
    // Account configuration
    sponsorAccountId: getRequiredEnv('SPONSOR_ACCOUNT_ID'),
    sponsorSeedPhrase: getRequiredEnv('SPONSOR_SEED_PHRASE'),

    // Agent configuration
    numExtraKeys: (() => {
        const value = parseInt(process.env.NUM_EXTRA_KEYS || '0');
        if (isNaN(value) || value < 0) {
            throw new Error(`NUM_EXTRA_KEYS must be a non-negative integer. Got: ${process.env.NUM_EXTRA_KEYS}`);
        }
        return value;
    })(),
    
    // API configuration
    shadeAgentPort: parseInt(process.env.SHADE_AGENT_PORT || '3140'),
    apiCodehash: getRequiredEnv('API_CODEHASH'),
    appCodehash: getRequiredEnv('APP_CODEHASH'),
    
    // Feature configuration
    // Do we need this? I think it can just be run externally, safer
    // includeTests: process.env.INCLUDE_TESTS === 'true',
    // noBoot: process.env.NO_BOOT === 'true',
    
    // Pre-computed derived values
    // isSandbox,
    networkId,
    isTEE,
} as const;
