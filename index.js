require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, EmbedBuilder, ActivityType
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');
const fs = require('fs');

// --- 0. HỆ THỐNG ANTI-CRASH ---
process.on('unhandledRejection', (reason, p) => {
    console.error(' [Anti-Crash] Lỗi Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error(' [Anti-Crash] Lỗi Uncaught Exception:', err);
});

// --- 1. WEB SERVER (KEEP-ALIVE) ---
const app = express();
app.get('/', (req, res) => res.send('🚀 Hệ thống Bot License Key đang hoạt động mượt mà!'));
app.listen(process.env.PORT || 3000, () => {
    console.log(`✅ Web server đang chạy trên port ${process.env.PORT || 3000}`);
});

// --- 2. CẤU HÌNH DATABASE ---
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY)");

// --- 3. CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    KEY_PREFIX: 'CYBER', // Tiền tố của Key
    BUYER_ROLE_ID: '1465606400603328577',
    ADMIN_ROLE_ID: '1465374336214106237',
    LOG_CHANNEL_ID: '1474046141153677313',
    THEME_COLOR: '#2B2D31', // Màu tàng hình tiệp với nền Discord
    BANNER_URL: 'https://i.imgur.com/8Q85n7s.png'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- HÀM TẠO KEY ĐỊNH DẠNG: TOP-XXXX-XXXX-XXXX ---
function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // Bỏ chữ thường để key nhìn cứng cáp hơn
    const parts = [];
    for (let i = 0; i < 3; i++) { // Tạo 3 cụm, mỗi cụm 4 ký tự
        let str = '';
        for (let j = 0; j < 4; j++) {
            str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        parts.push(str);
    }
    return `${CONFIG.KEY_PREFIX}-${parts.join('-')}`;
}

// --- 4. SLASH COMMANDS SETUP ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup_redeem')
        .setDescription('Tạo bảng nút bấm Redeem Key (Chuyên nghiệp)')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập Discord Bot: ${client.user.tag}`);
    client.user.setActivity('Hệ thống License Key', { type: ActivityType.Watching });

    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('✅ Đã cập nhật Slash Commands thành công.');
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật Slash Commands:', error);
    }
});

// --- 5. LỆNH TIN NHẮN (!s VÀ !c) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Lệnh !s (Setup Panel)
    if (message.content.toLowerCase() === '!s') {
        await message.delete().catch(() => null); // Xóa ngay lập tức

        if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
            return message.channel.send({ content: `<@${message.author.id}> ❌ **Từ chối truy cập:** Bạn không có quyền dùng lệnh này!` }).then(m => setTimeout(() => m.delete(), 5000));
        }

        const setupEmbed = new EmbedBuilder()
            .setColor(CONFIG.THEME_COLOR)
            .setTitle('🛒 HỆ THỐNG KÍCH HOẠT DỊCH VỤ')
            .setDescription('> Xin chào! Vui lòng nhấn vào nút **Redeem Key** bên dưới và nhập mã bản quyền của bạn để kích hoạt hệ thống.\n\n`🔒 Mọi giao dịch đều được bảo mật tuyệt đối.`')
            .setImage(CONFIG.BANNER_URL)
            .setFooter({ text: 'Hệ thống tự động • 24/7', iconURL: message.guild.iconURL({ dynamic: true }) });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_redeem')
                .setLabel('Redeem Key')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔑')
        );

        await message.channel.send({ embeds: [setupEmbed], components: [row] });
    }

    // Lệnh !c (Create Keys)
    if (message.content.startsWith('!c')) {
        await message.delete().catch(() => null); // Xóa ngay lập tức

        if (!message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID) && !message.member.permissions.has('Administrator')) return;

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
            .setDescription(`Hệ thống vừa xuất xưởng **${count}** License Key mới.`)
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();

        if (keyText.length > 1900) {
            const buffer = Buffer.from(keyText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `List_Keys_TOP_${count}.txt` });
            await message.channel.send({ embeds: [successEmbed], files: [attachment] });
        } else {
            successEmbed.addFields({ name: 'Danh sách mã bảo mật:', value: `\`\`\`\n${keyText}\n\`\`\`` });
            await message.channel.send({ embeds: [successEmbed] });
        }
    }
});

// --- 6. XỬ LÝ GIAO DIỆN TƯƠNG TÁC (BUTTONS & MODALS) ---
client.on('interactionCreate', async interaction => {
    try {
        // Bấm nút Redeem Key -> Mở Form
        if (interaction.isButton() && interaction.customId === 'btn_redeem') {
            const modal = new ModalBuilder().setCustomId('modal_redeem').setTitle('HỆ THỐNG KÍCH HOẠT');
            const input = new TextInputBuilder()
                .setCustomId('input_key')
                .setLabel('Nhập License Key của bạn vào đây:')
                .setPlaceholder(`Ví dụ: ${CONFIG.KEY_PREFIX}-A1B2-C3D4-E5F6`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await interaction.showModal(modal);
        }

        // Nộp Form Modal
        if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
            const userKey = interaction.fields.getTextInputValue('input_key').trim().toUpperCase(); // Tự động chuyển text nhập vào thành IN HOA
            
            await interaction.deferReply({ ephemeral: true });

            const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

            if (!row) {
                return interaction.editReply({ content: '❌ **Thất bại:** License Key không hợp lệ hoặc đã được sử dụng trước đó!' });
            }

            // Xóa key + Gán Role
            db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);

            try {
                const role = interaction.guild.roles.cache.get(CONFIG.BUYER_ROLE_ID);
                if (!role) {
                    return interaction.editReply({ content: '❌ **Lỗi Server:** Không tìm thấy Role Buyer. Vui lòng báo cáo Admin!' });
                }

                await interaction.member.roles.add(role);
                await interaction.editReply({ content: '🎉 **Hoàn tất:** Chúc mừng bạn đã kích hoạt thành công quyền lợi Buyer!' });

                // Gửi DM cho khách hàng
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🎊 XÁC NHẬN KÍCH HOẠT')
                        .setDescription(`Cảm ơn bạn đã tin tưởng dịch vụ tại **${interaction.guild.name}**!\nQuyền lợi của bạn đã được cập nhật.`)
                        .addFields({ name: '🔑 Key đã dùng', value: `\`${userKey}\`` })
                        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                        .setFooter({ text: 'Biên lai điện tử', iconURL: client.user.displayAvatarURL() })
                        .setTimestamp();
                    await interaction.user.send({ embeds: [dmEmbed] });
                } catch (e) {
                    console.log(`[Hệ thống] User ${interaction.user.tag} đang chặn tin nhắn riêng (DM).`);
                }

                // Gửi Log báo cáo cho Admin
                const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#F1C40F')
                        .setTitle('💳 LOG GIAO DỊCH THÀNH CÔNG')
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: '👤 Khách hàng', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                            { name: '🔑 License Key', value: `\`${userKey}\``, inline: false }
                        )
                        .setFooter({ text: 'Trạng thái: Hoàn thành' })
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error('[Lỗi gán Role]:', err);
                await interaction.editReply({ content: '❌ **Lỗi gán Role:** Vui lòng kiểm tra lại quyền hạn của Bot (Cần quyền Manage Roles và vị trí role Bot phải cao hơn role Buyer).' });
            }
        }
    } catch (error) {
        console.error('[Lỗi Interaction Chung]:', error);
    }
});

client.login(process.env.TOKEN);
