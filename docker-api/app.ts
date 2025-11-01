import { createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { getAgentAccount, getSponsorAccount, getAgentAccountId, provider } from './utils/near.js';
import {
    registerAgent,
    deriveAgentAccount,
    nextAgentKey,
    addAgentKeys,
    fundAgentAccount,
} from './utils/agentHelpers.js';
import { config } from './utils/config.js';
import { detectTEE } from './utils/config.js';
import { JsonRpcProvider } from '@near-js/providers';

let agentIsRegistered: boolean;

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
 * Get the app status
 * @returns status message
 */
app.get("/", (c) => c.json({ message: "App is running" }));

/**
 * Get agent account ID
 * @returns Promise with accountId or error message
 */
app.post('/api/agent/account-id', async (c) => {
    try {
        const agentAccountId = getAgentAccountId();
        return c.json({ accountId: agentAccountId });
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Check if agent is registered in the agent contract
 * @returns Promise with isRegistered boolean status or error message
 */
app.post('/api/agent/is-registered', async (c) => {
    try {
        getAgentAccountId(); // Check if agent is booted
        return c.json({ isRegistered: !!agentIsRegistered });
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Get the current balance of the agent account
 * @returns Promise with balance as string or error message
 */
app.post('/api/agent/balance', async (c) => {
    try {
        const account = getAgentAccount();
        let balance: any;
        try {
            balance = await account.getBalance();
        } catch (e) {
            return c.json({ error: 'error getting balance', details: e });
        }
        return c.json({ balance: balance.toString() });
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Register the agent in the agent contract
 * @returns Promise with isRegistered boolean status or error message
 */
app.post('/api/agent/register', async (c) => {
    try {
        getAgentAccountId(); // Check if agent is booted
        if (agentIsRegistered) {
            return c.json({ error: 'agent already registered' });
        }
        // Add keys to the agent account
        await addAgentKeys(config.numExtraKeys);

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Register the agent
        const isRegistered = await registerAgent(!(await detectTEE()) ? config.apiCodehash : undefined);
        if (!isRegistered) {
            return c.json({ error: 'failed to register agent' });
        }
        agentIsRegistered = true;
        return c.json({ isRegistered });
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Request a signature using the agent contract's request_signature function
 * @param path - The path for the signature request
 * @param payload - The payload to be signed
 * @param keyType - The type of key to use for signing (default: 'Ecdsa')
 * @returns Promise with signature result or error message
 */
app.post('/api/agent/request-signature', async (c) => {
    try {
        const { path, payload, keyType = 'Ecdsa' } = await c.req.json();

        // Rotate signing key
        nextAgentKey();

        const account = getAgentAccount();
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
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Call a function on the agent contract from the agent account
 * @param methodName - The name of the contract method to call
 * @param args - Arguments to pass to the contract method
 * @param deposit - Amount to deposit with the call (optional)
 * @param gas - Gas limit for the call (optional)
 * @param waitUntil - When to wait until (optional)
 * @returns Promise with call result or error message
 */
app.post('/api/agent/call', async (c) => {
    try {
        const {
            methodName,
            args,
            deposit,
            gas,
            waitUntil,
        } = await c.req.json();

        // Rotate signing key
        nextAgentKey();

        const account = getAgentAccount();
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
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Call a view function on the agent contract (read-only operation)
 * @param methodName - The name of the contract method to call
 * @param args - Arguments to pass to the contract method
 * @param blockQuery - Block reference for the query (optional)
 * @returns Promise with view result or error message
 */
app.post('/api/agent/view', async (c) => {
    try {
        getAgentAccountId(); // Check if agent is booted
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
    } catch (error) {
        return c.json({ error: 'agent not booted' });
    }
});

/**
 * Initialize and boot up the agent 
 * @returns Promise<void>
 */
async function boot(): Promise<void> {
    const isTEE = await detectTEE();
    console.log('Running in TEE:', isTEE);
    
    // Get new agent account
    // Agent account is consistent for the same account Id for local
    // For TEE, we use the TEE entropy to derive the account Id
    const agentAccountId = await deriveAgentAccount(
        !isTEE
            ? (
                  createHash('sha256').update(Buffer.from(config.sponsorAccountId))
              ).digest() // For local 
            : undefined, // For TEE 
    );
    console.log('Agent NEAR account ID:', agentAccountId);

    // Fund the agent account
    if (config.autoFund) {
        await fundAgentAccount(config.fundAmount);
    }

    if (config.autoRegister) {
        // Check if agent is already registered for the local case
        if (!isTEE) {
            let getAgentRes: any;
            try {
                getAgentRes = await provider.callFunction(
                    config.contractId,
                    'get_agent',
                    {
                        account_id: agentAccountId
                    }
                );
            } catch (e) {
            }
            
            if (getAgentRes && (getAgentRes as any)?.codehash) {
                    agentIsRegistered = true;
                console.log('Agent is already registered');
                console.log('Shade Agent API ready on port:', config.shadeAgentPort);
                return;
            }
        }

        // Add keys to the agent account
        await addAgentKeys(config.numExtraKeys);

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Register the agent
        if (!agentIsRegistered) {
            agentIsRegistered = await registerAgent(!(await detectTEE()) ? config.apiCodehash : undefined);
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
