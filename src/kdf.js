import { base_encode, base_decode } from 'near-api-js/lib/utils/serialize.js';
import * as EC from 'elliptic';
import * as jsSha3 from 'js-sha3';
const { sha3_256 } = jsSha3.default ? jsSha3.default : jsSha3;
import hash from 'hash.js';
import bs58check from 'bs58check';
import keccak from 'keccak';
import { generateSeedPhrase } from 'near-seed-phrase';

/**
 * Converts a NEAR public key string to an uncompressed hex point
 * @param {string} najPublicKeyStr - NEAR public key string
 * @returns {string} Uncompressed hex point
 */
export function najPublicKeyStrToUncompressedHexPoint(najPublicKeyStr) {
    const decodedKey = base_decode(najPublicKeyStr.split(':')[1]);
    return '04' + Buffer.from(decodedKey).toString('hex');
}

/**
 * Derives a child public key from a parent public key using secp256k1
 * @param {string} parentUncompressedPublicKeyHex - Parent public key in uncompressed hex format
 * @param {string} signerId - Signer ID for derivation
 * @param {string} [path=''] - Optional derivation path
 * @returns {Promise<string>} Derived child public key in uncompressed hex format
 */
export async function deriveChildPublicKey(
    parentUncompressedPublicKeyHex,
    signerId,
    path = '',
) {
    const ec = EC.default
        ? new EC.default.ec('secp256k1')
        : new EC.ec('secp256k1');
    const scalarHex = sha3_256(
        `near-mpc-recovery v0.1.0 epsilon derivation:${signerId},${path}`,
    );

    const x = parentUncompressedPublicKeyHex.substring(2, 66);
    const y = parentUncompressedPublicKeyHex.substring(66);

    // Create a point object from X and Y coordinates
    const oldPublicKeyPoint = ec.curve.point(x, y);

    // Multiply the scalar by the generator point G
    const scalarTimesG = ec.g.mul(scalarHex);

    // Add the result to the old public key point
    const newPublicKeyPoint = oldPublicKeyPoint.add(scalarTimesG);
    const newX = newPublicKeyPoint.getX().toString('hex').padStart(64, '0');
    const newY = newPublicKeyPoint.getY().toString('hex').padStart(64, '0');
    return '04' + newX + newY;
}

/**
 * Converts an uncompressed hex point to a Bitcoin address
 * @param {string} uncompressedHexPoint - Public key in uncompressed hex format
 * @param {Buffer} networkByte - Network version byte (e.g., 0x00 for mainnet, 0x6f for testnet)
 * @returns {Promise<string>} Bitcoin address in Base58Check format
 */
export async function uncompressedHexPointToBtcAddress(
    uncompressedHexPoint,
    networkByte,
) {
    // Step 1: SHA-256 hashing of the public key
    const publicKeyBytes = Uint8Array.from(
        Buffer.from(uncompressedHexPoint, 'hex'),
    );
    const sha256HashOutput = await crypto.subtle.digest(
        'SHA-256',
        publicKeyBytes,
    );

    // Step 2: RIPEMD-160 hashing on the result of SHA-256
    const ripemd160 = hash
        .ripemd160()
        .update(Buffer.from(sha256HashOutput))
        .digest();

    // Step 3: Adding network byte (0x00 for Bitcoin Mainnet, 0x6f for Testnet)
    const networkByteAndRipemd160 = Buffer.concat([
        networkByte,
        Buffer.from(ripemd160),
    ]);

    // Step 4: Base58Check encoding
    return bs58check.encode(networkByteAndRipemd160);
}

/**
 * Generates a Bitcoin address from a child public key
 * @param {Object} params - Bitcoin address generation parameters
 * @param {string} params.childPublicKey - Child public key in uncompressed hex format
 * @param {boolean} [params.isTestnet=true] - Whether to generate testnet (true) or mainnet (false) address
 * @returns {Promise<string>} Bitcoin address in Base58Check format
 */
export async function generateBtcAddress({ childPublicKey, isTestnet = true }) {
    const networkByte = Buffer.from([isTestnet ? 0x6f : 0x00]); // 0x00 for mainnet, 0x6f for testnet
    const address = await uncompressedHexPointToBtcAddress(
        childPublicKey,
        networkByte,
    );
    return address;
}

/**
 * Converts an uncompressed hex point to an Ethereum (EVM) address
 * @param {string} uncompressedHexPoint - Public key in uncompressed hex format
 * @returns {string} Ethereum address (40 hex chars with 0x prefix)
 */
function uncompressedHexPointToEvmAddress(uncompressedHexPoint) {
    // console.log('uncompressedHexPoint', uncompressedHexPoint);

    const address = keccak('keccak256')
        .update(Buffer.from(uncompressedHexPoint.substring(2), 'hex'))
        .digest('hex');

    // Evm address is last 20 bytes of hash (40 characters), prefixed with 0x
    return '0x' + address.substring(address.length - 40);
}

/**
 * Converts an uncompressed hex point to a NEAR implicit account
 * @param {string} uncompressedHexPoint - Public key in uncompressed hex format
 * @returns {Promise<{implicitAccountId: string, implicitSecpPublicKey: string, implicitAccountSecretKey: string}>} NEAR account details
 */
async function uncompressedHexPointToNearImplicit(uncompressedHexPoint) {
    // console.log('uncompressedHexPoint', uncompressedHexPoint);

    const implicitSecpPublicKey =
        'secp256k1:' +
        base_encode(Buffer.from(uncompressedHexPoint.substring(2), 'hex'));
    // get an implicit accountId from an ed25519 keyPair using the sha256 of the secp256k1 point as entropy
    const sha256HashOutput = await crypto.subtle.digest(
        'SHA-256',
        Buffer.from(uncompressedHexPoint, 'hex'),
    );
    const { publicKey, secretKey: implicitAccountSecretKey } =
        generateSeedPhrase(Buffer.from(sha256HashOutput));

    // DEBUG
    // console.log(secretKey);

    const implicitAccountId = Buffer.from(
        base_decode(publicKey.split(':')[1]),
    ).toString('hex');

    // DEBUG adding key
    // await addKey({
    //     accountId: implicitAccountId,
    //     secretKey,
    //     publicKey: implicitSecpPublicKey,
    // });

    return {
        implicitAccountId,
        implicitSecpPublicKey,
        implicitAccountSecretKey,
    };
}

/**
 * Generates a blockchain address from a public key
 * @param {Object} params - Address generation parameters
 * @param {string} params.publicKey - NEAR public key string
 * @param {string} params.accountId - Account ID for derivation
 * @param {string} [params.path] - Optional derivation path
 * @param {('evm'|'btc'|'bitcoin'|'dogecoin'|'near')} [params.chain='evm'] - Target blockchain
 * @returns {Promise<{address: string, publicKey: string, nearSecpPublicKey?: string, nearImplicitSecretKey?: string}>} Generated address and related keys
 */
export async function generateAddress({ publicKey, accountId, path, chain }) {
    console.log('publicKey', publicKey);
    console.log('accountId', accountId);
    console.log('path', path);
    console.log('chain', chain);

    let childPublicKey = await deriveChildPublicKey(
        najPublicKeyStrToUncompressedHexPoint(publicKey),
        accountId,
        path,
    );

    if (!chain) chain = 'evm';
    let address, nearSecpPublicKey, nearImplicitSecretKey;
    switch (chain) {
        case 'evm':
            address = uncompressedHexPointToEvmAddress(childPublicKey);
            break;
        case 'btc':
            address = await generateBtcAddress({
                childPublicKey,
                isTestnet: false,
            });
            break;
        case 'bitcoin':
            address = await generateBtcAddress({
                childPublicKey,
                isTestnet: true,
            });
            break;
        case 'dogecoin':
            address = await uncompressedHexPointToBtcAddress(
                childPublicKey,
                Buffer.from([0x71]),
            );
            break;
        case 'near':
            const {
                implicitAccountId,
                implicitSecpPublicKey,
                implicitAccountSecretKey,
            } = await uncompressedHexPointToNearImplicit(childPublicKey);
            address = implicitAccountId;
            nearSecpPublicKey = implicitSecpPublicKey;
            nearImplicitSecretKey = implicitAccountSecretKey;
            break;
    }

    return {
        address,
        publicKey: childPublicKey,
        nearSecpPublicKey,
        nearImplicitSecretKey,
    };
}
