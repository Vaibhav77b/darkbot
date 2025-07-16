const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const fs = require('fs');
require('dotenv').config();
const User = require('./models/User');

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
const TOKEN = process.env.TOKEN;
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

const shop = require('./shop.json');
const eggs = require('./eggshop.json');

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});
setInterval(async () => {
  const users = await User.find({ 'debt.active': true });
  const now = Date.now();

  for (const user of users) {
    if (user.debt.endTime <= now) {
      const guild = client.guilds.cache.first(); // or find a specific guild
      const member = await guild.members.fetch(user.userId).catch(() => null);

      if (member && !member.isCommunicationDisabled()) {
        await member.timeout(24 * 60 * 60 * 1000, 'Did not repay debt on time');
        const targetUser = await client.users.fetch(user.userId).catch(() => null);
        if (targetUser) {
          await targetUser.send("⏳ You failed to repay your **1T DC** debt in time. You’ve been timed out for **1 day**.");
        }
      }

      user.debt.active = false;
      await user.save();
    }
  }
}, 5000); // Check every 5 seconds

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

  if (command === 'givedc') {
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
  if (command === 'debt') {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ Only admins can use this command.');
  }

  const target = message.mentions.users.first();
  const duration = parseInt(args[1]);

  if (!target || isNaN(duration)) {
    return message.reply('Usage: `!debt @user durationInMinutes..what a dumass`');
  }

  const targetId = target.id;
  const targetUser = await User.findOneAndUpdate(
    { userId: targetId },
    {
      $set: {
        'debt.active': true,
        'debt.endTime': Date.now() + duration * 60 * 1000,
        'debt.timeoutSet': false,
      },
    },
    { upsert: true, new: true }
  );

  try {
    const dm = await target.send(
      `💸 You’ve been fined **1T DC**.\nYou must repay within **${duration} minutes**, or you’ll be timed out for 1 day.`
    );

    const countdown = setInterval(async () => {
      const user = await User.findOne({ userId: targetId });
      if (!user?.debt?.active || user.debt.timeoutSet) {
        clearInterval(countdown);
        return;
      }

      if (Date.now() >= user.debt.endTime) {
        const guild = message.guild;
        const member = guild.members.cache.get(targetId);
        if (member) {
          await member.timeout(24 * 60 * 60 * 1000, 'Failed to repay 1T debt');
          user.debt.timeoutSet = true;
          await user.save();

          try {
            await target.send('⏰ **Time’s up!** Yo ass is been timed out for 1 day for not repaying your debt.');
          } catch {}
        }
        clearInterval(countdown);
      }
    }, 15000); // check every 15 seconds
  } catch (err) {
    console.warn('Failed to send DM:', err);
  }

  return message.reply(`✅ Debt of 1T DC applied to <@${targetId}> for ${duration} minutes.`);
}
  if (command === 'redebt') {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ Only admins can use this command.');
  }

  const target = message.mentions.users.first();
  if (!target) return message.reply('Usage: `!redebt @user `');

  const user = await User.findOne({ userId: target.id });
  if (!user || !user.debt?.active) {
    return message.reply('❌ That user has no active debt.');
  }

  user.debt = { active: false, endTime: null, timeoutSet: false };
  await user.save();

  try {
    await target.send('🆓 Your debt has been cancelled by an admin.');
  } catch {}

  return message.reply(`✅ Debt for <@${target.id}> has been removed.`);
}
  if (command === 'paydebt') {
  const userId = message.author.id;
  let user = await User.findOne({ userId });

  if (!user || !user.debt?.active) {
    return message.reply('❌ You have no active debt.');
  }

  if (user.dc < 1_000_000_000_000) {
    return message.reply('❌ You don’t have enough DC to pay your debt (1T DC required).');
  }

  user.dc -= 1_000_000_000_000;
  user.debt = {
    active: false,
    endTime: null,
    timeoutSet: false
  };

  await user.save();

  message.reply('✅ You successfully paid your debt of **1T DC**!');
  message.author.send('💸 Your debt has been cleared. Thank you for the payment!');
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
  if (command === 'dhelp') {
  const embed = new EmbedBuilder()
    .setTitle('🛠️ Bot Commands')
    .setColor('Blurple')
    .setDescription('Here are the available commands:')
    .addFields(
      { name: '💰 Economy', value: '`!dc`, `!daily`, `!paydebt`, `!lb`' },
      { name: '🛒 Shop', value: '`!shop`, `!buy item`, `!inv`, `!jackpot`' },
      { name: '🥚 Eggs & Pets', value: '`!eggshop`, `!buyegg rarity(for dumbasses like abhi,its common egg)`, `!mypets`' },
      { name: '⚙️ Admin Only', value: '`!givedc`, `!setstock`, `!giveinfcd`, `!removeinfcd`, `!debt`, `!redebt`' },
      { name: '📜 Bot Shit for me ', value: '`!log`' }
    )
    .setFooter({ text: 'Use commands with ! at starting bigga' });

  return message.channel.send({ embeds: [embed] });
}
  if (command === 'mypets') {
  const pets = inventory[userId]?.filter(item =>
    eggs.some(egg => egg.pets.includes(item))
  );

  if (!pets || pets.length === 0) return message.reply('🐾 You have no pets.');

  const petCounts = pets.reduce((a, b) => {
    a[b] = (a[b] || 0) + 1;
    return a;
  }, {});

  const embed = new EmbedBuilder()
    .setTitle('🐾 Your Pets')
    .setColor('Purple');

  for (const [pet, count] of Object.entries(petCounts)) {
    let description = 'No description.';
    for (const egg of eggs) {
      if (egg.pets.includes(pet) && egg.descriptions?.[pet]) {
        description = egg.descriptions[pet];
        break;
      }
    }
    embed.addFields({ name: `${pet} x${count}`, value: description });
  }

  return message.channel.send({ embeds: [embed] });
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
