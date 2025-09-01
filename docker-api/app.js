import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: './.env.development.local' });
} else {
    // load .env in production
    dotenv.config();
}
import { createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

import {
    getAccount,
    getBalance,
    registerAgent,
    parseNearAmount,
    contractView,
    contractCall,
    deriveAgentAccount,
    // } from '@neardefi/shade-agent-js';
} from './dist/index.cjs';

// config
const contractId = process.env.NEXT_PUBLIC_contractId.replaceAll('"', '');
const IS_SANDBOX = /sandbox/gim.test(contractId);
const PORT = process.env.SHADE_AGENT_PORT || 3140;
// might not be defined for test runner
const accountId = process.env.NEAR_ACCOUNT_ID?.replaceAll('"', '');
const API_CODEHASH = process.env.API_CODEHASH?.replaceAll('"', '');
const APP_CODEHASH = process.env.APP_CODEHASH?.replaceAll('"', '');

let agentIsBooted,
    agentAccountId,
    agentIsRegistered = false;

const ALLOWED_AGENT_METHODS = [
    'getAccountId',
    'call',
    'callFunction',
    'functionCall',
    'view',
    'viewFunction',
    'getBalance',
    'getState',
];
const app = new Hono();

app.use('/*', cors());

if (!!process.env.INCLUDE_TESTS) {
    console.log('/api/test enabled');
    app.get('/api/test', async (c) => {
        const tests = await import('./test.js');
        const passed = await tests.run();
        return c.json({ passed });
    });
}

// new api methods

/**
 * Get agent account ID
 * @returns {Promise<{accountId: string}|{error: string}>}
 */
app.get('/api/agent/account-id', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    return c.json({ accountId: agentAccountId });
});

/**
 *  Is agent registered
 * @returns {Promise<{isRegistered: boolean}|{error: string}>}
 */
app.get('/api/agent/is-registered', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    return c.json({ isRegistered: agentIsRegistered });
});

/**
 * Get agent balance
 * @returns {Promise<{balance: string}|{error: string}>}
 */
app.get('/api/agent/balance', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    const account = await getAccount(agentAccountId);
    const balance = await account.getBalance();
    return c.json({ balance: balance.toString() });
});

/**
 * Request Signature
 */
app.post('/api/agent/request-signature', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    const account = await getAccount(agentAccountId);
    const { path, payload, keyType = 'Ecdsa' } = await c.req.json();

    const res = await account.callFunction({
        contractId,
        methodName: 'request_signature',
        args: {
            path,
            payload,
            key_type: keyType,
        },
        gas: '30000000000000', // 30 Tgas
    });

    return c.json(res);
});

/**
 * Call function from agent account
 */
app.post('/api/agent/call', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    const {
        methodName,
        args,
        gas = '30000000000000',
        deposit = '0',
    } = await c.req.json();

    const res = await contractCall({
        methodName,
        args,
        gas,
        deposit,
    });

    return c.json(res);
});

/**
 * View function from agent provider
 */
app.post('/api/agent/view', async (c) => {
    if (!agentIsBooted) {
        return c.json({ error: 'agent not booted' });
    }
    const { methodName, args } = await c.req.json();

    const res = await contractView({
        methodName,
        args,
    });

    return c.json(res);
});

async function boot() {
    // get account before switching to agentAccountId
    const account = await getAccount(accountId);
    const entropy =
        /proxy/gim.test(process.env.NEXT_PUBLIC_contractId) ||
        (process.env.FIXED_WORKER_ACCOUNT &&
            process.env.FIXED_WORKER_ACCOUNT === 'true');
    // get new ephemeral (unless entropy was provided) worker account
    agentAccountId = await deriveAgentAccount(
        entropy
            ? (
                  await createHash('sha256').update(Buffer.from([accountId]))
              ).digest()
            : undefined,
    );
    console.log('worker agent NEAR account ID:', agentAccountId);
    // fund agentAccountId
    const balance = await getBalance(agentAccountId);
    if (balance < BigInt(parseNearAmount('0.25'))) {
        const amount = BigInt(parseNearAmount('0.3')) - BigInt(balance);
        try {
            await account.transfer({
                receiverId: agentAccountId,
                amount,
            });
            console.log('Agent account funded:', agentAccountId, amount);
        } catch (e) {
            console.log('Error funding agent account:', e.type);
        }
    }

    // check if worker is registered
    try {
        const getWorkerRes = await contractView({
            methodName: 'get_agent',
            args: {
                account_id: agentAccountId,
            },
        });
        if (
            getWorkerRes.codehash === IS_SANDBOX ? APP_CODEHASH : API_CODEHASH
        ) {
            agentIsRegistered = true;
            console.log('get_agent result', true);
            console.log('Shade Agent API ready on port:', PORT);
            agentIsBooted = true;
            return;
        }
    } catch (e) {
        console.log('get_agent error:', e);
    }
    console.log('get_agent result', false);

    // register worker
    let registerAgentRes;
    try {
        registerAgentRes = await registerAgent(!IS_SANDBOX && API_CODEHASH);
    } catch (e) {
        console.log('register_agent error:', e);
        registerAgentRes = false;
    }

    agentIsRegistered = registerAgent;
    console.log('register_agent result', registerAgentRes);
    console.log('Shade Agent API ready on port:', PORT);
    agentIsBooted = true;
}

if (!process.env.NO_BOOT) {
    boot();
} else {
    console.log('NO_BOOT == true');
    console.log('Server is running on port:', PORT);
}

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
