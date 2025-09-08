const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

const getMethods = ['account-id', 'is-registered', 'balance'];

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
 * @param {path} methodName - The name of the agent method to call
 * @param {any} args - Arguments to pass to the agent account method
 * @returns A promise that resolves with the result of the agent method call.
 */
export async function apiCall(path: string, args: any = {}): Promise<any> {
    const isGet = getMethods.includes(path);
    const res = await fetch(
        `http://${API_PATH}:${API_PORT}/api/agent/${path}`,
        {
            method: isGet ? 'GET' : 'POST',
            body: isGet ? undefined : JSON.stringify(args),
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
    apiCall('account-id');

/**
 * Retrieves if the agent is registered.
 *
 * @returns {Promise<any>} A promise that resolves to boolean if the agent is registered.
 */
export const agentIsRegistered = async (): Promise<{ isRegistred: boolean }> =>
    apiCall('is-registered');

/**
 * Retrieves agent balance.
 *
 * @returns {Promise<any>} A promise that resolves to string of BigInt agent balance.
 */
export const agentBalance = async (): Promise<{ balance: string }> =>
    apiCall('balance');

/**
 * Contract view from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract view method.
 * @returns A promise that resolves with the result of the view method.
 */
export const agentView = async (args: ContractArgs): Promise<any> =>
    apiCall('view', args);

/**
 * Contract call from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract call method.
 * @returns A promise that resolves with the result of the call method.
 */
export const agentCall = async (args: ContractArgs): Promise<any> =>
    apiCall('call', args);

export enum SignatureKeyType {
    Eddsa = 'Eddsa',
    Ecdsa = 'Ecdsa',
}

/**
 * Requests a digital signature from the agent for a given payload and path.
 *
 * @param {Object} params - The parameters for the signature request.
 * @param {string} params.path - The path associated with the signature request.
 * @param {string} params.payload - The payload to be signed.
 * @param {SignatureKeyType} [params.keyType='Ecdsa'] - The type of key to use for signing (default is 'Ecdsa').
 * @returns A promise that resolves with the result of the signature request.
 */
export const requestSignature = async ({
    path,
    payload,
    keyType = SignatureKeyType.Ecdsa,
}: {
    path: string;
    payload: string;
    keyType?: SignatureKeyType;
}): Promise<any> => {
    return apiCall('request-signature', {
        path,
        payload,
        keyType,
    });
};
