import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

const PORT = 3000;
const API_PORT = 3140;
const HASH = Buffer.from([
    178, 2, 207, 241, 229, 218, 132, 149, 56, 89, 120, 187, 1, 38, 42, 36, 224,
    96, 227, 87, 44, 203, 34, 69, 190, 148, 125, 178, 72, 196, 162, 58,
]);

const app = new Hono();

app.use('/*', cors());

app.get('/api/address', async (c) => {
    const res = await fetch(
        `http://shade-agent-api:${API_PORT}/api/address`,
    ).then((r) => r.json());

    return c.json(res);
});

app.get('/api/test-sign', async (c) => {
    const path = 'foo';
    const res = await fetch(`http://shade-agent-api:${API_PORT}/api/sign`, {
        method: 'POST',
        body: JSON.stringify({
            path,
            payload: [...HASH],
        }),
    }).then((r) => r.json());

    return c.json(res);
});

console.log('Server listening on port: ', PORT);

serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
});
