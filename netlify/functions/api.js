const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app in Serverless-HTTP adapter
module.exports.handler = serverless(app);
