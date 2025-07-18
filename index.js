const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const fs = require('fs');
require('dotenv').config();
const User = require('./models/User'); // Mongoose model

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

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Load shop and egg data
const shopData = require('./shop.json');
const shop = shopData.items; // Array of shop items
const eggs = require('./eggshop.json');

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Periodically check debts to apply timeout when overdue
setInterval(async () => {
  const users = await User.find({ 'debt.active': true });
  const now = Date.now();

  for (const user of users) {
    if (user.debt.endTime <= now) {
      // Find a guild and member to timeout (adjust as needed)
      const guild = client.guilds.cache.first();
      const member = guild ? await guild.members.fetch(user.userId).catch(() => null) : null;

      if (member && !member.isCommunicationDisabled()) {
        await member.timeout(24 * 60 * 60 * 1000, 'Did not repay debt on time');
        const targetUser = await client.users.fetch(user.userId).catch(() => null);
        if (targetUser) {
          await targetUser.send("⏳ You failed to repay your **1T DC** debt in time. You’ve been timed out for **1 day** ..YEAH BOI LET'S GO.");
        }
      }

      // Clear the debt
      user.debt.active = false;
      await user.save();
    }
  }
}, 5000); // every 5 seconds

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const channel = message.channel;

  // Ensure user document exists
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }

  // Admin command: give DC (coins)
  if (command === 'givedc') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.. WHO DO YOU THINK YOU ARE .');
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount)) return message.reply('Usage: !givedc @user amount');
    let targetUser = await User.findOne({ userId: target.id });
    if (!targetUser) targetUser = new User({ userId: target.id });
    targetUser.dc += amount;
    await targetUser.save();
    return channel.send(`✅ Gave ${amount} DC to ${target.tag}.`);
  }

  // Admin command: apply debt (1T DC, repay in X minutes or timeout)
  if (command === 'debt') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Only admins can use this command.. WHO DO YOU THINK YOU ARE .');
    }
    const target = message.mentions.users.first();
    const duration = parseInt(args[1]);
    if (!target || isNaN(duration)) {
      return message.reply('Usage: `!debt @user durationInMinutes`');
    }
    const targetId = target.id;
    // Set debt in database (1T DC fine)
    await User.findOneAndUpdate(
      { userId: targetId },
      {
        $set: {
          'debt.active': true,
          'debt.endTime': Date.now() + duration * 60 * 1000,
          'debt.timeoutSet': false
        }
      },
      { upsert: true, new: true } // see Mongoose docs:contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
    );

    try {
      await target.send(`💸 You’ve been fined **1T DC**.\nYou must pay within **${duration} minutes**, or you’ll be getting ya ass cooked, meaning timed out for 1 day.`);
    } catch {
      // Ignore DM errors
    }

    // Countdown check (alternative to the setInterval above)
    const countdown = setInterval(async () => {
      const usr = await User.findOne({ userId: targetId });
      if (!usr?.debt?.active || usr.debt.timeoutSet) {
        clearInterval(countdown);
        return;
      }
      if (Date.now() >= usr.debt.endTime) {
        const guild = message.guild;
        const member = guild ? guild.members.cache.get(targetId) : null;
        if (member) {
          await member.timeout(24 * 60 * 60 * 1000, 'Failed to repay 1T debt');
          usr.debt.timeoutSet = true;
          await usr.save();
          try {
            await target.send('⏰ **Time’s up!** You have been timed out for 1 day for not giving me free mone- oh sry i mean debt hahaha .');
          } catch {}
        }
        clearInterval(countdown);
      }
    }, 15000); // check every 15 seconds

    return message.reply(`✅ Debt of 1T DC applied to <@${targetId}> for ${duration} minutes.`);
  }

  // Admin command: remove debt
  if (command === 'redebt') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Only admins can use this command.. WHO DO YOU THINK YOU ARE .');
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `!redebt @user`');
    const usr = await User.findOne({ userId: target.id });
    if (!usr || !usr.debt.active) {
      return message.reply('❌ That user has no active debt.');
    }
    usr.debt = { active: false, endTime: null, timeoutSet: false };
    await usr.save();
    try {
      await target.send('🆓 Your debt has been cancelled by an admin.');
    } catch {}
    return message.reply(`✅ Debt for <@${target.id}> has been removed.`);
  }

  // User command: pay debt (costs 1T DC)
  if (command === 'paydebt') {
    let usr = user;
    if (!usr.debt?.active) {
      return message.reply('❌ You have no active debt.');
    }
    if (usr.dc < 1_000_000_000_000) {
      return message.reply('❌ You don’t have enough DC to pay your debt (1T DC required).');
    }
    usr.dc -= 1_000_000_000_000;
    usr.debt = { active: false, endTime: null, timeoutSet: false };
    await usr.save();
    message.reply('✅ You successfully paid your debt of **1T DC**!');
    message.author.send('💸 Your debt has been cleared. Thank you for the free money bih!');
    return;
  }

  // User command: check balance
  if (command === 'dc') {
    return message.reply(`💰 You have **${user.dc} DC**.`);
  }

  // User command: daily reward (5k DC)
  if (command === 'daily') {
    const now = Date.now();
    const last = user.cooldowns.daily || 0;
    if (!user.infCooldown && now - last < 86400000) {
      return message.reply('⏳ You already claimed daily DC, no need to overexploit pooks.');
    }
    user.dc += 1000000;
    user.cooldowns.daily = now;
    await user.save();
    return message.reply('✅ You claimed **100,000 DC** from daily!');
  }

  // List shop items
  if (command === 'shop') {
    const embed = new EmbedBuilder().setTitle('🛒 Shop').setColor('Green');
    // Add each item to embed fields
    shop.forEach((item, i) => {
      embed.addFields({ 
        name: `${i + 1}. ${item.name}`, 
        value: `💵 ${item.price} DC | 🧺 Stock: ${item.stock}` 
      });
    });
    return channel.send({ embeds: [embed] });
  }

  // Buy an item
  if (command === 'buy') {
    const itemName = args.join(" ").toLowerCase();
    const shopItem = shop.find(i => i.name.toLowerCase() === itemName || i.id.toLowerCase() === itemName);
    if (!shopItem) return message.reply('❌ Item not found..yk why? your eyes are shit.');
    if (shopItem.stock <= 0) return message.reply('❌ Out of stock.');
    if (user.dc < shopItem.price) return message.reply('❌ Not enough DC brokeass 😛.');
    user.dc -= shopItem.price;
    user.inventory.push(shopItem.name);
    shopItem.stock--;
    await user.save();
    fs.writeFileSync('shop.json', JSON.stringify(shopData, null, 2));
    return message.reply(`✅ Bought **${shopItem.name}**!`);
  }

  // Sell an item back to the shop (for 50% of its price)
  if (command === 'sell') {
    const itemName = args.join(" ").toLowerCase();
    const shopItem = shop.find(i => i.name.toLowerCase() === itemName || i.id.toLowerCase() === itemName);
    if (!shopItem) return message.reply('❌ Item not found in shop.');
    if (!user.inventory.includes(shopItem.name)) {
      return message.reply('❌ You dont have that item like r u dumb or something .');
    }
    // Remove item from inventory
    user.inventory.splice(user.inventory.indexOf(shopItem.name), 1);
    const sellPrice = Math.floor(shopItem.price / 2); // Sell at 50% cost
    user.dc += sellPrice;
    await user.save();
    return message.reply(`✅ Damn, You sold **${shopItem.name}** for **${sellPrice} DC**!`);
  }

  // View inventory
  if (command === 'inv' || command === 'inventory') {
    if (!user.inventory.length) return message.reply('🎒 Your inventory is empty (nahh lol broke).');
    // Count each item
    const counts = user.inventory.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {});
    const embed = new EmbedBuilder().setTitle('🎒 Inventory').setColor('Blue');
    for (const [itemName, count] of Object.entries(counts)) {
      embed.addFields({ name: itemName, value: `x${count}` });
    }
    return channel.send({ embeds: [embed] });
  }

  // List eggs and their pets
  if (command === 'eggshop') {

const embed = new EmbedBuilder()
  .setTitle("🥚 Egg Shop")
  .setColor("Orange");

eggData.forEach(egg => {
  embed.addFields({
    name: egg.rarity,
    value: egg.pets.map(p => `• ${p}`).join('\n'),
    inline: false
  });
});

message.channel.send({ embeds: [embed] });

  // Buy (hatch) an egg for DC (fixed cost 5000)
  if (command === 'buyegg') {
    const type = args.join(" ").toLowerCase();
    const egg = eggs.find(e => e.rarity.toLowerCase() === type);
    if (!egg) return message.reply('❌ Egg not found.');
    const cost = 5000;
    if (user.dc < cost) return message.reply('❌ Not enough DC dumb broke ass.');
    user.dc -= cost;
    const pet = egg.pets[Math.floor(Math.random() * egg.pets.length)];
    user.inventory.push(pet);
    await user.save();
    return message.reply(`🥚 You hatched a **${pet}** from ${egg.rarity}!...SHEESH BIGGA`);
  }

  // Admin command: allow infinite daily for yourself
  if (command === 'giveinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.');
    user.infCooldown = true; // grant infinite daily
    await user.save();
    return message.reply(`♾️ ${message.author.username},you're cooked LMFAO😘😘.`);
  }

  // Admin command: remove infinite daily (normal cooldown)
  if (command === 'removeinfcd') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to use this command.');
    user.infCooldown = false;
    await user.save();
    return message.reply(`❌ ${message.author.username} ts kid got spared 😂😂😜.`);
  }

  // Admin command: set stock of a shop item (by id or name)
  if (command === 'setstock') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to set stock.. WHO DO YOU THINK YOU ARE .');
    const itemId = args[0];
    const newStock = parseInt(args[1]);
    if (!itemId || isNaN(newStock))
      return message.reply('Usage: !setstock <itemId> <newStock>');
    const shopItem = shop.find(i => 
      i.id.toLowerCase() === itemId.toLowerCase() ||
      i.name.toLowerCase().includes(itemId.toLowerCase())
    );
    if (!shopItem) return message.reply('❌ Item not found.');
    shopItem.stock = newStock;
    fs.writeFileSync('shop.json', JSON.stringify(shopData, null, 2));
    return message.channel.send(`✅ Set stock of **${shopItem.name}** to **${newStock}**.`);
  }

  // Admin command: delete a user's inventory (backing it up)
  if (command === 'deleteinv') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to delete inventories.. WHO DO YOU THINK YOU ARE .');
    const targetUserMention = message.mentions.users.first();
    if (!targetUserMention) return message.reply('Usage: !deleteinv @user');
    const targetUserModel = await User.findOne({ userId: targetUserMention.id });
    if (!targetUserModel) return message.reply('❌ User not found.');
    // Backup inventory to file
    let invData = {};
    try { invData = JSON.parse(fs.readFileSync('inventory.json')); } catch {}
    invData[targetUserMention.id] = targetUserModel.inventory;
    fs.writeFileSync('inventory.json', JSON.stringify(invData, null, 2));
    // Clear inventory
    targetUserModel.inventory = [];
    await targetUserModel.save();
    return message.channel.send(`✅ Inventory of <@${targetUserMention.id}> has been deleted lol.`);
  }

  // Admin command: restore a user's inventory from backup
  if (command === 'restoreinv') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ You need to be an admin to restore inventories..WHO DO YOU THINK YOU R.');
    const targetUserMention = message.mentions.users.first();
    if (!targetUserMention) return message.reply('Usage: !restoreinv @user');
    let invData = {};
    try { invData = JSON.parse(fs.readFileSync('inventory.json')); } catch {}
    const savedInv = invData[targetUserMention.id];
    if (!savedInv) return message.reply('❌ No saved inventory for that user bc his inv probably didnt get deleted .');
    const targetUserModel = await User.findOne({ userId: targetUserMention.id });
    if (!targetUserModel) return message.reply('❌ User not found.');
    targetUserModel.inventory = savedInv;
    await targetUserModel.save();
    delete invData[targetUserMention.id];
    fs.writeFileSync('inventory.json', JSON.stringify(invData, null, 2));
    return message.channel.send(`✅ Inventory of <@${targetUserMention.id}> has been restored.`);
  }

  // Send an embed log (admin-only conceptually)
  if (command === 'log') {
    const logText = args.join(" ");
    if (!logText) return message.reply('Please include update log mister.');
    const embed = new EmbedBuilder()
      .setTitle('📝 Update Log')
      .setDescription(logText)
      .setColor('Orange');
    return channel.send({ embeds: [embed] });
  }

  // Help command (bot commands list)
  if (command === 'dhelp') {
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Bot Commands')
      .setColor('Blurple')
      .setDescription('Here are the available commands:')
      .addFields(
        { name: '💰 Economy', value: '`!dc`, `!daily`, `!paydebt`, `!lb`' },
        { name: '🛒 Shop', value: '`!shop`, `!buy item`, `!sell item`, `!inv`, `!jackpot`' },
        { name: '🥚 Eggs & Pets', value: '`!eggshop`, `!buyegg rarity(for dumbasses like abhi, its common egg)`, `!mypets`' },
        { name: '⚙️ Admin Only', value: '`!givedc`, `!restoreinv user`,`!deleteinv`,`!setstock`, `!giveinfcd`, `!removeinfcd`, `!debt`, `!redebt`' },
        { name: '📜 Misc', value: '`!log`' }
      )
      .setFooter({ text: 'Use commands with ! at the start.' });
    return message.channel.send({ embeds: [embed] });
  }
    // Leaderboard (top DC holders)
  if (command === 'lb' || command === 'leaderboard') {
  const topUsers = await User.find({}).sort({ dc: -1 }).limit(10);

  const embed = new EmbedBuilder()
    .setTitle('🏆 Top Rich Biggas in My Class')
    .setColor('Gold');

  for (let i = 0; i < topUsers.length; i++) {
    const userId = topUsers[i].userId;
    const user = await client.users.fetch(userId).catch(() => null);
    const name = user ? user.tag : `<@${userId}>`;
    const dc = Number(topUsers[i].dc).toLocaleString();

    embed.addFields({
      name: `${i + 1}. ${name}`,
      value: `${dc} DC`,
      inline: false
    });
  }

  return channel.send({ embeds: [embed] });
}

  // Show the user's pets (from their inventory)
  if (command === 'mypets') {
    const pets = user.inventory.filter(item =>
      eggs.some(egg => egg.pets.includes(item))
    );
    if (!pets.length) return message.reply('🐾 You have no pets, cant believe how broken your as is.');
    const petCounts = pets.reduce((acc, pet) => {
      acc[pet] = (acc[pet] || 0) + 1;
      return acc;
    }, {});
    const embed = new EmbedBuilder()
      .setTitle('🐾 Your Pets')
      .setColor('Purple');
    for (const [petName, count] of Object.entries(petCounts)) {
      let description = 'No description.';
      for (const egg of eggs) {
        if (egg.pets.includes(petName) && egg.descriptions?.[petName]) {
          description = egg.descriptions[petName];
          break;
        }
      }
      embed.addFields({ name: `${petName} x${count}`, value: description });
    }
    return channel.send({ embeds: [embed] });
  }
}
client.login(TOKEN);
