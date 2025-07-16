import {
    JsonRpcProvider,
    FailoverRpcProvider,
    Provider,
} from '@near-js/providers';

export function getProvider(providers): Provider {
    // Handle case where NEAR_RPC_JSON is not defined
    const nearRpcProvidersJson = providers
        ? JSON.parse(providers)
        : { nearRpcProviders: null };

    const networkId = 'testnet';

    function createDefaultProvider() {
        return new JsonRpcProvider(
            {
                url:
                    networkId === 'testnet'
                        ? 'https://test.rpc.fastnear.com'
                        : 'https://free.rpc.fastnear.com',
            },
            {
                retries: 3,
                backoff: 2,
                wait: 1000,
            },
        );
    }

    let provider;

    if (nearRpcProvidersJson.nearRpcProviders) {
        console.log('Using custom RPC providers');
        const providers = nearRpcProvidersJson.nearRpcProviders.map(
            (config) =>
                new JsonRpcProvider(
                    config.connectionInfo,
                    config.options || {},
                ),
        );
        provider = new FailoverRpcProvider(providers);
    } else {
        console.log('Using default RPC provider');
        provider = createDefaultProvider();
    }

    console.log('near providers', provider.providers);

    return provider;
}
