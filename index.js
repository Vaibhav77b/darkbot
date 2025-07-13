const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.get("/", (req, res) => res.send("🤖 Bot is alive!"));
app.listen(3000, () => console.log("🌐 KeepAlive server running"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = '!';
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  userId: String,
  dc: { type: Number, default: 0 },
  inventory: { type: [String], default: [] },
  cooldowns: { type: Object, default: {} },
  infCooldown: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const shop = require('./shop.json');
const eggs = require('./eggshop.json');

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const channel = message.channel;

  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }

  if (command === 'gdc') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.');
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount)) return message.reply('Usage: !adddc @user amount');
    let targetUser = await User.findOne({ userId: target.id });
    if (!targetUser) targetUser = new User({ userId: target.id });
    targetUser.dc += amount;
    await targetUser.save();
    return channel.send(`✅ Gave ${amount} DC to ${target.tag}.`);
  }

  if (command === 'dc') {
    return message.reply(`💰 You have **${user.dc} DC**.`);
  }

  if (command === 'daily') {
    const now = Date.now();
    const last = user.cooldowns.daily || 0;
    if (!user.infCooldown && now - last < 86400000)
      return message.reply('⏳ You already claimed daily DC.');
    user.dc += 5000;
    user.cooldowns.daily = now;
    await user.save();
    return message.reply('✅ You claimed **5,000 DC** from daily!');
  }

  if (command === 'shop') {
    const embed = new EmbedBuilder().setTitle('🛒 Shop').setColor('Green');
    shop.forEach((item, i) => {
      embed.addFields({ name: `${i + 1}. ${item.name}`, value: `💵 ${item.price} DC | 🧺 Stock: ${item.stock}` });
    });
    return channel.send({ embeds: [embed] });
  }

  if (command === 'buy') {
    const itemName = args.join(" ").toLowerCase();
    const item = shop.find(i => i.name.toLowerCase() === itemName);
    if (!item) return message.reply('❌ Item not found.');
    if (item.stock <= 0) return message.reply('❌ Out of stock.');
    if (user.dc < item.price) return message.reply('❌ Not enough DC.');
    user.dc -= item.price;
    user.inventory.push(item.name);
    item.stock--;
    await user.save();
    fs.writeFileSync('shop.json', JSON.stringify(shop, null, 2));
    return message.reply(`✅ Bought **${item.name}**!`);
  }

  if (command === 'inv') {
    if (!user.inventory.length) return message.reply('🎒 Your inventory is empty.');
    const counts = user.inventory.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {});
    const embed = new EmbedBuilder().setTitle('🎒 Inventory').setColor('Blue');
    for (const [item, count] of Object.entries(counts)) {
      embed.addFields({ name: item, value: `x${count}` });
    }
    return channel.send({ embeds: [embed] });
  }

  if (command === 'eggshop') {
    const embed = new EmbedBuilder().setTitle('🥚 Egg Shop').setColor('Yellow');
    eggs.forEach((egg, i) => {
      embed.addFields({ name: `${i + 1}. ${egg.rarity}`, value: egg.pets.join(", ") });
    });
    return channel.send({ embeds: [embed] });
  }

  if (command === 'buyegg') {
    const type = args.join(" ").toLowerCase();
    const egg = eggs.find(e => e.rarity.toLowerCase() === type);
    if (!egg) return message.reply('❌ Egg not found.');
    const cost = 5000;
    if (user.dc < cost) return message.reply('❌ Not enough DC.');
    user.dc -= cost;
    const pet = egg.pets[Math.floor(Math.random() * egg.pets.length)];
    user.inventory.push(pet);
    await user.save();
    return message.reply(`🥚 You hatched a **${pet}** from ${egg.rarity}!`);
  }

  if (command === 'giveinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    user.infCooldown = true;
    await user.save();
    return message.reply(`♾️ ${message.author.username} can now use daily infinitely.`);
  }

  if (command === 'removeinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    user.infCooldown = false;
    await user.save();
    return message.reply(`❌ ${message.author.username} cooldown restored.`);
  }

  if (command === 'log') {
    const log = args.join(" ");
    if (!log) return message.reply('Please include update log.');
    const embed = new EmbedBuilder().setTitle('📝 Update Log').setDescription(log).setColor('Orange');
    return channel.send({ embeds: [embed] });
  }

  if (command === 'lb') {
    const users = await User.find({}).sort({ dc: -1 }).limit(10);
    const embed = new EmbedBuilder().setTitle('🏆 Leaderboard').setColor('Gold');
    users.forEach((u, i) => {
      embed.addFields({ name: `${i + 1}. <@${u.userId}>`, value: `${u.dc} DC` });
    });
    return channel.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
