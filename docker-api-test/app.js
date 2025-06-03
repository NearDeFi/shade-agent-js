import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';

const PORT = 3000;
const API_PORT = 3140;

import { getWorkerAccount, signWithWorker } from './dist/index.cjs';

const app = new Hono();

app.use('/*', cors());

app.get('/api/address', async (c) => {
    const res = await getWorkerAccount();

    return c.json(res);
});

app.get('/api/test-sign', async (c) => {
    const path = 'foo';
    const res = await signWithWorker(path, [
        ...(await createHash('sha256').update(Buffer.from('testing'))).digest(),
    ]);

    return c.json(res);
});

console.log('Server listening on port: ', PORT);

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
