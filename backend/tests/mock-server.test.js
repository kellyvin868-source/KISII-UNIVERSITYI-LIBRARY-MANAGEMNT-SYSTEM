const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { createMockApp } = require('../scripts/mock-server');

const request = (server, { method = 'GET', path: requestPath }) => new Promise((resolve, reject) => {
    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path: requestPath,
        method
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : null,
            allow: res.headers.allow
        }));
    });
    req.on('error', reject);
    req.end();
});

test('OpenAPI mock serves generated responses and reports unmatched methods', async () => {
    const specPath = path.join(__dirname, '..', 'openapi.yaml');
    const api = await SwaggerParser.validate(specPath);
    const server = createMockApp(api).listen(0, '127.0.0.1');
    try {
        await new Promise((resolve) => server.once('listening', resolve));

        const books = await request(server, { path: '/books' });
        assert.equal(books.status, 200);
        assert.ok(Array.isArray(books.body.data));

        const missingMethod = await request(server, { method: 'DELETE', path: '/authors' });
        assert.equal(missingMethod.status, 405);
        assert.match(missingMethod.allow, /GET/);

        const missingPrefix = await request(server, { path: '/v1/books' });
        assert.equal(missingPrefix.status, 404);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
