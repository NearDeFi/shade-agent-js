import { createHash } from 'node:crypto';

import { getAgentAccountId, requestSignature } from './dist/index.cjs';

async function testAddress() {
    const res = await getAgentAccountId();

    console.log(res);
}

async function testSign() {
    const path = 'foo';
    const res = await requestSignature(
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
    const res = await requestSignature(
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
