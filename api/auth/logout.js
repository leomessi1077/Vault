const app = require('../index.js');

module.exports = (req, res) => {
  req.url = '/api/auth/logout';
  return app(req, res);
};
