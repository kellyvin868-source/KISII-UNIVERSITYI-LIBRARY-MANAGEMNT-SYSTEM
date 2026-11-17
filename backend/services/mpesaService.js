const crypto = require('node:crypto');

const getBaseUrl = () => {
    const environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    if (environment === 'sandbox') return 'https://sandbox.safaricom.co.ke';
    if (environment === 'production') return 'https://api.safaricom.co.ke';
    throw new Error('MPESA_ENVIRONMENT must be sandbox or production.');
};

const fetchWithTimeout = async (url, options) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const parseProviderResponse = async (response) => {
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('M-Pesa provider returned an invalid response.');
    }
    if (!response.ok) {
        throw new Error(data.errorMessage || data.ResponseDescription || `M-Pesa provider returned HTTP ${response.status}.`);
    }
    return data;
};

const getAccessToken = async () => {
    const { MPESA_CONSUMER_KEY: key, MPESA_CONSUMER_SECRET: secret } = process.env;
    if (!key || !secret) throw new Error('M-Pesa API credentials are not configured.');

    let response;
    try {
        response = await fetchWithTimeout(`${getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }
        });
    } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'M-Pesa authentication request timed out.' : 'Unable to reach M-Pesa authentication.');
    }
    const data = await parseProviderResponse(response);
    if (typeof data.access_token !== 'string' || !data.access_token) {
        throw new Error('M-Pesa authentication did not return an access token.');
    }
    return data.access_token;
};

const initiateStkPush = async ({ phoneNumber, amount, accountReference }) => {
    const { MPESA_SHORTCODE: shortcode, MPESA_PASSKEY: passkey, MPESA_CALLBACK_URL: callbackUrl } = process.env;
    if (!shortcode || !passkey || !callbackUrl) {
        throw new Error('M-Pesa shortcode, passkey, and callback URL are required.');
    }
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    let response;
    try {
        response = await fetchWithTimeout(`${getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
                Amount: Math.ceil(amount),
                PartyA: phoneNumber,
                PartyB: shortcode,
                PhoneNumber: phoneNumber,
                CallBackURL: callbackUrl,
                AccountReference: accountReference.slice(0, 12),
                TransactionDesc: 'Library fine payment'
            })
        });
    } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'M-Pesa payment request timed out.' : 'Unable to reach M-Pesa payment service.');
    }
    const data = await parseProviderResponse(response);
    if (typeof data.CheckoutRequestID !== 'string') {
        throw new Error('M-Pesa did not return a checkout request ID.');
    }
    return data;
};

const validateCallbackSecret = (candidate) => {
    const expected = process.env.MPESA_CALLBACK_TOKEN;
    if (!expected || typeof candidate !== 'string') return false;
    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);
    return expectedBuffer.length === candidateBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
};

module.exports = { initiateStkPush, validateCallbackSecret };