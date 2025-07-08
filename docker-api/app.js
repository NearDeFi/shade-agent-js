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

// TODOs - update sandbox contract to pull hashes based on comments, include comment schema in docker-compose.yaml so hashes can be extracted with splits

// TODO - deploy contracts seperately and not on boot, Phala doesn't have near-cli-rs installed and don't want to wait for that on boot... too much

// Another option is to include near-cli-rs test this tomorrow

// config
const accountId = process.env.NEAR_ACCOUNT_ID.replaceAll('"', '');
const contractId = process.env.NEXT_PUBLIC_contractId.replaceAll('"', '');
const IS_SANDBOX = /sandbox/gim.test(contractId);
const PORT = process.env.SHADE_AGENT_PORT || 3140;
const API_CODEHASH = process.env.API_CODEHASH.replaceAll('"', '');
const APP_CODEHASH = process.env.APP_CODEHASH.replaceAll('"', '');

let agentAccountId;

const app = new Hono();

app.use('/*', cors());

app.get('/api/address', async (c) => {
    return c.json({ accountId: agentAccountId });
});

app.get('/api/agent-info', async (c) => {
    try {
        return c.json(await getAgentInfo(agentAccountId));
    } catch (e) {
        return c.json({ error: e.message });
    }
});

app.get('/api/fund-agent/:amount', async (c) => {
    try {
        // funding account
        const account = await getAccount();
        const res = await account.transfer({
            receiverId: agentAccountId,
            amount: parseNearAmount(c.req.param('amount')),
        });
        return c.json(res);
    } catch (e) {
        return c.json({ error: e.message });
    }
});

// must return either { result: <result> } or { error: <error message> }
app.post('/api/contract/:type', async (c) => {
    const type = c.req.param('type');
    const args = await c.req.json();

    // call or view, return response as json or fallback to text
    let res = null;
    try {
        res = await (type === 'call' ? contractCall(args) : contractView(args));
        try {
            res = { result: await res.json() };
        } catch (e) {
            res = { result: await res.text() };
        }
    } catch (e) {
        res = { error: e.message };
    }

    return c.json(res);
});

// helper used in boot and api endpoint above
const getAgentInfo = async (account_id) =>
    contractView({
        methodName: 'get_agent',
        args: {
            account_id,
        },
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
        console.log('funding', agentAccountId, diff);
        await account.transfer({
            receiverId: receiverId,
            amount,
        });
    }

    // check if worker is registered
    try {
        const getWorkerRes = await getAgentInfo(agentAccountId);
        if (
            getWorkerRes.codehash === IS_SANDBOX ? APP_CODEHASH : API_CODEHASH
        ) {
            console.log('getWorker response', true);
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
    console.log('getWorker response', false);

    // register worker
    let registerAgentRes;
    try {
        registerAgentRes = await registerAgent(!IS_SANDBOX && API_CODEHASH);
    } catch (e) {
        console.log('registerAgent Error:', e);
        registerAgentRes = false;
    }

    console.log('registerAgent response', registerAgentRes);
    console.log('Shade Agent API ready on port:', PORT);
}

boot();

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
