const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');
const debtIntervals = {}; // userId -> setInterval ID
const mongoose = require('mongoose');
const User = require('./models/User');
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected!');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

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
const allPets = eggs.flatMap(e => e.pets);
let pendingTrades = {};
let infiniteCooldownUsers = new Set();
let debtors = {};
if (fs.existsSync('debtors.json')) {
  debtors = JSON.parse(fs.readFileSync('debtors.json'));
}
function saveDebtors() {
  fs.writeFileSync('debtors.json', JSON.stringify(debtors, null, 2));
}
let debtData = {};
if (fs.existsSync('debt.json')) {
  debtData = JSON.parse(fs.readFileSync('debt.json'));
}

if (fs.existsSync('data.json')) dcData = JSON.parse(fs.readFileSync('data.json'));
if (fs.existsSync('cooldowns.json')) cooldowns = JSON.parse(fs.readFileSync('cooldowns.json'));
if (fs.existsSync('inventory.json')) inventory = JSON.parse(fs.readFileSync('inventory.json'));
if (fs.existsSync('debt.json')) debtData = JSON.parse(fs.readFileSync('debt.json'));

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(dcData, null, 2));
  fs.writeFileSync('inventory.json', JSON.stringify(inventory, null, 2));
  fs.writeFileSync('cooldowns.json', JSON.stringify(cooldowns, null, 2));
  fs.writeFileSync('debt.json', JSON.stringify(debtData, null, 2));
}
console.log("TOKEN:", process.env.TOKEN);
console.log("Loaded Token:", TOKEN.slice(0, 10) + "...");

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of Object.entries(debtors)) {
    if (now >= data.endTime && !data.timeoutSet) {
      const guild = client.guilds.cache.first();
      const member = guild?.members.cache.get(userId);
      if (member) {
        member.timeout(24 * 60 * 60 * 1000, 'Failed to repay 1T debt on time');
        console.log(`⏱️ Timed out ${member.user.tag} for 1 day due to unpaid debt.`);
      }
      debtors[userId].timeoutSet = true;
      saveDebtors();
    }
  }
}, 15000);
function startDebtCountdownDM(user, durationMinutes, userId) {
  let timeLeft = durationMinutes * 60;

  user.send(`💸 You’ve been fined **1T DC**. You must repay within **${durationMinutes} minutes**, or you’ll be timed out.`)
    .then(async msg => {
      const interval = setInterval(() => {
        if (!debtors[userId]) {
          clearInterval(interval);
          return;
        }

        if (timeLeft <= 0) {
          clearInterval(interval);
          user.send('⏱️ **Time’s up!** You will now be timed out.');
          return;
        }

        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        msg.edit(`⏳ Time left to repay: **${mins}m ${secs}s**`);
        timeLeft--;
      }, 1000); // every second

      debtIntervals[userId] = interval; // 👈 save interval
    })
    .catch(err => {
      console.log(`Could not DM ${user.username}: ${err.message}`);
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const channel = message.channel;

  if (!dcData[userId]) dcData[userId] = 0;
  if (!inventory[userId]) inventory[userId] = [];

  // Admin Commands
  if (command === 'givedc') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.');
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount)) return message.reply('Usage: !adddc @user amount');
    dcData[target.id] = (dcData[target.id] || 0) + amount;
    saveData();
    return channel.send(`✅ Gave ${amount} DC to ${target.tag}.`);
  }
  if (command === 'debt') {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const target = message.mentions.users.first();
  const duration = parseInt(args[1]);

  if (!target || isNaN(duration)) return message.reply('Usage: !debt @user <minutes>');

  const userId = target.id;
  dcData[userId] = (dcData[userId] || 0) - 1_000_000_000_000;
  const endTime = Date.now() + duration * 60 * 1000;

  debtors[userId] = { endTime, timeoutSet: false };
  saveData();
  saveDebtors();

  message.reply(`💸 ${target.username} fined **1T DC**. Countdown started.`);

  startDebtCountdownDM(target, duration, userId); // 👈 live DM timer
}
  if (command === 'redebt') {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const target = message.mentions.users.first();
  if (!target) return message.reply('Usage: !redebt @user');

  const userId = target.id;

  if (debtors[userId]) {
    delete debtors[userId];
    if (debtIntervals[userId]) {
      clearInterval(debtIntervals[userId]);
      delete debtIntervals[userId];
    }
    saveDebtors();
    return message.reply(`✅ Cleared debt and stopped countdown for ${target.username}.`);
  } else {
    return message.reply(`❌ ${target.username} has no active debt.`);
  }
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
    return message.reply(`♾️ ${target.username} can no longer use his abilities forever in the world .`);
  }

  if (command === 'removeinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const target = message.mentions.users.first();
    if (!target) return message.reply('Mention a user to remove infinite cooldown.');
    infiniteCooldownUsers.delete(target.id);
    return message.reply(`❌ ${target.username} damn,you got spared lmfao dumbass.`);
  }

  // User Commands
  if (command === 'dhelp') {
  const embed = new EmbedBuilder()
    .setTitle('📖 DarkBot Help Menu')
    .setColor('Purple')
    .addFields(
      {
        name: '📦 Economy',
        value: '`!daily`, `!dc`, `!shop`, `!buy <item>`, `!inv`, `!jackpot`,`!paydebt`',
      },
      {
        name: '🐣 Pets & Eggs',
        value: '`!eshop`, `!buyegg <rarity>`',
      },
      {
        name: '🏆 Leaderboard',
        value: '`!lb`',
      },
      {
        name: '⚙️ Admin Only',
        value: '`!givedc @user <amount>`, `!setstock`, `!giveinfcd @user`, `!removeinfcd @user`,`!debt @user <minutes given to fill fine>`,`!redebt @user`',
      },
      {
        name: '📝 Admin Misc',
        value: '`!update <text>`',
      }
    )
    .setFooter({ text: 'Use ! before each command. Example: !buy nigga' });

  return message.channel.send({ embeds: [embed] });
}

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
  if (command === 'paydebt') {
  const userDebt = debtData[userId] || 0;
  const amount = parseInt(args[0]);

  if (userDebt <= 0) return message.reply('✅ You have no debt to pay.');

  if (isNaN(amount) || amount <= 0) return message.reply('Usage: !paydebt amount');

  if (dcData[userId] < amount) return message.reply('❌ You don\'t have enough DC to pay this amount.');

  const payAmount = Math.min(amount, userDebt);
  dcData[userId] -= payAmount;
  debtData[userId] -= payAmount;

  if (debtData[userId] <= 0) {
    delete debtData[userId];
    saveData();
    return message.reply(`✅ You paid **${payAmount} DC** and cleared all your debt!`);
  } else {
    saveData();
    return message.reply(`✅ You paid **${payAmount} DC**. Remaining debt: **${debtData[userId]} DC**`);
  }
}

  if (command === 'inv') {
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

  if (command === 'eshop') {
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
  if (command === 'mypets') {
  const userItems = inventory[userId] || [];
  const petList = userItems.filter(item => allPets.includes(item));

  if (petList.length === 0) return message.reply('🐾 You don’t have any pets yet!');

  const petCounts = {};
  petList.forEach(pet => petCounts[pet] = (petCounts[pet] || 0) + 1);

  const embed = new EmbedBuilder()
    .setTitle(`🐾 ${message.author.username}'s Pets`)
    .setColor('Purple');

  for (const [pet, count] of Object.entries(petCounts)) {
    embed.addFields({ name: pet, value: `x${count}` });
  }

  return message.channel.send({ embeds: [embed] });
}

  if (command === 'update') {
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
