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

// --- 1. WEB SERVER (KEEP-ALIVE) ---
const app = express();
app.get('/', (req, res) => res.send('🟢 Bot Premium is Running!'));
app.listen(process.env.PORT || 3000);

// --- 2. CẤU HÌNH & DATABASE ---
const CONFIG = {
    BUYER_ROLE_ID: '1465606400603328577',
    ADMIN_ROLE_ID: '1465374336214106237',
    LOG_CHANNEL_ID: '1474046141153677313',
    BANNER: 'https://images.steamusercontent.com/ugc/449611652050198394/003B0F458420C44A75D10CBDC94A9C0B964C06F7/',
    COLORS: { GOLD: '#FFD700', SUCCESS: '#2ECC71', ERROR: '#ED4245', INFO: '#5865F2' }
};

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new Database(path.join(dataDir, 'database.sqlite'));

// Tạo bảng lưu Key (có thêm cột days) và bảng Subs (lưu ngày hết hạn)
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, days INTEGER)");
db.exec("CREATE TABLE IF NOT EXISTS subs (userId TEXT PRIMARY KEY, expiry BIGINT)");

const client = new Client({
    intents: [32767], // Đầy đủ Intents cho Discord.js v14
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Hàm tạo Key chuyên nghiệp
function generateKey() {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PREMIUM-${part()}-${part()}-${part()}`;
}

// --- 3. SLASH COMMANDS (Check hạn sử dụng) ---
client.once('ready', async () => {
    console.log(`🤖 Online: ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('me').setDescription('Xem thời hạn gói Premium của bạn'),
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });

    // HỆ THỐNG QUÉT HẾT HẠN TỰ ĐỘNG (Mỗi 60 giây)
    setInterval(async () => {
        const now = Date.now();
        const expired = db.prepare('SELECT userId FROM subs WHERE expiry < ?').all(now);
        for (const user of expired) {
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            if (!guild) continue;
            const member = await guild.members.fetch(user.userId).catch(() => null);
            if (member) await member.roles.remove(CONFIG.BUYER_ROLE_ID).catch(() => null);
            db.prepare('DELETE FROM subs WHERE userId = ?').run(user.userId);
            console.log(`[System] Đã gỡ hạn: ${user.userId}`);
        }
    }, 60000);
});

// --- 4. XỬ LÝ LỆNH TIN NHẮN (!s và !c) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Lệnh !s (Setup Panel) - Fix lỗi: Xóa tin nhắn ngay lập tức
    if (message.content.toLowerCase() === '!s') {
        await message.delete().catch(() => null); 
        if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

        const setupEmbed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.GOLD)
            .setTitle('💎 HỆ THỐNG KÍCH HOẠT PREMIUM')
            .setDescription(
                "Chào mừng bạn đến với khu vực nâng cấp thành viên!\n\n" +
                "**Quyền lợi:**\n" +
                "✅ Truy cập các kênh ẩn VIP.\n" +
                "✅ Role đặc biệt sáng nhất bảng thành viên.\n" +
                "✅ Hỗ trợ ưu tiên từ Admin.\n\n" +
                "*Bấm vào nút dưới đây để nhập mã License.*"
            )
            .setImage(CONFIG.BANNER)
            .setFooter({ text: 'Hệ thống tự động 24/7', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_redeem').setLabel('KÍCH HOẠT NGAY').setStyle(ButtonStyle.Success).setEmoji('🗝️')
        );

        await message.channel.send({ embeds: [setupEmbed], components: [row] });
    }

    // Lệnh !c <ngày> <số lượng> (Tạo Key)
    if (message.content.startsWith('!c')) {
        await message.delete().catch(() => null);
        if (!message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;

        const args = message.content.split(/\s+/);
        const days = parseInt(args[1]) || 30;
        const count = parseInt(args[2]) || 1;

        const newKeys = [];
        const insert = db.prepare('INSERT INTO keys (key, days) VALUES (?, ?)');
        for (let i = 0; i < count; i++) {
            const k = generateKey();
            insert.run(k, days);
            newKeys.push(k);
        }

        const keyText = newKeys.join('\n');
        const successEmbed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.SUCCESS)
            .setTitle('🔐 ĐÃ TẠO KEY THÀNH CÔNG')
            .setDescription(`Tạo thành công **${count}** key loại **${days} ngày**.`)
            .setTimestamp();

        if (keyText.length > 1024) {
            const buffer = Buffer.from(keyText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: 'keys.txt' });
            await message.channel.send({ embeds: [successEmbed], files: [attachment] });
        } else {
            successEmbed.addFields({ name: 'Danh sách mã:', value: `\`\`\`\n${keyText}\n\`\`\`` });
            await message.channel.send({ embeds: [successEmbed] });
        }
    }
});

// --- 5. XỬ LÝ INTERACTION (MODAL & CỘNG DỒN THỜI GIAN) ---
client.on('interactionCreate', async interaction => {
    // Check hạn bằng lệnh /me
    if (interaction.isChatInputCommand() && interaction.commandName === 'me') {
        const row = db.prepare('SELECT expiry FROM subs WHERE userId = ?').get(interaction.user.id);
        if (!row) return interaction.reply({ content: '❌ Bạn hiện chưa có gói Premium nào.', ephemeral: true });
        
        const ts = Math.floor(row.expiry / 1000);
        const embed = new EmbedBuilder()
            .setTitle('💎 THÔNG TIN CỦA BẠN')
            .setColor(CONFIG.COLORS.INFO)
            .addFields(
                { name: 'Trạng thái:', value: '🟢 Đang hoạt động', inline: true },
                { name: 'Ngày hết hạn:', value: `<t:${ts}:F>`, inline: false },
                { name: 'Thời gian còn lại:', value: `<t:${ts}:R>`, inline: false }
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Hiện Modal khi bấm nút
    if (interaction.isButton() && interaction.customId === 'btn_redeem') {
        const modal = new ModalBuilder().setCustomId('modal_redeem').setTitle('KÍCH HOẠT KEY');
        const input = new TextInputBuilder()
            .setCustomId('input_key')
            .setLabel('NHẬP MÃ LICENSE:')
            .setPlaceholder('PREMIUM-XXXX-XXXX-XXXX')
            .setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    // Xử lý nạp Key
    if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
        const userKey = interaction.fields.getTextInputValue('input_key').trim();
        const keyData = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

        if (!keyData) {
            return interaction.reply({ content: '❌ Key không tồn tại hoặc đã được sử dụng!', ephemeral: true });
        }

        // --- LOGIC CỘNG DỒN ---
        const now = Date.now();
        const addTimeMS = keyData.days * 24 * 60 * 60 * 1000;
        const currentSub = db.prepare('SELECT expiry FROM subs WHERE userId = ?').get(interaction.user.id);

        let newExpiry;
        if (currentSub && currentSub.expiry > now) {
            newExpiry = currentSub.expiry + addTimeMS; // Cộng tiếp vào hạn cũ
        } else {
            newExpiry = now + addTimeMS; // Tính từ bây giờ
        }

        // Lưu Database & Xóa Key
        db.prepare('INSERT OR REPLACE INTO subs (userId, expiry) VALUES (?, ?)').run(interaction.user.id, newExpiry);
        db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);

        // Gán Role
        const role = interaction.guild.roles.cache.get(CONFIG.BUYER_ROLE_ID);
        if (role) await interaction.member.roles.add(role).catch(() => null);

        const ts = Math.floor(newExpiry / 1000);
        await interaction.reply({ content: `🎉 Thành công! Bạn đã nạp thêm **${keyData.days} ngày**. Hạn mới: <t:${ts}:f>`, ephemeral: true });

        // Log Admin
        const logChan = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
        if (logChan) {
            const logEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.SUCCESS)
                .setAuthor({ name: '🔑 KEY REDEEMED', iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: 'Khách hàng:', value: `${interaction.user}`, inline: true },
                    { name: 'Số ngày nạp:', value: `\`${keyData.days} Ngày\``, inline: true },
                    { name: 'Hạn mới:', value: `<t:${ts}:F>`, inline: false }
                );
            logChan.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN);
