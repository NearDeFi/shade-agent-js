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

// Local vars for module
let _accountId: string | undefined, signer: KeyPairSigner | undefined;

// If we're running within the API image and we have ENV vars for NEAR_ACCOUNT_ID and NEAR_SEED_PHRASE
if (config.sponsorAccountId && config.sponsorSeedPhrase) {
    _accountId = config.sponsorAccountId;
    const { secretKey } = parseSeedPhrase(config.sponsorSeedPhrase);
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    signer = new KeyPairSigner(keyPair);
}

export const provider = getProvider(config.nearRpcJson);

// Helpers

/**
 * Sets a key pair for an account in the in-memory keystore
 * @param accountId - NEAR account ID
 * @param secretKey - Account's secret key
 * @returns void
 */
export const setKey = (accountId: string, secretKey: string): void => {
    if (!accountId || !secretKey) {
        return console.log('ERROR: setKey missing args');
    }
    // User passed in a seed phrase
    if (secretKey.indexOf(' ') > -1) {
        secretKey = parseSeedPhrase(secretKey).secretKey;
    }
    _accountId = accountId;
    const keyPair = KeyPair.fromString(secretKey as KeyPairString);
    // Set in-memory keystore only
    signer = new KeyPairSigner(keyPair);
};

/**
 * Converts a public key string to an implicit account ID
 * @param pubKeyStr - Public key string
 * @returns Implicit account ID (hex encoded)
 */
export const getImplicit = (pubKeyStr: string): string =>
    Buffer.from(PublicKey.from(pubKeyStr).data).toString('hex').toLowerCase();

/**
 * Creates a NEAR Account instance
 * @param id - NEAR account ID
 * @returns NEAR Account instance
 * @throws Error if account ID is required but not provided
 */
export const getAccount = (id: string | undefined = _accountId): Account => {
    if (!id) {
        throw new Error('Account ID is required');
    }
    return new Account(id, provider, signer);
};

/**
 * Returns the current account ID
 * @returns Current account ID or undefined
 */
export const getCurrentAccountId = (): string | undefined => _accountId;

/**
 * Adds multiple keys to the current account from secret keys
 * @param secrets - Array of secret keys to add to the account
 * @returns void
 */
export const addKeysFromSecrets = async (secrets: string[]): Promise<void> => {
    const account = getAccount();
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
        const tx = await account.createSignedTransaction(
            account.accountId,
            actions,
        );
        const txRes = await account.provider.sendTransaction(tx);
        if ((txRes.status as any).SuccessValue !== '') {
            throw new Error('Failed to add key');
        }
    } catch (e) {
        throw new Error(`Failed to add key: ${e}`);
    }
};

