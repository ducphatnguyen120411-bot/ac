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
app.get('/', (req, res) => res.send('🟢 Bot is online and running smoothly!'));
app.listen(process.env.PORT || 3000, () => {
    console.log('🌐 Web server đang chạy trên port', process.env.PORT || 3000);
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

// Hàm tạo Key định dạng đẹp hơn: XXXX-XXXX-XXXX-XXXX
function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const parts = [];
    for (let i = 0; i < 4; i++) {
        let str = '';
        for (let j = 0; j < 4; j++) {
            str += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        parts.push(str);
    }
    return parts.join('-');
}

// --- 4. SLASH COMMANDS SETUP ---
const commands = [
    new SlashCommandBuilder()
        .setName('setup_redeem')
        .setDescription('Tạo bảng nút bấm Redeem Key chuyên nghiệp')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`🤖 Đã đăng nhập Discord Bot: ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('✅ Đã cập nhật Slash Commands thành công!');
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
            return message.reply({ content: '❌ Bạn không có quyền dùng lệnh này!', ephemeral: true });
        }

        const setupEmbed = new EmbedBuilder()
            .setColor('#FFD700') // Màu vàng Gold Premium
            .setTitle('💎 TRUNG TÂM KÍCH HOẠT QUYỀN LỢI')
            .setDescription(
                "Chào mừng bạn đến với hệ thống kích hoạt tự động!\n\n" +
                "**Hướng dẫn kích hoạt:**\n" +
                "👉 Nhấn vào nút **Redeem Key** bên dưới.\n" +
                "👉 Nhập mã License Key bạn đã nhận được.\n" +
                "👉 Nhận Role tự động và mở khóa toàn bộ quyền lợi."
            )
            .setThumbnail(message.guild.iconURL({ dynamic: true, size: 512 }))
            .setImage('https://images.steamusercontent.com/ugc/449611652050198394/003B0F458420C44A75D10CBDC94A9C0B964C06F7/?imw=5000&imh=5000&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false') // Thay bằng Banner của server bạn
            .setFooter({ text: 'Hệ thống an toàn & bảo mật tự động', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_redeem')
                .setLabel('REDEEM KEY NGAY')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🗝️')
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
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setTitle('🔐 KHỞI TẠO KEY THÀNH CÔNG')
            .setDescription(`Đã tạo thành công **${count}** License Key mới vào cơ sở dữ liệu.`)
            .setTimestamp();

        if (keyText.length > 1900) {
            const buffer = Buffer.from(keyText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `Premium_Keys_${count}.txt` });
            await message.reply({ embeds: [successEmbed], files: [attachment] });
        } else {
            successEmbed.addFields({ name: 'Danh sách Key:', value: `\`\`\`\n${keyText}\n\`\`\`` });
            await message.reply({ embeds: [successEmbed] });
        }
    }
});

// --- 6. XỬ LÝ INTERACTION (SLASH COMMANDS & BUTTONS & MODALS) ---
client.on('interactionCreate', async interaction => {
    try {
        // 6.1 Bấm nút Redeem Key -> Mở Modal Form
        if (interaction.isButton() && interaction.customId === 'btn_redeem') {
            const modal = new ModalBuilder()
                .setCustomId('modal_redeem')
                .setTitle('🗝️ KÍCH HOẠT QUYỀN LỢI');

            const input = new TextInputBuilder()
                .setCustomId('input_key')
                .setLabel('Nhập License Key của bạn vào bên dưới:')
                .setPlaceholder('VD: ABCD-EFGH-1234-5678')
                .setStyle(TextInputStyle.Short)
                .setMinLength(10)
                .setRequired(true);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return;
        }

        // 6.2 Xử lý dữ liệu từ Modal Form
        if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
            const userKey = interaction.fields.getTextInputValue('input_key').trim();
            const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

            if (!row) {
                const errEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setDescription('❌ **Key không hợp lệ!** Mã này không tồn tại hoặc đã được người khác sử dụng.');
                return interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }

            // Xóa key khỏi DB ngay lập tức
            db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);

            try {
                const role = interaction.guild.roles.cache.get(BUYER_ROLE_ID);
                if (!role) {
                    return interaction.reply({ content: '❌ Lỗi Server: Không tìm thấy Role để gán! Vui lòng báo cho Admin.', ephemeral: true });
                }

                await interaction.member.roles.add(role);

                // Phản hồi tại server
                const successMsg = new EmbedBuilder()
                    .setColor('#57F287')
                    .setDescription(`🎉 **Kích hoạt thành công!** Bạn đã nhận được role <@&${BUYER_ROLE_ID}>. Kiểm tra tin nhắn riêng (DM) nhé!`);
                await interaction.reply({ embeds: [successMsg], ephemeral: true });

                // --- GỬI TIN NHẮN DM SIÊU XỊN ---
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#FFD700') // Màu Gold
                        .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
                        .setTitle('🎉 CHÚC MỪNG BẠN ĐÃ KÍCH HOẠT THÀNH CÔNG!')
                        .setDescription(`Xin chào **${interaction.user.username}**, cảm ơn bạn đã ủng hộ server. Quyền lợi của bạn đã được mở khóa toàn bộ!`)
                        .addFields(
                            { name: '👤 Người dùng', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '👑 Quyền lợi nhận được', value: `@Buyer (Premium)`, inline: true },
                            { name: '🗝️ License Key đã dùng', value: `||${userKey}||`, inline: false } // Spoiler key để bảo mật
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .setImage('data:image/jpeg;base64,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') // Ảnh GIF pháo hoa hoặc banner cảm ơn của bạn
                        .setFooter({ text: 'Cảm ơn bạn đã tin tưởng dịch vụ của chúng tôi ❤️', iconURL: client.user.displayAvatarURL() })
                        .setTimestamp();

                    // Thêm nút bấm dẫn người dùng quay lại server
                    const linkRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Trở về Server')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/channels/${interaction.guild.id}`)
                            .setEmoji('🚀')
                    );

                    await interaction.user.send({ embeds: [dmEmbed], components: [linkRow] });
                } catch (e) {
                    console.log(`[Log] Người dùng ${interaction.user.tag} đã tắt nhận tin nhắn người lạ (DM).`);
                }

                // --- GỬI THÔNG BÁO RA KÊNH LOG CHUYÊN NGHIỆP ---
                const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setAuthor({ name: 'Log Hệ Thống - Redeem Key', iconURL: client.user.displayAvatarURL() })
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: 'Khách hàng:', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                            { name: 'Key sử dụng:', value: `\`${userKey}\``, inline: true },
                            { name: 'Thời gian:', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setFooter({ text: `ID: ${interaction.user.id}` });
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error('[Lỗi gán Role]:', err);
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ Lỗi hệ thống khi gán Role! Hãy chắc chắn Bot có quyền "Manage Roles" và Role của Bot nằm cao hơn Role Buyer.', ephemeral: true });
                }
            }
        }
    } catch (error) {
        console.error('[Lỗi Interaction Chung]:', error);
    }
});

client.login(process.env.TOKEN);
