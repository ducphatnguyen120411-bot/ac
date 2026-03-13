require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, EmbedBuilder 
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');
const fs = require('fs');

// --- 1. WEB SERVER CHO RENDER (KEEP-ALIVE) ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(process.env.PORT || 3000, () => {
    console.log('✅ Web server đang chạy trên port', process.env.PORT || 3000);
});

// --- 2. CẤU HÌNH DATABASE ---
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY)");

// --- 3. CẤU HÌNH ID ---
const BUYER_ROLE_ID = '1465606400603328577';
const ADMIN_ROLE_ID = '1465374336214106237';
const LOG_CHANNEL_ID = '1474046141153677313'; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

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

// --- 4. SLASH COMMANDS SETUP ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup_redeem')
        .setDescription('Tạo bảng nút bấm Redeem Key chuyên nghiệp')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập Discord Bot: ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('✅ Đã cập nhật Slash Commands');
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật Slash Commands:', error);
    }
});

// --- 5. LỆNH TIN NHẮN (!s VÀ !c) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Lệnh !s (Setup Panel)
    if (message.content === '!s') {
        if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return message.reply('❌ Bạn không có quyền dùng lệnh này!');
        }

        const setupEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🌟 KÍCH HOẠT QUYỀN LỢI BUYER')
            .setDescription("🔑 Nhấn **Redeem Key** rồi nhập mã để kích hoạt quyền.")
            .setFooter({ text: 'Hệ thống an toàn & bảo mật', iconURL: message.guild.iconURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_redeem')
                .setLabel('Redeem Key')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔥')
        );

        await message.channel.send({ embeds: [setupEmbed], components: [row] });
        await message.delete().catch(() => null);
    }

    // Lệnh !c (Create Keys)
    if (message.content.startsWith('!c')) {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID) && !message.member.permissions.has('Administrator')) {
            const errEmbed = new EmbedBuilder().setColor('#ED4245').setDescription('❌ Bạn không có quyền quản trị để tạo key!');
            return message.reply({ embeds: [errEmbed] });
        }

        const args = message.content.trim().split(/\s+/);
        let count = parseInt(args[1]);
        if (isNaN(count) || count <= 0) count = 1;
        if (count > 1000) count = 1000;

        const newKeys = [];
        const insert = db.prepare('INSERT INTO keys (key) VALUES (?)');
        const insertMany = db.transaction((keys) => {
            for (const k of keys) insert.run(k);
        });

        for (let i = 0; i < count; i++) newKeys.push(generateRandomKey());
        insertMany(newKeys);

        const keyText = newKeys.join('\n');
        const successEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🔑 KHỞI TẠO KEY THÀNH CÔNG')
            .setDescription(`Đã tạo **${count}** License Key mới.`)
            .setTimestamp();

        if (keyText.length > 1900) {
            const buffer = Buffer.from(keyText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `List_Keys_${count}.txt` });
            await message.reply({ embeds: [successEmbed], files: [attachment] });
        } else {
            successEmbed.addFields({ name: 'Danh sách:', value: `\`\`\`\n${keyText}\n\`\`\`` });
            await message.reply({ embeds: [successEmbed] });
        }
    }
});

// --- 6. XỬ LÝ INTERACTION (SLASH COMMANDS & BUTTONS & MODALS) ---
client.on('interactionCreate', async interaction => {
    try {
        // 6.1 Lệnh Slash Setup
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup_redeem') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ Bạn cần quyền Administrator.', ephemeral: true });
            }
            const setupEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🌟 KÍCH HOẠT QUYỀN LỢI BUYER')
                .setDescription('Nhấn nút bên dưới để nhập Key.')
                .setImage('https://i.imgur.com/8Q85n7s.png');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_redeem').setLabel('Redeem Key').setStyle(ButtonStyle.Success).setEmoji('🔥')
            );
            await interaction.channel.send({ embeds: [setupEmbed], components: [row] });
            return interaction.reply({ content: '✅ Xong!', ephemeral: true });
        }

        // 6.2 Bấm nút Redeem Key -> Mở Modal Form
        if (interaction.isButton() && interaction.customId === 'btn_redeem') {
            const modal = new ModalBuilder().setCustomId('modal_redeem').setTitle('🔑 Nhập mã kích hoạt');
            const input = new TextInputBuilder()
                .setCustomId('input_key')
                .setLabel('License Key của bạn:')
                .setPlaceholder('Nhập mã tại đây...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            
            await interaction.showModal(modal);
            return;
        }

        // 6.3 Xử lý dữ liệu từ Modal Form
        if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
            const userKey = interaction.fields.getTextInputValue('input_key').trim();
            const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

            if (!row) {
                return interaction.reply({ content: '❌ Key không tồn tại hoặc đã được sử dụng!', ephemeral: true });
            }

            // Xóa key khỏi DB ngay lập tức
            db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);

            try {
                const role = interaction.guild.roles.cache.get(BUYER_ROLE_ID);
                if (!role) {
                    return interaction.reply({ content: '❌ Lỗi Server: Không tìm thấy Role Buyer để gán!', ephemeral: true });
                }

                await interaction.member.roles.add(role);
                await interaction.reply({ content: '🎉 Kích hoạt thành công! Bạn đã nhận được Role Buyer.', ephemeral: true });

                // Gửi tin nhắn riêng (DM)
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle('🎊 XÁC NHẬN KÍCH HOẠT')
                        .setDescription(`Bạn đã nhận Role tại **${interaction.guild.name}**\nKey đã dùng: \`${userKey}\``)
                        .setTimestamp();
                    await interaction.user.send({ embeds: [dmEmbed] });
                } catch (e) {
                    console.log(`[Log] Không thể gửi DM cho ${interaction.user.tag}`);
                }

                // Gửi thông báo ra kênh Log
                const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('📢 LOG REDEEM')
                        .addFields(
                            { name: 'Người dùng:', value: `${interaction.user} (${interaction.user.id})`, inline: true },
                            { name: 'Key:', value: `\`${userKey}\``, inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error('[Lỗi gán Role]:', err);
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ Lỗi khi gán Role! Hãy chắc chắn Bot có quyền "Manage Roles" và Role của Bot nằm cao hơn Role Buyer.', ephemeral: true });
                }
            }
            return;
        }
    } catch (error) {
        console.error('[Lỗi Interaction Chung]:', error);
    }
});

client.login(process.env.TOKEN);
