import { parseSeedPhrase } from 'near-seed-phrase';
import { getProvider } from './nearProvider';
import { KeyPairSigner } from '@near-js/signers';
import { Account } from '@near-js/accounts';
import { NEAR } from '@near-js/tokens';
import { actionCreators } from '@near-js/transactions';
import { KeyPair, KeyPairString, PublicKey } from '@near-js/crypto';
import { config } from './config';

/**
 * Converts a NEAR amount string to bigint units
 * @param amt - Amount as string (e.g., "1.5" for 1.5 NEAR)
 * @returns Amount as bigint in yoctoNEAR units
 */
export const parseNearAmount = (amt: string): bigint => NEAR.toUnits(amt);

// Global state for accounts and signers
let agentAccountId: string | null = null;
let sponsorSigner: KeyPairSigner | undefined;
let currentAgentSigner: KeyPairSigner | undefined;

// Initialize sponsor signer from seed phrase
if (config.sponsorAccountId && config.sponsorSeedPhrase) {
    const { secretKey } = parseSeedPhrase(config.sponsorSeedPhrase);
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    sponsorSigner = new KeyPairSigner(keyPair);
}

export const provider = getProvider(config.nearRpcJson);

// Helpers

/**
 * Sets the agent account ID and current signer
 * @param accountId - Agent account ID
 * @param secretKey - Agent's secret key
 * @returns void
 */
export const setAgentKey = (accountId: string, secretKey: string): void => {
    if (!accountId || !secretKey) {
        return console.error('ERROR: setAgentKey missing args');
    }
    // User passed in a seed phrase
    if (secretKey.indexOf(' ') > -1) {
        secretKey = parseSeedPhrase(secretKey).secretKey;
    }
    agentAccountId = accountId;
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    // Set current agent signer
    currentAgentSigner = new KeyPairSigner(keyPair);
};

/**
 * Converts a public key string to an implicit account ID
 * @param pubKeyStr - Public key string
 * @returns Implicit account ID (hex encoded)
 */
export const getImplicit = (pubKeyStr: string): string =>
    Buffer.from(PublicKey.from(pubKeyStr).data).toString('hex').toLowerCase();

/**
 * Gets the agent account instance
 * @returns NEAR Account instance for the agent
 * @throws Error if agent account ID is not set
 */
export const getAgentAccount = (): Account => {
    if (!agentAccountId) {
        throw new Error('Agent account ID is not set. Call deriveAgentAccount first.');
    }
    if (!currentAgentSigner) {
        throw new Error('Agent signer is not set. Call setAgentKey first.');
    }
    return new Account(agentAccountId, provider, currentAgentSigner);
};

/**
 * Gets the sponsor account instance
 * @returns NEAR Account instance for the sponsor
 * @throws Error if sponsor signer is not set
 */
export const getSponsorAccount = (): Account => {
    if (!config.sponsorAccountId) {
        throw new Error('Sponsor account ID is not configured');
    }
    if (!sponsorSigner) {
        throw new Error('Sponsor signer is not set');
    }
    return new Account(config.sponsorAccountId, provider, sponsorSigner);
};

/**
 * Gets the agent account ID
 * @returns The agent account ID
 * @throws Error if agent account ID is not set
 */
export const getAgentAccountId = (): string => {
    if (!agentAccountId) {
        throw new Error('Agent account ID is not set. Call deriveAgentAccount first.');
    }
    return agentAccountId;
};

/**
 * Adds multiple keys to the agent account from secret keys
 * @param secrets - Array of secret keys to add to the account
 * @returns void
 */
export const addKeysFromSecrets = async (secrets: string[]): Promise<void> => {
    const account = getAgentAccount();
    const actions: any[] = [];
    try {
        for (let secretKey of secrets) {
            const keyPair = KeyPair.fromString(secretKey as KeyPairString);
            actions.push(
                actionCreators.addKey(
                    keyPair.getPublicKey(),
                    actionCreators.fullAccessKey(),
                ),
            );
        }
        let tx: any;
        try {
            tx = await account.createSignedTransaction(
                account.accountId,
                actions,
            );
        } catch (error) {
            throw new Error(`Failed to create signed transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        let txRes: any;
        try {
            txRes = await account.provider.sendTransaction(tx);
        } catch (error) {
            throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        if ((txRes.status as any).SuccessValue !== '') {
            throw new Error('Failed to add key');
        }
    } catch (e) {
        throw new Error(`Failed to add key: ${e}`);
    }
};

