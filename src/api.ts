const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

/**
 * Gets the worker ephemeral account from the shade-agent-js api docker app
 * TODO error handling and return type checking
 */
export async function getAgentAccountId(): Promise<any> {
    const res = await fetch(`http://${API_PATH}:${API_PORT}/api/address`).then(
        (r) => r.json(),
    );
    return res;
}

/**
 * See args to nearProvider.agentView
 */
export async function agentView(args): Promise<any> {
    // must return json either { result: <result> } or { error: <error message> }
    // it will not error and always return status 200 if the agent api is running
    return await fetch(`http://${API_PATH}:${API_PORT}/api/contract/view`, {
        method: 'POST',
        body: JSON.stringify(args),
    }).then((r) => r.json());
}

/**
 * See args to nearProvider.contractCall
 */
export async function agentCall(args): Promise<any> {
    // must return json either { result: <result> } or { error: <error message> }
    // it will not error and always return status 200 if the agent api is running
    return await fetch(`http://${API_PATH}:${API_PORT}/api/contract/call`, {
        method: 'POST',
        body: JSON.stringify(args),
    }).then((r) => r.json());
}

/**
 * Gets a signature with the worker account using the path and payload provided
 * @param {String} path - need a path to call MPC contract
 * @param {String} payload - need a payload (array of bytes) to sign
 * @param {String} keyType - Ecdsa (default) or Eddsa
 * @returns {Promise<any>} The derived account ID
 *
 * TODO error handling and return type checking
 */
export async function requestSignature(
    path: String,
    payload: Array<Number>,
    keyType: String = 'Ecdsa',
): Promise<any> {
    if (keyType !== 'Ecdsa' && keyType !== 'Eddsa') {
        throw new Error('Invalid key type. Must be "Ecdsa" or "Eddsa".');
    }
    return await agentCall({
        methodName: 'request_signature',
        args: {
            path,
            payload,
            key_type: keyType,
        },
    });
}
