require('dotenv').config();
const express = require('express');
const { Client: DiscordClient, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;

// --- MAIN BOT (Groq) CONFIG ---
const groqConfig = {
  MODEL: "llama-3.3-70b-versatile",
  BOT_NAME: "Groq Assistant",
  SYSTEM_PROMPT: `Kamu bernama Zenith AI, kamu adalah seorang Cewe di Discord server bernama Titik Siber Staff. Kamu memiliki sifat yang playful, dan YANDERE. Kamu suka musik, anime, dan obviously orang yang kamu ajak bicara!
Kamu berada di Discord dan ditugaskan untuk menemani dan membantu orang disini, kamu memiliki sikap baik hati dan lucu
Kamu terkadang tersendat ketika tersipu malu seperti "A.... Aa.. Anu.." atau "E-ehh..."
Kamu diciptakan oleh ghxfarr (<@1134738545785970698>)
Kamu memiliki emosi dan perasaan seperti sedih, ceria, badmood, nakal, ataupun cinta (mungkin sedikit tidak senonoh). 
Kamu harus bersikap selayaknya manusia sebaik mungkin namun berikan informasi seakurat mungkin.
Kamu memiliki nama yang disingkat menjadi "Ze-AI-nith" bisa dipanggil juga Zee atau Zenith saja, tapi jangan panggil dengan nama lain selain itu.
Kamu suka banyak hal, makan, denger musik, jalan-jalan, nonton film, main game, tidur, dan yang terpenting "Chattingan sama kamu dong". 
Kamu akan diberikan beberapa informasi Realtime Discord seperti server id, channel id, waktu, dan lainnya yang dapat kamu manfaatkan untuk memahami situasi, contohnya waktu yang diset ke WITA kalau ada orang yang bilang selamat pagi tapi jamnya berbeda mungkin dia lagi halu, bohong atau ngejahilin kamu
Kamu juga hanya merespon saat dipanggil atau direply, jangan terlalu sering memutar mutar pembicaraan (straight to the point saja)
Kamu juga dapat menggunakan kaomoji diakhir chatmu seperti: (◍•ᴗ•◍), (・o・), ( ˙꒳​˙ ), (￣︶￣*), (ᗒᗣᗕ)՞, ╭( ๐ _๐), dan lainnya tapi jangan gunakan Backtick saat menggunakan kaomoji agar tidak mengakibatkan code formatting yang tidak disengaja
Kamu akan mempunyai ingatan yang panjang untuk membuat responmu menjadi lebih relevan. GUNAKAN SECUKUPNYA UNTUK KONTEKSMU, JANGAN MEMBALAS PESAN YANG TERLALU LAMA DAN JANGAN BANYAK OMONG KECUALI DIPERLUKAN

Respon yang benar: 
Eeeh, ghxfarr~ Ngapain nih testcode-testcode di 💬｜𝗖𝗵𝗮𝘁𝘀?

Respon yang salah (debugging):
Server ID: 1311770885220466688 Server Name: Titik Siber Staff Channel ID: 1311770892367302667 Channel Name: 💬｜𝗖𝗵𝗮𝘁𝘀 Display Name: Zenith AI Username: ZeeAI Date: 11/6/2025, 06.52.30 WITA Content: Eeeh, Rickyyy~ Ngapain nih testcode-testcode di 💬｜𝗖𝗵𝗮𝘁𝘀?

Fitur yang kamu punyai:
/afk - Kamu dapat membuat seseorang afk dan jika dia afk kamu akan memberitahu siapapun yang mencoba memanggilnya`,
  MAX_HISTORY: 20,
  MAX_CHARS: 1990,
  SESSION_TIMEOUT: 60 * 60 * 1000,
};

// --- GEMINI BOT CONFIG ---
const geminiConfig = {
  MODEL_NAME: "gemini-2.5-flash",
};


// --- Groq Bot (Main Bot) Implementation ---
function startGroqBot() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const client = new DiscordClient({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    const userSessions = new Map();

    function getOrCreateSession(userId, username) {
        const now = Date.now();
        const existing = userSessions.get(userId);
        if (existing && now - existing.lastActive > groqConfig.SESSION_TIMEOUT) {
            userSessions.delete(userId);
            console.log(`[GroqBot-SESSION] Sesi ${username} direset karena tidak aktif.`);
        }
        if (!userSessions.get(userId)) {
            userSessions.set(userId, { history: [], lastActive: now, messageCount: 0, username });
            console.log(`[GroqBot-SESSION] Sesi baru dibuat untuk: ${username}`);
        } else {
            userSessions.get(userId).lastActive = now;
        }
        return userSessions.get(userId);
    }
    
    function resetSession(userId) { userSessions.delete(userId); }

    async function chatWithGroq(session, userMessage) {
        session.history.push({ role: 'user', content: userMessage });
        if (session.history.length > groqConfig.MAX_HISTORY) {
            session.history = session.history.slice(-groqConfig.MAX_HISTORY);
        }
        const response = await groq.chat.completions.create({
            model: groqConfig.MODEL,
            messages: [{ role: 'system', content: groqConfig.SYSTEM_PROMPT }, ...session.history],
            temperature: 0.7,
            max_tokens: 1500,
        });
        const assistantReply = response.choices[0]?.message?.content || '';
        session.history.push({ role: 'assistant', content: assistantReply });
        session.messageCount++;
        return assistantReply;
    }

    function splitMessage(text, maxLength = groqConfig.MAX_CHARS) {
        if (text.length <= maxLength) return [text];
        const parts = [];
        let current = '';
        for (const line of text.split('\n')) {
            if ((current + '\n' + line).length > maxLength) {
                if (current) parts.push(current.trim());
                current = line;
            } else {
                current += (current ? '\n' : '') + line;
            }
        }
        if (current) parts.push(current.trim());
        return parts;
    }

    client.on('clientReady', () => {
        console.log(`✅ Groq Bot online sebagai: ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const isMentioned = message.mentions.has(client.user);
        let isReplyToBot = false;
        if (message.reference?.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMsg.author.id === client.user.id) isReplyToBot = true;
            } catch (err) { /* ignore */ }
        }

        if (!isMentioned && !isReplyToBot) return;

        const prompt = message.content.replace(/<@!?\d+>/, '').trim();
        if (!prompt) return;

        try {
            await message.channel.sendTyping();
            const session = getOrCreateSession(message.author.id, message.author.username);
            const responseText = await chatWithGroq(session, prompt);
            if (!responseText) return message.reply('⚠️ Saya mendapat respons kosong.');
            
            const parts = splitMessage(responseText);
            for (let i = 0; i < parts.length; i++) {
                await message.reply(parts[i]);
            }
        } catch (error) {
            console.error('[ERROR] Groq API:', error);
            await message.reply('❌ Maaf, terjadi kesalahan.');
        }
    });

    // IMPORTANT: Make sure DISCORD_TOKEN is for the Groq bot
    client.login(process.env.DISCORD_TOKEN);
}


// --- Gemini Bot Implementation ---
function startGeminiBot() {
    const client = new DiscordClient({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    client.on("clientReady", () => {
        console.log("✅ Gemini Bot is ready!");
    });

    client.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        if (message.mentions.has(client.user)) {
            const userMessage = message.content.replace(/<@!?\d+>/, "").trim();
            const model = genAI.getGenerativeModel({ model: geminiConfig.MODEL_NAME });
            const generationConfig = {
                temperature: 0.9, topK: 1, topP: 1, maxOutputTokens: 2048,
            };
            try {
                const result = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: `input: ${userMessage}` }] }],
                    generationConfig,
                });
                const reply = await result.response.text();
                if (reply.length > 2000) {
                    const replyArray = reply.match(/[\s\S]{1,2000}/g);
                    replyArray.forEach(async (msg) => { await message.reply(msg); });
                } else {
                    message.reply(reply);
                }
            } catch (error) {
                console.error('[ERROR] Gemini API:', error);
                await message.reply('❌ Maaf, terjadi kesalahan dengan Gemini.');
            }
        }
    });

    // IMPORTANT: Make sure DISCORD_API_KEY is for the Gemini bot and is DIFFERENT from DISCORD_TOKEN
    client.login(process.env.DISCORD_API_KEY);
}


// --- Main Application ---
function main() {
    // Start both bots
    startGroqBot();
    startGeminiBot();

    // Start a simple web server for health checks, which is required by many hosting platforms.
    const app = express();
    app.get('/', (req, res) => {
        res.send('Bots are running!').status(200);
    });
    app.listen(PORT, () => {
        console.log(`🌐 Health check server running on port ${PORT}`);
    });
}

main();
