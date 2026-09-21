'use strict';
const { wrap } = require('./lib/http');
const { createHandlers, productionDeps } = require('./lib/handlers');
exports.handler = wrap(createHandlers(productionDeps()).appData);
