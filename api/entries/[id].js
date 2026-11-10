const app = require('../index.js');

module.exports = (req, res) => {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  req.url = `/api/entries/${encodeURIComponent(id || '')}`;
  return app(req, res);
};
