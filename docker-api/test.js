import { createHash } from 'node:crypto';

import {
    agentAccountId,
    agentInfo,
    agentCall,
    agentView,
    requestSignature,
} from './dist/index.cjs';

const sleep = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

async function testAgentAccountId() {
    const res = await agentAccountId();

    console.log(res);
}

async function testAgentInfo() {
    const res = await agentInfo();

    console.log(res);
}

async function testView() {
    const { accountId } = await agentAccountId();

    const res = await agentView({
        methodName: 'get_agent',
        args: {
            account_id: accountId,
        },
    });

    console.log(res);
}

async function testCall() {
    const path = 'foo';
    const res = await agentCall({
        methodName: 'request_signature',
        args: {
            path,
            payload: await createHash('sha256')
                .update(Buffer.from('testing'))
                .digest()
                .toString('hex')
                .padStart(2, '0'),
            key_type: 'Eddsa',
        },
    });

    console.log(res);
}

async function testSign() {
    const path = 'foo';
    const res = await requestSignature({
        path,
        payload: await createHash('sha256')
            .update(Buffer.from('testing'))
            .digest()
            .toString('hex')
            .padStart(2, '0'),
    });

    console.log(res);
}

async function testSignEddsa() {
    const path = 'foo';
    const res = await requestSignature({
        path,
        payload: await createHash('sha256')
            .update(Buffer.from('testing'))
            .digest()
            .toString('hex')
            .padStart(2, '0'),
        keyType: 'Eddsa',
    });

    console.log(res);
}

async function main() {
    await testAgentAccountId();
    await testAgentInfo();
    await testView();
    await testCall();
    await testSign();
    await testSignEddsa();
}

main();
