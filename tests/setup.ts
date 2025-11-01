import { beforeAll, afterAll } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { Sandbox, SandboxConfig } from 'near-sandbox';
import { generateSeedPhrase } from 'near-seed-phrase';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair, KeyPairString, PublicKey } from '@near-js/crypto';
import { Account } from '@near-js/accounts';
import { NEAR } from '@near-js/tokens';
import { isTransactionSuccessful, runApiLocally, stopContainer } from './utils/utils';

// Global sandbox instance
let sandbox: Sandbox;

// Move this to env file or config file
const dockerTag = 'pivortex/api-image';
// const apiCodehash = '7600318fd4a63017799e4b34f6ea2e899244b7bd6118c977a3b93bb28b7f80c2';

// Global test setup for integration tests
beforeAll(async () => {
    console.log('Starting integration tests');
    
    // Check if Docker is running (NEAR sandbox requires Docker)
    try {
        const { execSync } = require('child_process');
        execSync('docker info', { stdio: 'ignore' });
    } catch (error) {
        throw new Error('Docker is not running. Please start Docker before running integration tests.');
    }

    //////////////////////////////////////////////////////////////
    // Set up NEAR sandbox, accounts, and contracts
    //////////////////////////////////////////////////////////////
    const rootAccountId = 'root.near';
    const sponsorAccountId = 'sponsor.root.near';
    const shadeContractAccountId = 'shade-contract.root.near';
    const {seedPhrase, publicKey, secretKey} = generateSeedPhrase();

    const sandboxConfig: SandboxConfig = {
        rpcPort: 3032,
        additionalAccounts: [
            {
                accountId: rootAccountId,
                publicKey: publicKey,
                privateKey: secretKey,
                balance: NEAR.toUnits(1000000)
            },
        ],
    };
    
    try {
        sandbox = await Sandbox.start({config: sandboxConfig});
    } catch (error) {
        console.error('Failed to start NEAR sandbox:', error);
        throw error;
    }

    const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
    const signer = KeyPairSigner.fromSecretKey(secretKey as KeyPairString);
    const rootAccount = new Account(rootAccountId, provider, signer);

    const sponsorAccountResult = await rootAccount.createAccount(sponsorAccountId, publicKey, NEAR.toUnits(1000));
    if (!isTransactionSuccessful(sponsorAccountResult)) {
        console.log('Sponsor account result:', sponsorAccountResult);
        throw new Error('Failed to create sponsor account');
    }
    const sponsorAccount = new Account(sponsorAccountId, provider, signer);
    
    const shadeContractAccountResult = await rootAccount.createAccount(shadeContractAccountId, publicKey, NEAR.toUnits(1000));
    if (!isTransactionSuccessful(shadeContractAccountResult)) {
        console.log('Shade contract account result:', shadeContractAccountResult);
        throw new Error('Failed to create shade contract account');
    }
    const shadeContractAccount = new Account(shadeContractAccountId, provider, signer);

    // Deploy proxy contract
    const contractPath = './contracts/proxy/target/near/contract.wasm';
    if (!existsSync(contractPath)) {
        throw new Error(`Contract file not found at: ${contractPath}.`);
    }
    const deployContractResult = await shadeContractAccount.deployContract(readFileSync(contractPath));
    if (!isTransactionSuccessful(deployContractResult)) {
        console.log('Deploy contract result:', deployContractResult);
        throw new Error('Failed to deploy proxy contract');
    }

    // Initialize proxy contract
    const initContractResult = await shadeContractAccount.callFunctionRaw({
        contractId: shadeContractAccountId,
        methodName: 'init',
        args: { owner_id: sponsorAccountId },
    });
    if (!isTransactionSuccessful(initContractResult)) {
        console.log('Init contract result:', initContractResult);
        throw new Error('Failed to initialize proxy contract');
    }

    // Approve codehash
    const approveCodehashResult = await sponsorAccount.callFunctionRaw({
        contractId: shadeContractAccountId,
        methodName: 'approve_codehash',
        args: { codehash: 'proxy' },
    });
    if (!isTransactionSuccessful(approveCodehashResult)) {
        console.log('Approve codehash result:', approveCodehashResult);
        throw new Error('Failed to approve codehash');
    }

    // Set environment variables
    const testEnvVars = {
        AGENT_CONTRACT_ID: shadeContractAccountId,
        SPONSOR_ACCOUNT_ID: sponsorAccountId,
        SPONSOR_SEED_PHRASE: seedPhrase,
        NEAR_RPC_JSON: JSON.stringify({
            nearRpcProviders: [{
                connectionInfo: { url: sandbox.rpcUrl.replace('127.0.0.1', 'host.docker.internal') },
            }]
        }),
        AUTO_FUND: 'true',
        FUND_AMOUNT: '0.3',
        NUM_EXTRA_KEYS: '0',
        AUTO_REGISTER: 'true',
        SHADE_AGENT_PORT: '3141',
        API_CODEHASH: 'proxy',
        APP_CODEHASH: 'proxy',
    };
    
    // Set environment variables from code
    Object.entries(testEnvVars).forEach(([key, value]) => {
        process.env[key] = value as string;
    });
    
    // Create .env.development.local file
    const envDevLocalPath = './tests/.env.development.local';
    
    const envContent = Object.entries(testEnvVars)
        .filter(([_, value]) => value)
        .map(([key, value]) => {
            if (key === 'NEAR_RPC_JSON') {
                return `${key}='${value}'`;
            }
            if (key === 'SPONSOR_SEED_PHRASE') {
                return `${key}="${value}"`;
            }
            return `${key}=${value}`;
        })
        .join('\n');
    
    writeFileSync(envDevLocalPath, envContent);

    // //////////////////////////////////////////////////////////////
    // // Run API locally
    // //////////////////////////////////////////////////////////////
    await runApiLocally(dockerTag, 'latest', 3141);

});

afterAll(async () => {
    console.log('Integration tests completed');
    if (sandbox) {
        try {
            await sandbox.tearDown();
        } catch (error) {
            console.error('Error tearing down sandbox:', error);
        }
    }
    await stopContainer();
});
