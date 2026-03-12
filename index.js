require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, EmbedBuilder 
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');

// --- 1. WEB SERVER CHO RENDER (KEEP-ALIVE) ---
const app = express();
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(process.env.PORT || 3000);

// --- 2. CẤU HÌNH DATABASE ---
const dataDir = path.join(__dirname, 'data');
const fs = require('fs');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY)");

// --- 3. CẤU HÌNH ID (THAY THẾ TẠI ĐÂY) ---
const BUYER_ROLE_ID = '1465606400603328577';
const ADMIN_ROLE_ID = '1465374336214106237';
const LOG_CHANNEL_ID = '1468261843817730048'; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages // Quan trọng để gửi DM
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Hàm tạo key ngẫu nhiên
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

// --- 5. LỆNH TIN NHẮN TẠO KEY (!c [số lượng]) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!c')) {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            const errEmbed = new EmbedBuilder().setColor('#ED4245').setDescription('❌ Bạn không có quyền quản trị để tạo key!');
            return message.reply({ embeds: [errEmbed] });
        }

        const args = message.content.trim().split(/\s+/);
        let count = parseInt(args[1]);
        if (isNaN(count) || count <= 0) count = 1;

        if (count > 1000) {
            return message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('❌ Tối đa 1000 key mỗi lần!')] });
        }

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
            .setDescription(`Đã tạo **${count}** License Key mới vào hệ thống.`)
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

// --- 6. XỬ LÝ INTERACTION (NÚT BẤM, MODAL) ---
client.on('interactionCreate', async interaction => {
    
    // 6.1 Lệnh Setup Redeem Panel
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup_redeem') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Bạn cần quyền Administrator.', ephemeral: true });
        }

        const setupEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🌟 KÍCH HOẠT QUYỀN LỢI BUYER')
            .setDescription('Chào mừng bạn đến với hệ thống kích hoạt tự động!\n\n**Hướng dẫn:**\n1️⃣ Nhấn nút **Redeem Key** bên dưới.\n2️⃣ Nhập mã License bạn đã mua.\n3️⃣ Bot sẽ tự động gán Role và gửi thông báo cho bạn.')
            .setImage('https://i.imgur.com/8Q85n7s.png') // Banner tùy chỉnh
            .setFooter({ text: 'Hệ thống an toàn & bảo mật', iconURL: interaction.guild.iconURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_redeem')
                .setLabel('Redeem Key')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🧧')
        );

        await interaction.channel.send({ embeds: [setupEmbed], components: [row] });
        await interaction.reply({ content: '✅ Đã thiết lập bảng Redeem!', ephemeral: true });
    }

    // 6.2 Nhấn nút -> Mở Modal nhập Key
    if (interaction.isButton() && interaction.customId === 'btn_redeem') {
        const modal = new ModalBuilder().setCustomId('modal_redeem').setTitle('🔑 Nhập mã kích hoạt');
        const input = new TextInputBuilder()
            .setCustomId('input_key')
            .setLabel('License Key của bạn:')
            .setPlaceholder('Nhập mã (Ví dụ: gNhnn5-ffMl7N-...)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    // 6.3 Xử lý sau khi nộp Modal
    if (interaction.isModalSubmit() && interaction.customId === 'modal_redeem') {
        const userKey = interaction.fields.getTextInputValue('input_key').trim();
        const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(userKey);

        if (!row) {
            const failEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Kích hoạt thất bại')
                .setDescription('Mã key này không tồn tại hoặc đã được sử dụng trước đó.');
            return interaction.reply({ embeds: [failEmbed], ephemeral: true });
        }

        // Xóa Key ngay lập tức để bảo mật
        db.prepare('DELETE FROM keys WHERE key = ?').run(userKey);

        try {
            const role = interaction.guild.roles.cache.get(BUYER_ROLE_ID);
            if (!role) throw new Error("Không tìm thấy Role ID");

            await interaction.member.roles.add(role);

            // Gửi tin nhắn thành công tại chỗ (Ephermal)
            const successUserEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎉 KÍCH HOẠT THÀNH CÔNG!')
                .setDescription(`Bạn đã trở thành **Buyer** của server **${interaction.guild.name}**.\nVui lòng kiểm tra tin nhắn riêng (DM) để nhận thông tin chi tiết.`);
            await interaction.reply({ embeds: [successUserEmbed], ephemeral: true });

            // --- GỬI DM CHO USER ---
            const dmEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎊 XÁC NHẬN KÍCH HOẠT BẢN QUYỀN')
                .setDescription(`Chúc mừng **${interaction.user.username}**! Bạn đã kích hoạt thành công mã License tại **${interaction.guild.name}**.`)
                .setThumbnail(interaction.guild.iconURL())
                .addFields(
                    { name: '🎁 Đặc quyền nhận được:', value: `<@&${BUYER_ROLE_ID}>`, inline: true },
                    { name: '🔑 License sử dụng:', value: `\`${userKey}\``, inline: true }
                )
                .setFooter({ text: 'Cảm ơn bạn đã ủng hộ chúng tôi!' })
                .setTimestamp();

            try {
                await interaction.user.send({ embeds: [dmEmbed] });
            } catch (err) {
                console.log(`[DM] Không thể gửi tin nhắn cho ${interaction.user.tag} (User đóng DM).`);
            }

            // --- GỬI LOG VÀO KÊNH QUẢN TRỊ ---
            const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID) || await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📢 LOG REDEEM MỚI')
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Người dùng:', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                        { name: '🔑 Key sử dụng:', value: `\`${userKey}\``, inline: true },
                        { name: '📅 Ngày dùng:', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: 'Hệ thống quản lý Key' });
                await logChannel.send({ embeds: [logEmbed] });
            }

        } catch (err) {
            console.error(err);
            const errRoleEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('❌ Lỗi hệ thống')
                .setDescription('Bot không thể gán role. Vui lòng liên hệ Admin kiểm tra quyền hạn của Bot (Role của Bot phải nằm trên Role Buyer).');
            await interaction.reply({ embeds: [errRoleEmbed], ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
