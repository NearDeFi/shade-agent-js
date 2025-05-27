import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: './.env.development.local' });
} else {
    // load .env in production
    dotenv.config();
}

import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

import {
    deriveWorkerAccount,
    getAccount,
    getBalance,
    registerWorker,
    parseNearAmount,
    contractView,
    contractCall,
} from './dist/index.cjs';

// TODOs - update sandbox contract, build, deploy, test against it with sample data from shade-agent-template/tests

// config
const PORT = process.env.SHADE_AGENT_PORT || 3140;

// DEBUGGING provide entropy
const HASH = Buffer.from([
    178, 2, 207, 241, 229, 218, 132, 149, 56, 89, 120, 187, 1, 38, 42, 36, 224,
    96, 227, 87, 44, 203, 34, 69, 190, 148, 125, 178, 72, 196, 162, 58,
]);
const CODEHASH = process.env.CODEHASH;

let workerAccountId;

const app = new Hono();

app.use('/*', cors());

app.get('/api/address', async (c) => {
    return c.json({ workerAccountId });
});

app.post('/api/sign', async (c) => {
    const args = await c.req.json();
    const res = await contractCall({
        methodName: 'get_signature',
        args,
    });

    return c.json(res);
});

// test get_signature method on contract
app.get('/api/test-sign', async (c) => {
    const path = 'foo';
    const res = await fetch(`http://localhost:${PORT}/api/sign`, {
        method: 'POST',
        body: JSON.stringify({
            path,
            payload: [...HASH],
        }),
    }).then((r) => r.json());

    return c.json(res);
});

async function boot() {
    // get account before switching to workerAccountId
    const account = await getAccount();
    // get new ephemeral (unless hash provided) worker account
    workerAccountId = await deriveWorkerAccount(HASH ? HASH : undefined);
    console.log('workerAccountId', workerAccountId);
    // fund workerAccountId
    const balance = await getBalance(workerAccountId);
    // console.log('balance', balance.available);
    if (BigInt(balance.available) < BigInt(parseNearAmount('0.25'))) {
        console.log('funding account');
        await account.sendMoney(
            workerAccountId,
            BigInt(parseNearAmount('0.3')) - BigInt(balance.available),
        );
    }
    // check if worker is registered
    try {
        const getWorkerRes = await contractView({
            methodName: 'get_worker',
            args: {
                account_id: workerAccountId,
            },
        });
        if (getWorkerRes.codehash === CODEHASH) {
            return console.log('getWorkerRes', true);
        }
    } catch (e) {
        if (
            /no worker found/gi.test(
                JSON.stringify(e, Object.getOwnPropertyNames(e)),
            )
        ) {
            console.log('no worker found');
        }
        // swallow any other errors, assume the worker isn't registered
    }
    console.log('getWorkerRes', false);

    // register worker
    let registerWorkerRes;
    try {
        registerWorkerRes = await registerWorker(CODEHASH);
    } catch (e) {
        console.log('registerWorker Error:', e);
        registerWorkerRes = false;
    }

    console.log('registerWorkerRes', registerWorkerRes);
}

boot();

console.log('Server listening on port: ', PORT);

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
