# Shade Agent JS - CLI, Docker, Sandbox

The following library and docker API are for use in the shade agent stack.

This version is `@neardefi/shade-agent-cli: 1.0.x` for easier deployment.

For more information see: https://docs.near.org/ai/shade-agents/introduction

#### API Image Hash:

`555a166f4c648a579061f65000ad66c757c70881b468a1ae3b1b4cd67238f2e0`

#### Proxy Contract Hash:

`Du58nfK5sfXPjyqsuju327tVJWtBYap2WdTSbimsfRrP`

#### Sandbox Contract Hash:

`GMXJXnVK9vYd7CSYPtbA56rPau2h5J4YjsSsCfegGi4G`

## Agent Contract

-   `register_worker` -> `register_agent`
-   `get_worker` -> `get_agent`
-   `get_signature` -> `request_signature`

## HTTP API (for use from other languages)

`POST /api/sign` -> `POST /api/agent/:method`

From inside your docker app, use:

```js
const API_PORT = process.env.API_PORT || 3140;
const API_PATH = /sandbox/gim.test(process.env.NEXT_PUBLIC_contractId)
    ? 'shade-agent-api'
    : 'localhost';
`http://${API_PATH}:${API_PORT}/api/agent/${method}`;
```

_where method is what to call on the account instance for the agent_ see: https://github.com/near/near-api-js/blob/master/packages/accounts/src/account.ts

Account methods limited to:

-   'getAccountId',
-   'call', (alias for callFunction)
-   'callFunction', (alias for callFunction)
-   'functionCall', (alias for callFunction)
-   'view', (alias for callFunction)
-   'viewFunction', (alias for callFunction)
-   'getBalance',
-   'getState',

## JS/TS Library

Almost all existing methods were broken in favor of the following list of wrapper methods that wrap the API calls above:

-   agent
-   agentAccountId
-   agentInfo
-   agentCall
-   agentView
-   requestSignature

Types generated for these wrappers:

```js
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
declare function agent(methodName: string, args?: any): Promise<any>;
/**
 * Retrieves the account ID of the agent.
 *
 * @returns {Promise<any>} A promise that resolves to the agent's account ID.
 */
declare const agentAccountId: () => Promise<{
    accountId: string;
}>;
/**
 * Retrieves the agent's record from the agent contract
 *
 * @returns {Promise<any>} A promise that resolves to the agent's account ID.
 */
declare const agentInfo: () => Promise<{
    codehash: string;
    checksum: string;
}>;
/**
 * Contract view from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract view method.
 * @returns A promise that resolves with the result of the view method.
 */
declare const agentView: (args: ContractArgs) => Promise<any>;
/**
 * Contract call from agent account inside the API
 *
 * @param {ContractArgs} args - The arguments for the contract call method.
 * @returns A promise that resolves with the result of the call method.
 */
declare const agentCall: (args: ContractArgs) => Promise<any>;
/**
 * Requests a digital signature from the agent for a given payload and path.
 *
 * @param {Object} params - The parameters for the signature request.
 * @param {string} params.path - The path associated with the signature request.
 * @param {string} params.payload - The payload to be signed.
 * @param {string} params.keyType - The type of key to use for signing (default is 'Ecdsa').
 * @returns A promise that resolves with the result of the signature request.
 */
declare const requestSignature: ({ path, payload, keyType, }: {
    path: string;
    payload: string;
    keyType: string;
}) => Promise<any>;

export { agent, agentAccountId, agentCall, agentInfo, agentView, requestSignature };
```
