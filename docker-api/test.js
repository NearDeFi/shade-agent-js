import { createHash } from 'node:crypto';

import { getAgentAccount, signWithAgent } from './dist/index.cjs';

async function testAddress() {
    const res = await getAgentAccount();

    console.log(res);
}

async function testSign() {
    const path = 'foo';
    const res = await signWithAgent(
        path,
        await createHash('sha256')
            .update(Buffer.from('testing'))
            .digest()
            .toString('hex')
            .padStart(2, '0'),
    );

    console.log(res);
}

async function testSignEddsa() {
    const path = 'foo';
    const res = await signWithAgent(
        path,
        await createHash('sha256')
            .update(Buffer.from('testing'))
            .digest()
            .toString('hex')
            .padStart(2, '0'),
        'Eddsa',
    );

    console.log(res);
}

testAddress();
testSign();
testSignEddsa();
