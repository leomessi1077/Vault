const app = require('./index.js');

module.exports = (req, res) => {
  req.url = '/api/entries';
  return app(req, res);
};
