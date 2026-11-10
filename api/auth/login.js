const app = require('../index.js');

module.exports = (req, res) => {
  req.url = '/api/auth/login';
  return app(req, res);
};
