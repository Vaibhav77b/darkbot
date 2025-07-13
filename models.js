// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  dc: { type: Number, default: 0 },
  inventory: { type: [String], default: [] },
  cooldowns: {
    daily: { type: Number, default: 0 }
  },
  debt: {
    amount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null }
  }
});

module.exports = mongoose.model('User', userSchema);
