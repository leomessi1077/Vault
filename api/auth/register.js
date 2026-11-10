const app = require('../index.js');

module.exports = (req, res) => {
  req.url = '/api/auth/register';
  return app(req, res);
};
