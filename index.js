require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(process.env.PORT || 3000);

// --- 2. CẤU HÌNH DATABASE (LƯU TRÊN DISK CỦA RENDER) ---
// Trên Render, ta sẽ mount disk vào thư mục /app/data
const dataDir = path.join(__dirname, 'data');
const fs = require('fs');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY)");

// --- 3. CẤU HÌNH ID ---
const BUYER_ROLE_ID = '1465606400603328577';
const ADMIN_ROLE_ID = '1465374336214106237';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Hàm tạo key: gNhnn5-ffMl7N-YeLTc-cwBUKt-Z6tKqP-HnBT5
function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const lengths = [6, 6, 5, 6, 6, 6];
    return lengths.map(len => {
        let str = '';
        for (let i = 0; i < len; i++) {
            str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return str;
    }).join('-');
}

// --- 4. SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName('taokey')
        .setDescription('Tạo key mới (Chỉ role 1465374336214106237)'),
    new SlashCommandBuilder()
        .setName('setup_redeem')
        .setDescription('Tạo bảng nút bấm Redeem Key')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập: ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('✅ Đã cập nhật Slash Commands');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    // Xử lý Slash Command
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'taokey') {
            if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
                return interaction.reply({ content: '❌ Chỉ role dành riêng mới được tạo key!', ephemeral: true });
            }

            const newKey = generateRandomKey();
            db.prepare('INSERT INTO keys (key) VALUES (?)').run(newKey);
            await interaction.reply({ content: `🔑 **Key mới đã tạo:** \`${newKey}\``, ephemeral: true });
        }

        if (interaction.commandName === 'setup_redeem') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ Cần quyền Admin để dùng lệnh này.', ephemeral: true });
            }

            const button = new ButtonBuilder()
                .setCustomId('btn_redeem')
                .setLabel('Redeem Key')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔑');

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.channel.send({
                content: "### 🧧 NHẬN ROLE BUYER\nNhấn nút bên dưới để nhập License Key.",
                components: [row]
            });
            await interaction.reply({ content: 'Đã tạo bảng thành công!', ephemeral: true });
        }
    }

    // Xử lý Button -> Hiện Modal
    if (interaction.isButton() && interaction.customId === 'btn_redeem') {
        const modal = new ModalBuilder().setCustomId('modal_redeem').setTitle('Enter License Key');
        const input = new TextInputBuilder()
            .setCustomId('input_key')
            .setLabel('License Key *')
            .setPlaceholder('gNhnn5-ffMl7N-YeLTc-cwBUKt-Z6tKqP-HnBT5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    // Xử lý Modal Submit
    if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
        const userKey = interaction.fields.getTextInputValue('input_key').trim();
        const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

        if (!row) {
            return interaction.reply({ content: '❌ Key không tồn tại hoặc đã bị sử dụng!', ephemeral: true });
        }

        // Xóa key + Gán Role
        db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);
        try {
            const role = interaction.guild.roles.cache.get(BUYER_ROLE_ID);
            await interaction.member.roles.add(role);
            await interaction.reply({ content: '✅ Chúc mừng! Bạn đã nhận được role Buyer.', ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ Lỗi gán role. Hãy kiểm tra quyền của Bot!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
