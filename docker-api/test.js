import { createHash } from 'node:crypto';

import {
    agentAccountId,
    agentBalance,
    agentIsRegistered,
    agentCall,
    agentView,
    requestSignature,
} from './dist/index.cjs';

async function testAgentAccountId() {
    const res = await agentAccountId();

    console.log(res);
}

async function testGetBalance() {
    const res = await agentBalance();

    console.log(res);
}

async function testIsRegistered() {
    const res = await agentIsRegistered();

    console.log(res);
}

async function testAgentView() {
    const { accountId } = await agentAccountId();

    const res = await agentView({
        methodName: 'get_agent',
        args: { account_id: accountId },
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
                .toString('hex'),
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

export async function run() {
    await testAgentAccountId();
    await testGetBalance();
    await testIsRegistered();
    await testAgentView();
    await testCall();
    await testSign();
    await testSignEddsa();

    return true;
}

run();
