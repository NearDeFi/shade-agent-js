import {
    JsonRpcProvider,
    FailoverRpcProvider,
    Provider,
} from '@near-js/providers';
import { config } from './config';

/**
 * Creates a NEAR provider based on configuration
 * @param providers - JSON string containing RPC provider configuration
 * @returns Provider instance (either FailoverRpcProvider or JsonRpcProvider)
 */
export function getProvider(providers: string): Provider {
    // Handle case where NEAR_RPC_JSON is not defined
    const nearRpcProvidersJson = providers
        ? JSON.parse(providers)
        : { nearRpcProviders: null };

    /**
     * Creates a default JsonRpcProvider based on the network configuration
     * @returns JsonRpcProvider configured for the current network
     */
    function createDefaultProvider(): JsonRpcProvider {
        return new JsonRpcProvider(
            {
                url:
                    config.networkId === 'testnet'
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

    let provider: Provider;

    if (nearRpcProvidersJson.nearRpcProviders) {
        const providers = nearRpcProvidersJson.nearRpcProviders.map(
            (providerConfig: { connectionInfo: any; options?: any }) =>
                new JsonRpcProvider(
                    providerConfig.connectionInfo,
                    providerConfig.options || {},
                ),
        );
        
        // If only one provider, use JsonRpcProvider directly instead of FailoverRpcProvider
        // Temporary fix - use new version of near-api-js when failover provider is fixed
        if (providers.length === 1) {
            provider = providers[0];
        } else {
            provider = new FailoverRpcProvider(providers);
        }
    } else {
        provider = createDefaultProvider();
    }

    console.log('provider', provider);
    return provider;
}
