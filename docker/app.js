import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

import { deriveWorkerAccount, registerWorker } from '../dist/index.cjs';

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
    // TBD
    return c.json({ workerAccountId });
});

async function boot() {
    workerAccountId = await deriveWorkerAccount(hash ? hash : undefined);
    console.log('workerAccountId', workerAccountId);
    const res = await registerWorker();

    console.log('registerWorker', res);
}

boot();

console.log('Server listening on port: ', PORT);

serve({
    fetch: app.fetch,
    port: PORT,
});
