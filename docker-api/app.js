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
    setKey,
    deriveWorkerAccount,
    getAccount,
    getBalance,
    registerWorker,
    parseNearAmount,
    contractView,
    contractCall,
} from '@neardefi/shade-agent-js';

// TODOs - update sandbox contract to pull hashes based on comments, include comment schema in docker-compose.yaml so hashes can be extracted with splits

// TODO - deploy contracts seperately and not on boot, Phala doesn't have near-cli-rs installed and don't want to wait for that on boot... too much

// Another option is to include near-cli-rs test this tomorrow

// config
const accountId = process.env.NEAR_ACCOUNT_ID.replaceAll('"', '');
const seedPhrase = process.env.NEAR_SEED_PHRASE.replaceAll('"', '');
const contractId = process.env.NEXT_PUBLIC_contractId.replaceAll('"', '');
const IS_SANDBOX = /sandbox/gim.test(contractId);
const PORT = process.env.SHADE_AGENT_PORT || 3140;
const API_CODEHASH = process.env.API_CODEHASH.replaceAll('"', '');
const APP_CODEHASH = process.env.APP_CODEHASH.replaceAll('"', '');

let workerAccountId;

const app = new Hono();

app.use('/*', cors());

app.get('/api/address', async (c) => {
    return c.json({ workerAccountId });
});

app.get('/api/fund-worker/:amount', async (c) => {
    const account = await getAccount();
    const res = await account.sendMoney(workerAccountId, parseNearAmount(c.req.param('amount')));
    return c.json(res);
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
            payload: [
                ...(
                    await createHash('sha256').update(Buffer.from('testing'))
                ).digest(),
            ],
        }),
    }).then((r) => r.json());

    return c.json(res);
});

async function boot() {
    // get account before switching to workerAccountId
    const account = await getAccount(accountId);
    const entropy = process.env.FIXED_WORKER_ACCOUNT && process.env.FIXED_WORKER_ACCOUNT === 'true';
    // get new ephemeral (unless entropy was provided) worker account
    workerAccountId = await deriveWorkerAccount(
        entropy
            ? (await createHash('sha256').update(Buffer.from([accountId]))).digest()
            : undefined,
    );
    console.log('worker agent NEAR account ID:', workerAccountId);
    // fund workerAccountId
    const balance = await getBalance(workerAccountId);

    // console.log('balance', balance.available);
    if (BigInt(balance.available) < BigInt(parseNearAmount('0.25'))) {
        const diff = BigInt(parseNearAmount('0.3')) - BigInt(balance.available);
        console.log('funding', workerAccountId, diff);
        // just to be sure we're using the funding account latest details
        setKey(accountId, seedPhrase);
        await account.sendMoney(workerAccountId, diff);
    }

    // check if worker is registered
    try {
        const getWorkerRes = await contractView({
            methodName: 'get_worker',
            args: {
                account_id: workerAccountId,
            },
        });
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
    let registerWorkerRes;
    try {
        registerWorkerRes = await registerWorker(!IS_SANDBOX && API_CODEHASH);
    } catch (e) {
        console.log('registerWorker Error:', e);
        registerWorkerRes = false;
    }

    console.log('registerWorker response', registerWorkerRes);
    console.log('Shade Agent API ready on port:', PORT);
}

boot();

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
