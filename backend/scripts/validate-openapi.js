const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const specPath = path.join(__dirname, '..', 'openapi.yaml');

SwaggerParser.validate(specPath)
    .then((api) => {
        console.log(`Validated OpenAPI ${api.openapi}: ${Object.keys(api.paths).length} paths.`);
    })
    .catch((error) => {
        console.error('OpenAPI validation failed:', error.message);
        process.exitCode = 1;
    });
