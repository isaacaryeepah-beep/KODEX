const mongoose = require('mongoose');
const origConnect = mongoose.connect.bind(mongoose);
mongoose.connect = async () => mongoose;
mongoose.model = function(name, schema, ...rest) {
  try { return origConnect.constructor.prototype.model.call(mongoose, name, schema, ...rest); } catch(e) { try { return mongoose.models[name]; } catch { return {}; } }
};
process.env.MONGO_URI  = 'mongodb://localhost:27017/stub';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT       = '3099';
process.env.LEGACY_PROCTOR_DISABLED = '1';
require('./src/server.js');
