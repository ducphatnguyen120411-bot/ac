require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder 
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(process.env.PORT || 3000);

// --- 2. CẤU HÌNH DATABASE (LƯU TRÊN DISK CỦA RENDER) ---
const dataDir = path.join(__dirname, 'data');
const fs = require('fs');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY)");

// --- 3. CẤU HÌNH ID CỦA BẠN ---
const BUYER_ROLE_ID = '1465606400603328577';
const ADMIN_ROLE_ID = '1465374336214106237';
const LOG_CHANNEL_ID = '1481597927548784817'; // Kênh lưu log báo cáo

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

// --- 4. SLASH COMMANDS (Chỉ còn setup_redeem) ---
const commands = [
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

// --- 5. LỆNH TIN NHẮN TẠO KEY (!c) ---
client.on('messageCreate', async message => {
    // Bỏ qua tin nhắn của bot hoặc ngoài server
    if (message.author.bot || !message.guild) return;

    // Bắt đầu bằng !c
    if (message.content.startsWith('!c')) {
        // Kiểm tra Role Admin
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return message.reply('❌ Bạn không có quyền tạo key!');
        }

        // Lấy số lượng key cần tạo (Mặc định là 1 nếu không nhập số)
        const args = message.content.trim().split(/\s+/);
        let count = parseInt(args[1]);
        if (isNaN(count) || count <= 0) count = 1;

        if (count > 1000) {
            return message.reply('❌ Quá nhiều! Vui lòng tạo tối đa 1000 key mỗi lần để bot không bị quá tải.');
        }

        const newKeys = [];
        const insert = db.prepare('INSERT INTO keys (key) VALUES (?)');
        
        // Dùng transaction để đẩy tốc độ tạo key lên cao nhất
        const insertMany = db.transaction((keys) => {
            for (const k of keys) insert.run(k);
        });

        for (let i = 0; i < count; i++) {
            newKeys.push(generateRandomKey());
        }

        insertMany(newKeys);

        // Xuất file text nếu tin nhắn quá dài (>1900 ký tự)
        const keyText = newKeys.join('\n');
        if (keyText.length > 1900) {
            const buffer = Buffer.from(keyText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `List_${count}_Keys.txt` });
            await message.reply({ 
                content: `✅ Đã tạo thành công **${count}** key. Danh sách key ở file đính kèm bên dưới:`, 
                files: [attachment] 
            });
        } else {
            await message.reply(`✅ Đã tạo thành công **${count}** key:\n\`\`\`\n${keyText}\n\`\`\``);
        }
    }
});

// --- 6. XỬ LÝ NÚT BẤM & GÁN ROLE ---
client.on('interactionCreate', async interaction => {
    // Slash Command Setup Redeem
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup_redeem') {
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

    // Nhấn Nút -> Mở Modal
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

    // Nộp Modal (Nhập Key) -> Xác thực & Log
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

            // THÔNG BÁO VÀO KÊNH LOG
            try {
                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send({
                        content: `✅ **[REDEEM THÀNH CÔNG]**\n👤 Người dùng: <@${interaction.user.id}> (\`${interaction.user.id}\`)\n🔑 Key đã dùng: \`${userKey}\`\n🕒 Thời gian: <t:${Math.floor(Date.now() / 1000)}:f>`
                    });
                }
            } catch (logError) {
                console.error("Không thể gửi tin nhắn log. Hãy kiểm tra lại ID kênh hoặc quyền gửi tin nhắn của bot vào kênh đó.", logError);
            }

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ Lỗi gán role. Hãy kiểm tra quyền của Bot!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
