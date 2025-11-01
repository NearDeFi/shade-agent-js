import { existsSync } from 'fs';

// Type definitions matching near-api-js
export type SerializedReturnValue = string | number | boolean | object;
export type TxExecutionStatus = 'NONE' | 'INCLUDED' | 'INCLUDED_FINAL' | 'EXECUTED' | 'FINAL' | 'EXECUTED_OPTIMISTIC';
export type Finality = 'optimistic' | 'near-final' | 'final';
export type BlockReference = { blockId: string } | { finality: Finality };

// Signature response types
export interface Secp256k1SignatureResponse {
  scheme: 'Secp256k1';
  big_r: {
    affine_point: string;
  };
  s: {
    scalar: string;
  };
  recovery_id: number;
}

export interface Ed25519SignatureResponse {
  scheme: 'Ed25519';
  signature: number[];
}

export type SignatureResponse = Secp256k1SignatureResponse | Ed25519SignatureResponse;

export enum SignatureKeyType {
    Eddsa = 'Eddsa',
    Ecdsa = 'Ecdsa',
}

const API_PORT = process.env.API_PORT || 3140;

/**
 * Detects if the application is running in a TEE 
 * @returns boolean - true if running in a TEE, false otherwise
 */
function detectTEE(): boolean {
    // First check if socket exists
    try {
        if (!existsSync('/var/run/tappd.sock')) {
            return false;
        }
        return true;
    } catch (error) {
        return false;
    }
}

const API_PATH = detectTEE() ? 'shade-agent-api' : 'localhost';

/**
 * Makes a call to the shade-agent-api
 * @param path - The name of the method to call
 * @param args - Arguments to pass to the method
 * @returns A promise that resolves with the result of the API call
 */
export async function apiCall(path: string, args: any = {}): Promise<any> {
    const res = await fetch(
        `http://${API_PATH}:${API_PORT}/api/agent/${path}`,
        {
            method: 'POST',
            body: JSON.stringify(args),
        },
    ).then((r) => r.json());
    return res;
}

/**
 * Retrieves the account ID of the agent
 * @returns A promise that resolves to the agent's account ID
 */
export const agentAccountId = async (): Promise<string> => {
    const result = await apiCall('account-id');
    return result.accountId;
};

/**
 * Retrieves if the agent is registered
 * @returns A promise that resolves to true if the agent is registered, false otherwise
 */
export const agentIsRegistered = async (): Promise<boolean> => {
    const result = await apiCall('is-registered');
    return result.isRegistered;
};

/**
 * Retrieves agent balance
 * @returns A promise that resolves to the agent's balance in yoctoNEAR 
 */
export const agentBalance = async (): Promise<bigint> => {
    const result = await apiCall('balance');
    return BigInt(result.balance);
};

/**
 * Registers the agent if it is not already registered
 * @returns A promise that resolves to true if the agent registered successfully, false otherwise
 */
export const agentRegister = async (): Promise<boolean> => {
    const result = await apiCall('register');
    return result.isRegistered;
};

/**
 * Call a view function on the agent contract and return the result
 * @param params
 * @param params.methodName The method that will be called
 * @param params.args Arguments, either as a valid JSON Object or a raw Uint8Array
 * @param params.blockQuery (optional) Block reference for the query (default: { finality: 'optimistic' })
 * @returns A promise that resolves with the result of the view function call
 */
export const agentView = async <T extends SerializedReturnValue>(params: {
    methodName: string;
    args: Uint8Array | Record<string, any>;
    blockQuery?: BlockReference;
}): Promise<T> => {
    return apiCall('view', params) as Promise<T>;
};

/**
 * Call a function on the agent contract and return the result
 * @param params
 * @param params.methodName The method that will be called
 * @param params.args Arguments, either as a valid JSON Object or a raw Uint8Array
 * @param params.deposit (optional) Amount of NEAR Tokens to attach to the call
 * @param params.gas (optional) Amount of GAS to use attach to the call
 * @param params.waitUntil (optional) Transaction finality to wait for
 * @returns A promise that resolves with the result of the contract function call
 */
export const agentCall = async <T extends SerializedReturnValue>(params: {
    methodName: string;
    args: Uint8Array | Record<string, any>;
    deposit?: bigint | string | number;
    gas?: bigint | string | number;
    waitUntil?: TxExecutionStatus;
}): Promise<T> => {
    return apiCall('call', params) as Promise<T>;
};

/**
 * Requests a digital signature from the agent for a given payload and path
 * @param params - The parameters for the signature request
 * @param params.path - The path associated with the signature request
 * @param params.payload - The payload to be signed
 * @param params.keyType - The type of key to use for signing (default is 'Ecdsa')
 * @returns A promise that resolves with the result of the signature request
 */
export const requestSignature = async ({
    path,
    payload,
    keyType = SignatureKeyType.Ecdsa,
}: {
    path: string;
    payload: string;
    keyType?: SignatureKeyType;
}): Promise<SignatureResponse> => {
    return apiCall('request-signature', {
        path,
        payload,
        keyType,
    });
};
