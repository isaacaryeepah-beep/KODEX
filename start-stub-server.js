const mongoose = require('mongoose');

// Stub out the database connection so the server starts without MongoDB.
mongoose.connect = async () => mongoose;

const origModel = mongoose.model.bind(mongoose);
mongoose.model = function(name, schema, ...rest) {
  try {
    return origModel(name, schema, ...rest);
  } catch(e) {
    // Model may already be registered (re-require) — return the cached version.
    return mongoose.models[name] || origModel(name);
  }
};

process.env.MONGO_URI  = 'mongodb://localhost:27017/stub';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT       = '3099';
process.env.LEGACY_PROCTOR_DISABLED = '1';
require('./src/server.js');
