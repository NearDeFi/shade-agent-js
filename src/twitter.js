import { Scraper, SearchMode as _SearchMode } from 'agent-twitter-client';
export const SearchMode = _SearchMode;

export const twitter = new Scraper();
twitter.isReady = false;

// set the cookies for the scraper

const bakeCookies = async () => {
    if (twitter.isReady) return;

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

    await twitter.setCookies(cookieStrings);
    twitter.isReady = true;
};
bakeCookies();
