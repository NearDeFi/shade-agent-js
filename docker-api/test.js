import { createHash } from 'node:crypto';

import {
    agent,
    agentAccountId,
    agentInfo,
    agentCall,
    agentView,
    requestSignature,
} from './dist/index.cjs';

async function testAgentAccountId() {
    const res = await agentAccountId();

    console.log(res);
}

async function testAgentInfo() {
    const res = await agentInfo();

    console.log(res);
}

async function testAddKeyNotAllowed() {
    const res = await agent('addKey', {});

    console.log(res);
}

async function testGetState() {
    const res = await agent('getState');

    console.log(res);
}

async function testGetBalance() {
    const res = await agent('getBalance');

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

export async function run() {
    await testAgentAccountId();
    await testAgentInfo();
    await testAddKeyNotAllowed();
    await testGetState();
    await testGetBalance();
    await testView();
    await testCall();
    await testSign();
    await testSignEddsa();

    return true;
}
