import { Scraper, SearchMode as _SearchMode } from 'agent-twitter-client';
export const SearchMode = _SearchMode;

// "agent-twitter-client": "^0.0.17",
export const twitter = new Scraper();
twitter.isReady = false;

// set the cookies for the scraper

/**
 * Sets up authentication cookies for the Twitter scraper
 * @returns {Promise<void>}
 */
export const bakeCookies = async () => {
    if (twitter.isReady) {
        return;
    }

    const cookieStrings = [
        {
            key: 'auth_token',
            value: process.env.TWITTER_AUTH_TOKEN,
            domain: '.twitter.com',
        },
        {
            key: 'ct0',
            value: process.env.TWITTER_CT0,
            domain: '.twitter.com',
        },
        {
            key: 'guest_id',
            value: process.env.TWITTER_GUEST_ID,
            domain: '.twitter.com',
        },
    ].map(
        (cookie) =>
            `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${
                cookie.path
            }; ${cookie.secure ? 'Secure' : ''}; ${
                cookie.httpOnly ? 'HttpOnly' : ''
            }; SameSite=${cookie.sameSite || 'Lax'}`,
    );

    twitter.token = process.env.TWITTER_BEARER_TOKEN;
    await twitter.setCookies(cookieStrings);
    twitter.isReady = true;
};
bakeCookies();

// utilities (exceptions are swallowed on purpose to not block agents, simply retry the call)

/**
 * Retrieves the conversation ID for a given tweet
 * @param {Object} client - Twitter API client instance
 * @param {string} tweetId - ID of the tweet
 * @returns {Promise<string|null>} Conversation ID or null if not found
 */
export async function getConversationId(client, tweetId) {
    try {
        const tweet = await client.v2.singleTweet(tweetId, {
            'tweet.fields': 'conversation_id',
        });
        return tweet.data.conversation_id;
    } catch (e) {
        console.log('ERROR getConversationId', e);
    }
    return null;
}

/**
 * Retrieves the most recent tweet in a conversation
 * @param {Object} client - Twitter API client instance
 * @param {string} conversationId - ID of the conversation
 * @returns {Promise<Object|null>} Tweet object or null if not found
 */
export async function getLatestConversationTweet(client, conversationId) {
    try {
        const searchResult = await client.v2.search(
            `conversation_id:${conversationId}`,
            {
                'tweet.fields': 'created_at',
                max_results: 100, // Adjust based on needs
            },
        );
        if (searchResult?.data?.meta?.result_count === 0) {
            return null;
        }

        return searchResult.data.data[0]; // Most recent tweet is first
    } catch (e) {
        console.log('ERROR getLatestConversationTweet', e);
    }
    return null;
}
