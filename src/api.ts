const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';

/**
 * Uber agent method to call account methods from agent account
 * TODO add comment
 */
export async function agent(methodName, args = {}): Promise<any> {
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
 * Wrappers
 */
export const agentAccountId = async (): Promise<any> => agent('accountId');
export const agentInfo = async (): Promise<any> =>
    agent('view', {
        methodName: 'get_agent',
        args: { account_id: (await agentAccountId()).accountId },
    });

export const agentView = async (args): Promise<any> => agent('view', args);
export const agentCall = async (args): Promise<any> => agent('call', args);

/**
 * Gets a signature with the worker account using the path and payload provided
 * @param {String} path - need a path to call MPC contract
 * @param {String} payload - need a payload (array of bytes) to sign
 * @param {String} keyType - Ecdsa (default) or Eddsa
 * @returns {Promise<any>} The derived account ID
 */
export const requestSignature = async (args): Promise<any> => {
    if (!args.keyType) {
        args.keyType = 'Ecdsa';
    }
    args.key_type = args.keyType;
    delete args.keyType; // remove keyType to match the contract's expected args
    return agent('call', { methodName: 'request_signature', args });
};
