const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { app } = require('../server');

const request = (server, path) => new Promise((resolve, reject) => {
    const req = http.get({
        host: '127.0.0.1',
        port: server.address().port,
        path
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
});

test('readiness and interactive API documentation are exposed', async () => {
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise((resolve) => server.once('listening', resolve));

        const readiness = await request(server, '/health/ready');
        assert.equal(readiness.status, 503);
        assert.match(readiness.body, /"status":"not-ready"/);

        const spec = await request(server, '/openapi.yaml');
        assert.equal(spec.status, 200);
        assert.match(spec.body, /openapi: 3\.0\.3/);

        const docs = await request(server, '/docs/');
        assert.equal(docs.status, 200);
        assert.match(docs.body, /swagger-ui/);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
