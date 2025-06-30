const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

/**
 * Gets the worker ephemeral account from the shade-agent-js api docker app
 * TODO error handling and return type checking
 */
export async function getAgentAccount(): Promise<any> {
    const res = await fetch(`http://${API_PATH}:${API_PORT}/api/address`).then(
        (r) => r.json(),
    );
    return res;
}

/**
 * Gets a signature with the worker account using the path and payload provided
 * @param {String} path - need a path to call MPC contract
 * @param {String} payload - need a payload (array of bytes) to sign
 * @returns {Promise<any>} The derived account ID
 *
 * TODO error handling and return type checking
 */
export async function signWithAgent(
    path: String,
    payload: Array<Number>,
    keyType: String = 'Ecdsa',
): Promise<any> {
    if (keyType !== 'Ecdsa' && keyType !== 'Eddsa') {
        throw new Error('Invalid key type. Must be "Ecdsa" or "Eddsa".');
    }
    const res = await fetch(`http://${API_PATH}:${API_PORT}/api/sign`, {
        method: 'POST',
        body: JSON.stringify({
            path,
            payload,
            key_type: keyType,
        }),
    }).then((r) => r.json());

    return res;
}
