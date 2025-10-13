import { createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { getAccount, provider } from './utils/near.js';
import {
    registerAgent,
    deriveAgentAccount,
    nextAgentKey,
    addAgentKeys,
    fundAgentAccount,
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

/**
 * Register the agent with the contract
 * @returns Promise with isRegistered boolean status or error message
 */
app.post('/api/agent/register', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    if (agentIsRegistered) {
        return c.json({ error: 'agent already registered' });
    }
    // Add keys to the agent account
    await addAgentKeys(config.numExtraKeys);

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Register the agent
    const isRegistered = await registerAgent(!config.isTEE ? config.apiCodehash : undefined);
    if (!isRegistered) {
        return c.json({ error: 'failed to register agent' });
    }
    agentIsRegistered = true;
    return c.json({ isRegistered });
});

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
            deposit: BigInt('1'),
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
 * @param deposit - Amount to deposit with the call (optional)
 * @param gas - Gas limit for the call (optional)
 * @param waitUntil - When to wait until (optional)
 * @returns Promise with call result or error message
 */
app.post('/api/agent/call', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const {
        methodName,
        args,
        deposit,
        gas,
        waitUntil,
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
 * @param blockQuery - Block reference for the query (optional)
 * @returns Promise with view result or error message
 */
app.post('/api/agent/view', async (c) => {
    if (agentAccountId == undefined) {
        return c.json({ error: 'agent not booted' });
    }
    const { methodName, args, blockQuery } = await c.req.json();

    let res: any;
    try {
        res = await provider.callFunction(
            config.contractId,
            methodName,
            args,
            blockQuery
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

    // Fund the agent account
    if (config.autoFund) {
        await fundAgentAccount(config.fundAmount);
    }

    if (config.autoRegister) {
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

        // Add keys to the agent account
        await addAgentKeys(config.numExtraKeys);

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Register the agent
        if (!agentIsRegistered) {
            agentIsRegistered = await registerAgent(!isTEE ? config.apiCodehash : undefined);
        }
    }

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
