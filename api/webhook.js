import { Bot, webhookCallback } from "grammy";
import { createClient } from "@supabase/supabase-js"; // Atau @supabase/supabase-js

// Inisialisasi Bot dan Supabase
const bot = new Bot(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Ganti dengan ID Telegram kamu agar perintah hanya bisa dieksekusi olehmu
const OWNER_ID = 123456789; 

// Kumpulan emoji random untuk menyamarkan tag
const EMOJIS = ["🔥", "✨", "🌟", "📢", "🎮", "🚀", "👾", "🦊", "⚡", "🐧"];

// Middleware untuk mencatat/update member yang aktif di grup ke database
bot.on("message", async (ctx, next) => {
  const chatId = ctx.chat.id;
  const from = ctx.from;

  if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
    // Simpan atau update data member di Supabase
    await supabase.from("group_members").upsert({
      user_id: from.id,
      username: from.username || null,
      first_name: from.first_name,
      chat_id: chatId
    });
  }
  return next();
});

// ==========================================
// PERINTAH 1: /kabehan (Tag Semua Member)
// ==========================================
bot.command("kabehan", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh Owner bot!");
  }

  const textArg = ctx.match; // Mengambil teks setelah perintah /kabehan
  const chatId = ctx.chat.id;

  // Ambil semua member grup ini dari Supabase
  const { data: members, error } = await supabase
    .from("group_members")
    .select("*")
    .eq("chat_id", chatId);

  if (error || !members || members.length === 0) {
    return ctx.reply("Gagal mengambil data member atau database kosong.");
  }

  let mentionText = "";
  
  // Format teks tambahan menjadi QUOTE menggunakan HTML (<blockquote>)
  if (textArg) {
    mentionText += `<blockquote>${textArg}</blockquote>\n\n`;
  }

  // Gabungkan tag dengan emoji random
  members.forEach((member) => {
    const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    mentionText += `<a href="tg://user?id=${member.user_id}">${randomEmoji}</a> `;
  });

  // Kirim pesan dengan parsing HTML agar tag & quote berfungsi
  await ctx.reply(mentionText, { parse_mode: "HTML" });
});

// ==========================================
// PERINTAH 2: /inti (Tag Semua Admin)
// ==========================================
bot.command("inti", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) {
    return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh Owner bot!");
  }

  const textArg = ctx.match;
  
  try {
    // Mengambil daftar admin langsung lewat API Telegram
    const administrators = await ctx.getChatAdministrators();
    
    let mentionText = "";
    
    // Format teks tambahan menjadi QUOTE
    if (textArg) {
      mentionText += `<blockquote>${textArg}</blockquote>\n\n`;
    }

    // Gabungkan tag admin dengan emoji random
    administrators.forEach((admin) => {
      const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      mentionText += `<a href="tg://user?id=${admin.user.id}">${randomEmoji}</a> `;
    });

    await ctx.reply(mentionText, { parse_mode: "HTML" });
  } catch (err) {
    console.error(err);
    await ctx.reply("Gagal mengambil daftar admin grup.");
  }
});

// Handler untuk Vercel Serverless
export default webhookCallback(bot, "http");