import { createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import {
    getAccount,
    parseNearAmount,
} from './utils/near.js';
import { provider } from './utils/near.js';
import {
    registerAgent,
    deriveAgentAccount,
    nextAgentKey,
    addAgentKeys,
} from './utils/agentHelpers.js';
import { config } from './utils/config.js';

let agentAccountId: string | undefined, agentIsRegistered: boolean;

const app = new Hono();

app.use('/*', cors());

// if (config.includeTests) {
//     console.log('/api/test enabled');
//     app.get('/api/test', async (c) => {
//         const tests = await import('./test.js');
//         const passed = await tests.run();
//         return c.json({ passed });
//     });
// }

/**
 * Get agent account ID
 * @returns Promise with accountId or error message
 */
app.post('/api/agent/account-id', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    return c.json({ accountId: agentAccountId });
});

/**
 * Check if agent is registered with the contract
 * @returns Promise with isRegistered boolean status or error message
 */
app.post('/api/agent/is-registered', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    return c.json({ isRegistered: !!agentIsRegistered });
});

/**
 * Get the current balance of the agent account
 * @returns Promise with balance as string or error message
 */
app.post('/api/agent/balance', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const account = getAccount(agentAccountId);
    let balance: any;
    try {
        balance = await account.getBalance();
    } catch (e) {
        return c.json({ error: 'error getting balance', details: e });
    }
    return c.json({ balance: balance.toString() });
});

// Add register agent method 

/**
 * Request a signature from the agent using the contract's request_signature method
 * @param path - The path for the signature request
 * @param payload - The payload to be signed
 * @param keyType - The type of key to use for signing (default: 'Ecdsa')
 * @returns Promise with signature result or error message
 */
app.post('/api/agent/request-signature', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const { path, payload, keyType = 'Ecdsa' } = await c.req.json();

    // Rotate signing key
    nextAgentKey();

    const account = getAccount(agentAccountId);
    let res: any;
    try {
        res = await account.callFunction({
            contractId: config.contractId,
            methodName: 'request_signature',
            args: {
                path,
                payload,
                key_type: keyType,
            },
            gas: BigInt('30000000000000'),
            deposit: BigInt('1'),
            waitUntil: 'EXECUTED',
        });
    } catch (e) {
        return c.json({ error: 'error calling function', details: e });
    }

    return c.json(res);
});

/**
 * Call a function on the contract from the agent account
 * @param methodName - The name of the contract method to call
 * @param args - Arguments to pass to the contract method
 * @param deposit - Amount to deposit with the call (default: '0')
 * @param gas - Gas limit for the call (default: 30 Tgas)
 * @param waitUntil - When to wait until (default: 'EXECUTED')
 * @returns Promise with call result or error message
 */
app.post('/api/agent/call', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const {
        methodName,
        args,
        deposit = '0',
        gas = BigInt('30000000000000'),
        waitUntil = 'EXECUTED',
    } = await c.req.json();

    // Rotate signing key
    nextAgentKey();

    const account = getAccount(agentAccountId);
    let res: any;
    try {
    res = await account.callFunction({
        contractId: config.contractId,
        methodName,
        args,
        gas,
        deposit,
        waitUntil,
        });
    } catch (e) {
        return c.json({ error: 'error calling function', details: e });
    }

    return c.json(res);
});

/**
 * Call a view function on the contract (read-only operation)
 * @param methodName - The name of the contract method to call
 * @param args - Arguments to pass to the contract method
 * @returns Promise with view result or error message
 */
app.post('/api/agent/view', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const { methodName, args } = await c.req.json();

    let res: any;
    try {
        res = await provider.callFunction(
            config.contractId,
            methodName,
            args
        );
    } catch (e) {
        return c.json({ error: 'error calling function', details: e });
    }

    return c.json(res);
});

/**
 * Initialize and boot the agent application
 * @returns Promise<void>
 */
async function boot(): Promise<void> {
    const isTEE = config.isTEE;
    console.log('Running in TEE:', isTEE);
    
    // Get new worker account
    // Worker account is consistent for the same account Id for local
    // For TEE, we use the TEE entropy to derive the account Id
    agentAccountId = await deriveAgentAccount(
        !isTEE
            ? (
                  createHash('sha256').update(Buffer.from(config.sponsorAccountId))
              ).digest() // For local 
            : undefined, // For TEE 
    );
    console.log('worker agent NEAR account ID:', agentAccountId);

    // Fund agentAccountId
    console.log('Funding agent account');
    const agentAccount = getAccount(agentAccountId);
    const balance = await agentAccount.getBalance();
    
    if (balance < BigInt(parseNearAmount('0.25'))) {
        const amount = BigInt(parseNearAmount('0.3')) - BigInt(balance);
        const account = getAccount(config.sponsorAccountId);
        try {
            await account.transfer({
                receiverId: agentAccountId,
                amount,
            });
            console.log('Agent account funded:', agentAccountId, amount);
            // Wait for balance to update to prevent refunding loop
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (e) {
            console.log('Error funding agent account:', e);
            // Don't continue if funding failed
            throw new Error(`Failed to fund agent account: ${e}`);
        }
    }

    // Check if worker account is funded
    const agentBalance = await agentAccount.getBalance();
    if (agentBalance < BigInt(parseNearAmount('0.25'))) {
        throw new Error('Problem funding agent account');
    }

    // Check if worker is already registered for the local case
    if (!isTEE) {
        try {
            const getWorkerRes = await provider.callFunction(
                config.contractId,
                'get_agent',
                {
                    account_id: agentAccountId,
                },
            );
            if (
                (getWorkerRes as any)?.codehash
            ) {
                agentIsRegistered = true;
                console.log('Agent is already registered');
                console.log('Shade Agent API ready on port:', config.shadeAgentPort);
                return;
            }
        } catch (e) {
            console.log('get_agent error:', e);
        }
        console.log('Agent is not registered yet registered');
    }

    // Register worker
    try {
        // For local dev, we use the API codehash
        // For TEE, we use the TEE attestation by submitting undefined
        agentIsRegistered = await registerAgent(!isTEE ? config.apiCodehash : undefined);
        if (agentIsRegistered) {
            console.log('Agent is registered');
        } else {
           throw new Error('Failed to register agent');
        }
    } catch (e) {
        throw new Error(`Failed to register agent: ${e}`);
    }

    // Adding keys to the worker account
    const number = config.numExtraKeys;
    const addKeyRes = await addAgentKeys(number);
    if (!addKeyRes) {
        console.log('Failed to add keys');
    }
    console.log(`added ${number} keys:`, addKeyRes);

    console.log('Shade Agent API ready on port:', config.shadeAgentPort);
}

boot();

// if (!config.noBoot) {
//     boot();
// } else {
//     console.log('NO_BOOT == true');
//     console.log('Server is running on port:', config.shadeAgentPort);
// }

serve({
    fetch: app.fetch,
    port: config.shadeAgentPort,
    hostname: '0.0.0.0',
});
