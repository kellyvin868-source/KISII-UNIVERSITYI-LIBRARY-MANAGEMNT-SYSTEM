const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const Book = require('../models/bookModel');
const aiRoute = require('../routes/aiRoute');

const request = (server, { method = 'GET', path, body }) => new Promise((resolve, reject) => {
    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' }
    }, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({
            status: res.statusCode,
            body: JSON.parse(responseBody)
        }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
});

test('AI routes validate inputs, return real catalog results, and answer library questions', async () => {
    const originalFetch = global.fetch;
    const originalFind = Book.find;
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const app = express();
    app.use(express.json());
    app.use('/v1/ai', aiRoute);
    const server = app.listen(0, '127.0.0.1');
    const books = [{ _id: 'book-test-id', title: 'East African History', isbn: 'test-isbn' }];
    let providerCall = 0;

    try {
        await new Promise((resolve) => server.once('listening', resolve));

        assert.equal((await request(server, { path: '/v1/ai/search?q=%20' })).status, 400);
        assert.equal((await request(server, {
            path: `/v1/ai/search?q=${'a'.repeat(501)}`
        })).status, 400);

        process.env.OPENROUTER_API_KEY = 'test-key-not-a-real-credential';
        Book.find = (filter) => {
            assert.deepEqual(filter, {
                status: 'ACTIVE',
                $text: { $search: 'East African history' }
            });
            return {
                select() { return this; },
                sort() { return this; },
                limit(limit) {
                    assert.equal(limit, 10);
                    return this;
                },
                lean: async () => books
            };
        };
        global.fetch = async (url, options) => {
            assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
            assert.equal(options.headers.Authorization, 'Bearer test-key-not-a-real-credential');
            const payload = JSON.parse(options.body);
            assert.equal(payload.model, 'nvidia/nemotron-3.5-lightning:free');
            assert.deepEqual(payload.reasoning, { effort: 'low' });
            if (providerCall === 1) {
                assert.equal(payload.max_tokens, 1024);
            }
            providerCall += 1;
            const content = providerCall === 1
                ? JSON.stringify({ terms: ['East African history'] })
                : providerCall === 2
                    ? [{ type: 'text', text: 'Ask library staff to confirm current renewal rules.' }]
                    : null;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    model: payload.model,
                    choices: [{
                        message: { content },
                        ...(providerCall === 4 ? { finish_reason: 'length' } : {})
                    }]
                })
            };
        };

        const search = await request(server, {
            path: '/v1/ai/search?q=books%20about%20East%20African%20history'
        });
        assert.equal(search.status, 200);
        assert.deepEqual(search.body.data.books, [{
            id: 'book-test-id',
            title: 'East African History',
            isbn: 'test-isbn'
        }]);
        assert.deepEqual(search.body.data.searchTerms, ['East African history']);

        const assistant = await request(server, {
            method: 'POST',
            path: '/v1/ai/chat',
            body: { message: 'How do I renew a loan?', sessionId: 'smoke-test' }
        });
        assert.equal(assistant.status, 200);
        assert.equal(assistant.body.data.reply, 'Ask library staff to confirm current renewal rules.');
        assert.equal(assistant.body.data.sessionId, 'smoke-test');

        const emptyReply = await request(server, {
            method: 'POST',
            path: '/v1/ai/chat',
            body: { message: 'How do I renew a loan?' }
        });
        assert.equal(emptyReply.status, 502);
        assert.equal(emptyReply.body.message, 'The AI provider response did not contain a reply.');

        const truncatedReply = await request(server, {
            method: 'POST',
            path: '/v1/ai/chat',
            body: { message: 'How do I renew a loan?' }
        });
        assert.equal(truncatedReply.status, 502);
        assert.equal(
            truncatedReply.body.message,
            'The AI provider used its response limit before generating an answer. Try asking a shorter question.'
        );
    } finally {
        global.fetch = originalFetch;
        Book.find = originalFind;
        if (originalApiKey === undefined) {
            delete process.env.OPENROUTER_API_KEY;
        } else {
            process.env.OPENROUTER_API_KEY = originalApiKey;
        }
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
