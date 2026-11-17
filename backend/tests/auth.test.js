const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const cookieParser = require('cookie-parser');
const Member = require('../models/memberModel');
const memberRoute = require('../routes/memberRoute');

const request = (server, { method = 'GET', path, body, cookie }) => new Promise((resolve, reject) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;

    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers
    }, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({
            status: res.statusCode,
            body: responseBody ? JSON.parse(responseBody) : null,
            setCookie: res.headers['set-cookie']?.[0]
        }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
});

test('authentication registers, logs in, authorizes, and revokes member sessions', async () => {
    const originalSecret = process.env.JWT_SECRET_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFindOne = Member.findOne;
    const originalCreate = Member.create;
    const originalFindById = Member.findById;
    const originalUpdateOne = Member.updateOne;
    let member;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/v1/auth', memberRoute);
    const server = app.listen(0, '127.0.0.1');

    const queryFor = (value) => ({
        select() { return this; },
        then(resolve, reject) {
            return Promise.resolve(value).then(resolve, reject);
        }
    });

    try {
        process.env.JWT_SECRET_KEY = 'test-signing-secret-not-for-production';
        process.env.NODE_ENV = 'test';
        Member.findOne = (filter) => queryFor(member?.email === filter.email ? member : null);
        Member.create = async (data) => {
            member = {
                _id: 'member-test-id',
                role: 'MEMBER',
                status: 'ACTIVE',
                tokenVersion: 0,
                ...data
            };
            return member;
        };
        Member.findById = (id) => queryFor(id === member?._id ? member : null);
        Member.updateOne = async () => {
            member.tokenVersion += 1;
            return { modifiedCount: 1 };
        };

        await new Promise((resolve) => server.once('listening', resolve));

        const unauthorized = await request(server, { path: '/v1/auth/me' });
        assert.equal(unauthorized.status, 401);

        const registration = await request(server, {
            method: 'POST',
            path: '/v1/auth/register',
            body: {
                fname: 'Amina',
                lname: 'Otieno',
                email: 'AMINA@example.com',
                password: 'a-strong-test-password',
                role: 'ADMIN'
            }
        });
        assert.equal(registration.status, 201);
        assert.equal(member.role, 'MEMBER');
        assert.match(registration.setCookie, /HttpOnly/i);
        assert.match(registration.setCookie, /SameSite=Lax/i);
        assert.ok(!registration.setCookie.includes('Secure'));

        const duplicate = await request(server, {
            method: 'POST',
            path: '/v1/auth/register',
            body: {
                fname: 'Amina',
                lname: 'Otieno',
                email: 'amina@example.com',
                password: 'a-strong-test-password'
            }
        });
        assert.equal(duplicate.status, 409);

        const invalidLogin = await request(server, {
            method: 'POST',
            path: '/v1/auth/login',
            body: { email: 'amina@example.com', password: 'incorrect-password' }
        });
        assert.equal(invalidLogin.status, 401);

        const login = await request(server, {
            method: 'POST',
            path: '/v1/auth/login',
            body: { email: 'AMINA@example.com', password: 'a-strong-test-password' }
        });
        assert.equal(login.status, 200);
        const cookie = login.setCookie.split(';')[0];

        const profile = await request(server, { path: '/v1/auth/me', cookie });
        assert.equal(profile.status, 200);
        assert.equal(profile.body.data.email, 'amina@example.com');
        assert.equal(profile.body.data.role, 'MEMBER');
        assert.equal(Object.hasOwn(profile.body.data, 'password'), false);

        const logout = await request(server, {
            method: 'POST',
            path: '/v1/auth/logout',
            cookie
        });
        assert.equal(logout.status, 200);
        assert.match(logout.setCookie, /token=;/);

        const revoked = await request(server, { path: '/v1/auth/me', cookie });
        assert.equal(revoked.status, 401);
        assert.match(revoked.body.message, /revoked/i);
    } finally {
        Member.findOne = originalFindOne;
        Member.create = originalCreate;
        Member.findById = originalFindById;
        Member.updateOne = originalUpdateOne;
        if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
        else process.env.JWT_SECRET_KEY = originalSecret;
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
