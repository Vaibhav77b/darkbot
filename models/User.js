const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },

  dc: { type: Number, default: 0 }, // Economy balance

  inventory: { type: Array, default: [] }, // Shop items + pets

  cooldowns: {
    daily: { type: Date, default: null },
    jackpot: { type: Date, default: null },
    // Add more cooldowns if needed
  },

  debt: {
    active: { type: Boolean, default: false },
    endTime: { type: Number, default: null },
    timeoutSet: { type: Boolean, default: false }
  }
});

module.exports = mongoose.model('User', userSchema);
 
