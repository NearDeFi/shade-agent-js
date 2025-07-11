const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

/**
 * @typedef {Object} ContractArgs
 * @property {string} methodName - The name of the method to call.
 * @property {Object} args - The arguments to pass to the method.
 */
type ContractArgs = {
    methodName: string;
    args: Record<string, any>;
};

/**
 * Calls a method on the agent account instance inside the API
 *
 * @param {string} methodName - The name of the agent method to call
 * @param {any} args - Arguments to pass to the agent account method
 * @returns A promise that resolves with the result of the agent method call.
 */
export async function agent(methodName: string, args: any = {}): Promise<any> {
    const res = await fetch(
        `http://${API_PATH}:${API_PORT}/api/agent/${methodName}`,
        {
            method: 'POST',
            body: JSON.stringify(args),
        },
    ).then((r) => r.json());
    return res;
}

/**
 * Retrieves the account ID of the agent.
 *
 * @returns {Promise<any>} A promise that resolves to the agent's account ID.
 */
export const agentAccountId = async (): Promise<{ accountId: string }> =>
    agent('accountId');

/**
 * Retrieves the agent's record from the agent contract
 *
 * @returns {Promise<any>} A promise that resolves to the agent's account ID.
 */
export const agentInfo = async (): Promise<{
    codehash: string;
    checksum: string;
}> =>
    agent('view', {
        methodName: 'get_agent',
        args: { account_id: (await agentAccountId()).accountId },
    });

/**
 * Contract view from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract view method.
 * @returns A promise that resolves with the result of the view method.
 */
export const agentView = async (args: ContractArgs): Promise<any> =>
    agent('view', args);

/**
 * Contract call from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract call method.
 * @returns A promise that resolves with the result of the call method.
 */
export const agentCall = async (args: ContractArgs): Promise<any> =>
    agent('call', args);

/**
 * Requests a digital signature from the agent for a given payload and path.
 *
 * @param {Object} params - The parameters for the signature request.
 * @param {string} params.path - The path associated with the signature request.
 * @param {string} params.payload - The payload to be signed.
 * @param {string} params.keyType - The type of key to use for signing (default is 'Ecdsa').
 * @returns A promise that resolves with the result of the signature request.
 */
export const requestSignature = async ({
    path,
    payload,
    keyType = 'Ecdsa',
}: {
    path: string;
    payload: string;
    keyType: string;
}): Promise<any> => {
    return agent('call', {
        methodName: 'request_signature',
        args: {
            path,
            payload,
            key_type: keyType,
        },
    });
};
