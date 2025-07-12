const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
app.get("/", (req, res) => res.send("🤖 Bot is alive!"));
app.listen(3000, () => console.log("🌐 KeepAlive server running"));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const PREFIX = '!';
const TOKEN = process.env.TOKEN;

const MAX_DC = Infinity;

let dcData = {};
let cooldowns = {};
let inventory = {};
let shop = require('./shop.json');
let eggs = require('./eggshop.json');
let pendingTrades = {};
let infiniteCooldownUsers = new Set();

if (fs.existsSync('data.json')) dcData = JSON.parse(fs.readFileSync('data.json'));
if (fs.existsSync('cooldowns.json')) cooldowns = JSON.parse(fs.readFileSync('cooldowns.json'));
if (fs.existsSync('inventory.json')) inventory = JSON.parse(fs.readFileSync('inventory.json'));

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(dcData, null, 2));
  fs.writeFileSync('inventory.json', JSON.stringify(inventory, null, 2));
  fs.writeFileSync('cooldowns.json', JSON.stringify(cooldowns, null, 2));
}
console.log("TOKEN:", process.env.TOKEN);
console.log("Loaded Token:", TOKEN.slice(0, 10) + "...");

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const channel = message.channel;

  if (!dcData[userId]) dcData[userId] = 0;
  if (!inventory[userId]) inventory[userId] = [];

  // Admin Commands
  if (command === 'adddc') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.');
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount)) return message.reply('Usage: !adddc @user amount');
    dcData[target.id] = (dcData[target.id] || 0) + amount;
    saveData();
    return channel.send(`✅ Gave ${amount} DC to ${target.tag}.`);
  }

  if (command === 'setstock') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    shop.forEach(item => item.stock = Math.floor(Math.random() * 10 + 1));
    fs.writeFileSync('shop.json', JSON.stringify(shop, null, 2));
    return message.reply('🛒 Shop stock updated!');
  }

  if (command === 'giveinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('Mention a user to give infinite cooldown.');
    infiniteCooldownUsers.add(target.id);
    return message.reply(`♾️ ${target.username} can now use daily infinitely.`);
  }

  if (command === 'removeinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('Mention a user to remove infinite cooldown.');
    infiniteCooldownUsers.delete(target.id);
    return message.reply(`❌ ${target.username} cooldown restored.`);
  }

  // User Commands
  if (command === 'dc') {
    return message.reply(`💰 You have **${dcData[userId]} DC**.`);
  }

  if (command === 'daily') {
    const now = Date.now();
    const last = cooldowns[userId]?.daily || 0;
    if (!infiniteCooldownUsers.has(userId) && now - last < 86400000)
      return message.reply('⏳ You already claimed your daily DC. Try again later.');
    dcData[userId] += 5000;
    cooldowns[userId] = { ...cooldowns[userId], daily: now };
    saveData();
    return message.reply('✅ You claimed **5,000 DC** from daily!');
  }

  if (command === 'shop') {
    const embed = new EmbedBuilder().setTitle('🛒 Shop').setColor('Green');
    shop.forEach((item, index) => {
      embed.addFields({ name: `${index + 1}. ${item.name}`, value: `💵 ${item.price} DC | 🧺 Stock: ${item.stock}` });
    });
    return channel.send({ embeds: [embed] });
  }

  if (command === 'buy') {
    const itemName = args.join(" ").toLowerCase();
    const item = shop.find(i => i.name.toLowerCase() === itemName);
    if (!item) return message.reply('❌ Item not found.');
    if (item.stock <= 0) return message.reply('❌ Item is out of stock.');
    if (dcData[userId] < item.price) return message.reply('❌ Not enough DC.');
    dcData[userId] -= item.price;
    inventory[userId].push(item.name);
    item.stock--;
    saveData();
    return message.reply(`✅ Bought **${item.name}**!`);
  }

  if (command === 'inventory') {
    const items = inventory[userId];
    if (!items.length) return message.reply('🎒 Your inventory is empty.');
    const counts = items.reduce((a, b) => { a[b] = (a[b] || 0) + 1; return a; }, {});
    const embed = new EmbedBuilder().setTitle('🎒 Inventory').setColor('Blue');
    for (const [item, count] of Object.entries(counts)) {
      embed.addFields({ name: item, value: `x${count}` });
    }
    return channel.send({ embeds: [embed] });
  }

  if (command === 'jackpot') {
    if (dcData[userId] < 1000000) return message.reply('❌ You need 1M DC to enter jackpot.');
    const win = Math.random() < 0.05;
    dcData[userId] -= 1000000;
    if (win) {
      const reward = 10000000;
      dcData[userId] += reward;
      saveData();
      return message.reply(`🎉 JACKPOT! You won **${reward} DC**!`);
    } else {
      saveData();
      return message.reply('😢 You lost the jackpot. Try again!');
    }
  }

  if (command === 'eggshop') {
    const embed = new EmbedBuilder().setTitle('🥚 Egg Shop').setColor('Yellow');
    eggs.forEach((egg, index) => {
      embed.addFields({ name: `${index + 1}. ${egg.rarity}`, value: egg.pets.join(", ") });
    });
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'buyegg') {
    if (!args[0]) return message.reply('Usage: !buyegg rarity');
    const type = args.join(" ").toLowerCase();
    const egg = eggs.find(e => e.rarity.toLowerCase() === type);
    if (!egg) return message.reply('❌ Egg not found.');
    const cost = 5000;
    if (dcData[userId] < cost) return message.reply('❌ Not enough DC.');
    dcData[userId] -= cost;
    const pet = egg.pets[Math.floor(Math.random() * egg.pets.length)];
    inventory[userId].push(pet);
    saveData();
    return message.reply(`🥚 You hatched a **${pet}** from ${egg.rarity}!`);
  }

  if (command === 'updatelog') {
    const log = args.join(" ");
    if (!log) return message.reply('Please include update log.');
    const embed = new EmbedBuilder().setTitle('📝 Update Log').setDescription(log).setColor('Orange');
    return channel.send({ embeds: [embed] });
  }

  if (command === 'lb') {
    const sorted = Object.entries(dcData).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const embed = new EmbedBuilder().setTitle('🏆 Leaderboard').setColor('Gold');
    sorted.forEach(([id, dc], i) => {
      embed.addFields({ name: `${i + 1}. <@${id}>`, value: `${dc} DC` });
    });
    return channel.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
