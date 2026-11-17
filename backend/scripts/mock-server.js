const path = require('node:path');
const cors = require('cors');
const express = require('express');
const SwaggerParser = require('@apidevtools/swagger-parser');

const SPEC_PATH = path.join(__dirname, '..', 'openapi.yaml');
const PORT = Number(process.env.MOCK_PORT) || 4010;
const HOST = process.env.MOCK_HOST || '0.0.0.0';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compilePath = (pathTemplate) => new RegExp(`^${pathTemplate
    .split('/')
    .map((segment) => segment.startsWith('{') && segment.endsWith('}')
        ? '[^/]+'
        : escapeRegex(segment))
    .join('/')}/?$`);

const generateExample = (schema, depth = 0) => {
    if (!schema || depth > 8) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum?.length) return schema.enum[0];
    if (schema.oneOf?.length) return generateExample(schema.oneOf[0], depth + 1);
    if (schema.anyOf?.length) return generateExample(schema.anyOf[0], depth + 1);
    if (schema.allOf?.length) {
        return Object.assign({}, ...schema.allOf.map((part) => generateExample(part, depth + 1)));
    }

    if (schema.type === 'array') {
        return schema.minItems > 0 ? [generateExample(schema.items, depth + 1)] : [];
    }
    if (schema.type === 'object' || schema.properties) {
        return Object.fromEntries(Object.entries(schema.properties || {})
            .map(([name, property]) => [name, generateExample(property, depth + 1)]));
    }
    if (schema.type === 'integer' || schema.type === 'number') return 0;
    if (schema.type === 'boolean') return true;
    if (schema.type === 'string') {
        if (schema.format === 'date-time') return new Date().toISOString();
        if (schema.format === 'email') return 'member@example.test';
        return 'string';
    }
    return null;
};

const findOperation = (api, requestPath, method) => {
    const matches = Object.entries(api.paths)
        .filter(([pathTemplate]) => compilePath(pathTemplate).test(requestPath));
    const match = matches[0];
    if (!match) return null;
    const [pathTemplate, pathItem] = match;
    const allowedMethods = Object.keys(pathItem)
        .filter((key) => ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(key));
    return {
        operation: pathItem[method],
        allowedMethods,
        pathTemplate
    };
};

const createMockApp = (api) => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use((req, res) => {
        const requestPath = new URL(req.originalUrl, 'http://localhost').pathname;
        const match = findOperation(api, requestPath, req.method.toLowerCase());
        if (!match) {
            const pathMatch = findOperation(api, requestPath, 'get') ||
                findOperation(api, requestPath, 'post') ||
                findOperation(api, requestPath, 'put') ||
                findOperation(api, requestPath, 'patch') ||
                findOperation(api, requestPath, 'delete');
            if (pathMatch) {
                res.set('Allow', pathMatch.allowedMethods.map((method) => method.toUpperCase()).join(', '));
                return res.status(405).json({ success: false, message: 'Method not allowed.' });
            }
            return res.status(404).json({ success: false, message: 'No matching API operation.' });
        }
        if (!match.operation) {
            res.set('Allow', match.allowedMethods.map((method) => method.toUpperCase()).join(', '));
            return res.status(405).json({ success: false, message: 'Method not allowed.' });
        }

        const responses = match.operation.responses || {};
        const successResponse = Object.entries(responses)
            .filter(([status]) => status === 'default' || /^2\d\d$/.test(status))
            .sort(([left], [right]) => Number(left) - Number(right))[0];
        if (!successResponse) {
            return res.status(501).json({ success: false, message: 'No successful response is defined for this operation.' });
        }

        const [statusCode, response] = successResponse;
        const status = statusCode === 'default' ? 200 : Number(statusCode);
        if (status === 204) return res.status(status).end();

        const media = response.content?.['application/json'] || Object.values(response.content || {})[0];
        const body = media?.example ??
            (media?.examples && Object.values(media.examples)[0]?.value) ??
            generateExample(media?.schema) ??
            {};
        return res.status(status).json(body);
    });
    return app;
};

const startMockServer = async () => {
    const api = await SwaggerParser.validate(SPEC_PATH);
    const app = createMockApp(api);
    const server = app.listen(PORT, HOST, () => {
        console.log(`OpenAPI mock server listening on http://${HOST}:${PORT}`);
    });
    return server;
};

if (require.main === module) {
    startMockServer().catch((error) => {
        console.error('Could not start OpenAPI mock server:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { compilePath, createMockApp, generateExample, startMockServer };
