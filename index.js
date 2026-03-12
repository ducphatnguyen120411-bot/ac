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
                        .setImage('https://i.imgur.com/K1Lg0Yq.gif') // Ảnh GIF pháo hoa hoặc banner cảm ơn của bạn
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
