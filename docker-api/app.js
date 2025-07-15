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

let agentAccountId;
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

// account abstraction for calling arbitrary methods on the agent account
app.post('/api/agent/:method', async (c) => {
    const method = c.req.param('method');
    if (!ALLOWED_AGENT_METHODS.includes(method)) {
        return c.json({ error: method + ' not allowed' });
    }
    const account = await getAccount(agentAccountId);

    // create aliases for common methods
    account.getAccountId = () => ({
        accountId: agentAccountId,
    });
    account.call = contractCall;
    account.functionCall = contractCall;
    account.callFunction = contractCall;
    account.contractCall = contractCall;
    account.view = contractView;
    account.viewFunction = contractView;

    const args = await c.req.json();

    console.log('agent account', account.accountId);
    console.log('calling method', method);
    console.log('with args', args);

    let res;
    try {
        if (!Array.isArray(args)) {
            if (typeof args === 'object' && Object.keys(args).length === 0) {
                res = await account[method]();
            } else {
                res = await account[method](args);
            }
        } else {
            res = await account[method](...args);
        }
    } catch (e) {
        return c.json({ error: e.message });
    }

    console.log('response', res);

    if (method === 'getBalance') {
        return c.json({ balance: res.toString() });
    }
    if (method === 'getState') {
        return c.json({
            balance: {
                total: res.balance.total.toString(),
                usedOnStorage: res.balance.usedOnStorage.toString(),
                locked: res.balance.locked.toString(),
                available: res.balance.available.toString(),
            },
            storageUsage: res.storageUsage.toString(),
            codeHash: res.codehash,
        });
    }
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

    // console.log('balance', balance.available);
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
            console.log('get_agent result', true);
            console.log('Shade Agent API ready on port:', PORT);
            return;
        }
    } catch (e) {
        // if this isn't the error, then there's a bigger issue
        if (
            !/no worker found/gi.test(
                JSON.stringify(e, Object.getOwnPropertyNames(e)),
            )
        ) {
            throw e;
        }
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

    console.log('register_agent result', registerAgentRes);
    console.log('Shade Agent API ready on port:', PORT);
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
