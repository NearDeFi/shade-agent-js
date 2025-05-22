import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

import {
    deriveWorkerAccount,
    getAccount,
    getBalance,
    registerWorker,
    parseNearAmount,
    contractCall,
} from './dist/index.cjs';

// config
const PORT = process.env.PORT || 3000;

// DEBUGGING provide entropy
const hash = Buffer.from([
    178, 2, 207, 241, 229, 218, 132, 149, 56, 89, 120, 187, 1, 38, 42, 36, 224,
    96, 227, 87, 44, 203, 34, 69, 190, 148, 125, 178, 72, 196, 162, 58,
]);

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
    const res = await fetch('http://localhost:3000/api/sign', {
        method: 'POST',
        body: JSON.stringify({
            path,
            payload: [...hash],
        }),
    }).then((r) => r.json());

    return c.json(res);
});

async function boot() {
    // get account before switching to workerAccountId
    const account = await getAccount();
    // get new ephemeral (unless hash provided) worker account
    workerAccountId = await deriveWorkerAccount(hash ? hash : undefined);
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
    // register worker
    const res = await registerWorker('proxy');
    console.log('registerWorker', res);
}

boot();

console.log('Server listening on port: ', PORT);

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
