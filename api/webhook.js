import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { createClient } from "@supabase/supabase-js";

// Inisialisasi Bot dan Supabase
const bot = new Bot(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ID Telegram Kamu (Owner Bot)
const OWNER_ID = 1382446968; 

// Kumpulan emoji random untuk menyamarkan tag
const EMOJIS = ["🔥", "✨", "🌟", "📢", "🎮", "🚀", "👾", "🦊", "⚡", "🐧"];

// ====================================================================
// MIDDLEWARE VALIDASI & CONVERSATION FLOW (MENANGKAP INPUT STEP)
// ====================================================================
bot.on("message", async (ctx, next) => {
  const chatId = ctx.chat.id;
  const from = ctx.from;
  const userId = from.id;

  // HANDLE PRIVATE CHAT FLOW (Untuk Tambah Grup Step-by-Step)
  if (ctx.chat.type === "private" && userId === OWNER_ID) {
    // Cek apakah Owner sedang dalam proses input data
    const { data: session } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (session) {
      const textInput = ctx.message.text;

      // STEP 1: Menangkap ID Grup, lalu lanjut minta ID Owner
      if (session.step === "wait_group_id") {
        const targetChatId = parseInt(textInput);
        if (isNaN(targetChatId)) {
          return ctx.reply("❌ ID Grup harus berupa angka! Silakan masukkan ulang ID Grup:");
        }

        // Simpan ID Grup sementara ke session, naikkan ke step berikutnya
        await supabase
          .from("bot_sessions")
          .update({ step: "wait_owner_id", temp_chat_id: targetChatId })
          .eq("user_id", userId);

        return ctx.reply("👉 **Step 2:** Sekarang masukkan **ID Owner** untuk grup tersebut:");
      }

      // STEP 2: Menangkap ID Owner, lalu simpan semuanya ke registered_groups
      if (session.step === "wait_owner_id") {
        const targetOwnerId = parseInt(textInput);
        if (isNaN(targetOwnerId)) {
          return ctx.reply("❌ ID Owner harus berupa angka! Silakan masukkan ulang ID Owner:");
        }

        const groupChatId = session.temp_chat_id;

        // Coba dapatkan nama grup dari Telegram API secara otomatis agar dinamis
        let groupName = `Grup ${groupChatId}`;
        try {
          const chatInfo = await ctx.api.getChat(groupChatId);
          if (chatInfo.title) groupName = chatInfo.title;
        } catch (e) {
          // Tetap lanjut menggunakan nama default jika bot belum dimasukkan ke grup tersebut
        }

        // Insert ke tabel registered_groups
        await supabase.from("registered_groups").upsert({
          chat_id: groupChatId,
          group_name: groupName,
          owner_group_id: targetOwnerId
        });

        // Hapus session karena flow sudah selesai
        await supabase.from("bot_sessions").delete().eq("user_id", userId);

        return ctx.reply(`✅ **Berhasil Terdaftar!**\n\n📌 **Nama:** ${groupName}\n🆔 **ID Grup:** \`${groupChatId}\`\n👑 **ID Owner:** \`${targetOwnerId}\``, { parse_mode: "Markdown" });
      }
    }
  }

  // VALIDASI WHITELIST DI DALAM GRUP
  if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
    const { data: group } = await supabase
      .from("registered_groups")
      .select("*")
      .eq("chat_id", chatId)
      .single();

    if (!group) return; // Silent mode jika grup tidak terdaftar

    await supabase.from("group_members").upsert({
      user_id: from.id,
      username: from.username || null,
      first_name: from.first_name,
      chat_id: chatId
    });
  }
  return next();
});

// ====================================================================
// FITUR 1: PERINTAH /start (Private Chat Only)
// ====================================================================
bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;

  const userId = ctx.from.id;

  // Hapus sisa-sisa session lama jika ada agar reset kembali
  await supabase.from("bot_sessions").delete().eq("user_id", userId);

  if (userId === OWNER_ID) {
    const keyboard = new InlineKeyboard()
      .text("➕ Tambah Grup", "add_group")
      .text("❌ Hapus Grup", "list_delete_group");

    await ctx.reply(
      "hi owner ganteng 😎, mau ngapain nih skrg?\n\nGunakan tombol di bawah untuk mengontrol whitelist grup.",
      { reply_markup: keyboard }
    );
  } else {
    await ctx.reply("anda ingin menambahkan bot ? info : @arikamukunaon");
  }
});

// ====================================================================
// FITUR 2: PERINTAH /setting
// ====================================================================
bot.command("setting", async (ctx) => {
  const userId = ctx.from.id;

  // 1. Jika diketik oleh KAMU (Owner Bot)
  if (userId === OWNER_ID) {
    const { data: groups } = await supabase.from("registered_groups").select("*");
    
    if (!groups || groups.length === 0) {
      return ctx.reply("Belum ada grup yang didaftarkan di database.");
    }

    const keyboard = new InlineKeyboard();
    groups.forEach((g) => {
      keyboard.text(g.group_name || `Grup ${g.chat_id}`, `manage_group:${g.chat_id}`).row();
    });

    return ctx.reply("🔧 **Owner Dashboard**\nPilih grup yang ingin dikelola permission-nya:", {
      reply_markup: keyboard,
      parse_mode: "Markdown"
    });
  }

  // 2. Jika diketik oleh Owner Grup yang sudah terdaftar
  const { data: ownedGroups } = await supabase
    .from("registered_groups")
    .select("*")
    .eq("owner_group_id", userId);

  if (ownedGroups && ownedGroups.length > 0) {
    const keyboard = new InlineKeyboard();
    ownedGroups.forEach((g) => {
      keyboard.text(g.group_name || `Grup ${g.chat_id}`, `manage_group:${g.chat_id}`).row();
    });

    return ctx.reply("🔧 **Grup Dashboard**\nPilih grup Anda untuk mengatur akses admin:", {
      reply_markup: keyboard,
      parse_mode: "Markdown"
    });
  }

  // 3. Jika diketik oleh user biasa / belum terdaftar
  return ctx.reply(
    "anda belum mendaftarkan grup anda kirim id grup dan id anda ke owner bot nya @arikamukunaon"
  );
});

// ====================================================================
// LOGIC TOMBOL NAVIGASI (CALLBACK QUERIES)
// ====================================================================
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  // --- Opsi Owner: Memulai Flow Tambah Grup ---
  if (data === "add_group" && userId === OWNER_ID) {
    await ctx.answerCallbackQuery();
    
    // Set status session awal ke 'wait_group_id'
    await supabase.from("bot_sessions").upsert({
      user_id: userId,
      step: "wait_group_id"
    });

    return ctx.reply("👉 **Step 1:** Silakan masukkan **ID Grup** yang ingin kamu daftarkan:");
  }

  // --- Opsi Owner: List Hapus Grup ---
  if (data === "list_delete_group" && userId === OWNER_ID) {
    await ctx.answerCallbackQuery();
    const { data: groups } = await supabase.from("registered_groups").select("*");
    
    if (!groups || groups.length === 0) {
      return ctx.editMessageText("Tidak ada grup untuk dihapus.");
    }

    const keyboard = new InlineKeyboard();
    groups.forEach((g) => {
      keyboard.text(`🗑️ ${g.group_name || g.chat_id}`, `delete_g:${g.chat_id}`).row();
    });
    keyboard.text("⬅️ Kembali", "back_to_start");

    return ctx.editMessageText("Pilih grup yang ingin dihapus dari sistem whitelist:", { reply_markup: keyboard });
  }

  // Eksekusi Hapus Grup
  if (data.startsWith("delete_g:") && userId === OWNER_ID) {
    await ctx.answerCallbackQuery();
    const targetChatId = data.split(":")[1];
    
    await supabase.from("registered_groups").delete().eq("chat_id", targetChatId);
    await supabase.from("allowed_admins").delete().eq("chat_id", targetChatId);
    
    return ctx.editMessageText("✅ Grup berhasil dihapus dari sistem whitelist!");
  }

  // Kembali ke menu start awal
  if (data === "back_to_start" && userId === OWNER_ID) {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("➕ Tambah Grup", "add_group").text("❌ Hapus Grup", "list_delete_group");
    return ctx.editMessageText("hi owner ganteng 😎, mau ngapain nih skrg?", { reply_markup: keyboard });
  }

  // --- Menu Manajemen Grup ---
  if (data.startsWith("manage_group:")) {
    await ctx.answerCallbackQuery();
    const targetChatId = data.split(":")[1];

    const { data: group } = await supabase.from("registered_groups").select("*").eq("chat_id", targetChatId).single();
    if (!group || (userId !== OWNER_ID && group.owner_group_id !== userId)) {
      return ctx.reply("Anda tidak memiliki akses ke menu grup ini.");
    }

    const keyboard = new InlineKeyboard().text("🔑 Beri Izin Admin", `grant_admin_list:${targetChatId}`);
    return ctx.editMessageText(`Kelola Group: *${group.group_name}*\nID: \`${targetChatId}\``, {
      reply_markup: keyboard,
      parse_mode: "Markdown"
    });
  }

  // --- Tampilan List Semua Admin Grup ---
  if (data.startsWith("grant_admin_list:")) {
    await ctx.answerCallbackQuery();
    const targetChatId = data.split(":")[1];

    try {
      const admins = await ctx.api.getChatAdministrators(targetChatId);
      const { data: allowed } = await supabase.from("allowed_admins").select("user_id").eq("chat_id", targetChatId);
      const allowedIds = allowed ? allowed.map(a => a.user_id) : [];

      const keyboard = new InlineKeyboard();
      admins.forEach((adm) => {
        if (adm.user.is_bot) return;
        const isAllowed = allowedIds.includes(adm.user.id);
        const statusCheck = isAllowed ? "✅" : "❌";
        keyboard.text(`${statusCheck} ${adm.user.first_name}`, `toggle_admin:${targetChatId}:${adm.user.id}`).row();
      });

      return ctx.editMessageText("Klik nama admin di bawah untuk memberi akses (✅) atau mencabut akses (❌) bot tag:", {
        reply_markup: keyboard
      });
    } catch (err) {
      return ctx.reply("Gagal mengambil daftar admin. Pastikan bot terpasang di grup tersebut sebagai Admin.");
    }
  }

  // --- Toggle Izin Admin ---
  if (data.startsWith("toggle_admin:")) {
    await ctx.answerCallbackQuery();
    const [_, targetChatId, targetUserId] = data.split(":");

    const { data: exist } = await supabase
      .from("allowed_admins")
      .select("*")
      .eq("chat_id", targetChatId)
      .eq("user_id", targetUserId)
      .single();

    if (exist) {
      await supabase.from("allowed_admins").delete().eq("chat_id", targetChatId).eq("user_id", targetUserId);
    } else {
      await supabase.from("allowed_admins").insert({ chat_id: targetChatId, user_id: targetUserId });
    }

    const admins = await ctx.api.getChatAdministrators(targetChatId);
    const { data: allowed } = await supabase.from("allowed_admins").select("user_id").eq("chat_id", targetChatId);
    const allowedIds = allowed ? allowed.map(a => a.user_id) : [];

    const keyboard = new InlineKeyboard();
    admins.forEach((adm) => {
      if (adm.user.is_bot) return;
      const isAllowed = allowedIds.includes(adm.user.id);
      const statusCheck = isAllowed ? "✅" : "❌";
      keyboard.text(`${statusCheck} ${adm.user.first_name}`, `toggle_admin:${targetChatId}:${adm.user.id}`).row();
    });

    return ctx.editMessageText("Klik nama admin di bawah untuk memberi akses (✅) atau mencabut akses (❌) bot tag:", {
      reply_markup: keyboard
    });
  }
});

// ====================================================================
// LOGIC PENGECEKAN HAK AKSES PERINTAH TAG
// ====================================================================
const hasTagAccess = async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  if (userId === OWNER_ID) return true;

  const { data: group } = await supabase.from("registered_groups").select("owner_group_id").eq("chat_id", chatId).single();
  if (group && group.owner_group_id === userId) return true;

  const { data: allowedAdmin } = await supabase
    .from("allowed_admins")
    .select("*")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .single();
    
  if (allowedAdmin) return true;
  return false;
};

bot.command("kabehan", async (ctx) => {
  if (!(await hasTagAccess(ctx))) {
    return ctx.reply("❌ Anda tidak memiliki izin untuk menggunakan perintah tag di grup ini!");
  }

  const textArg = ctx.match;
  const chatId = ctx.chat.id;

  const { data: members, error } = await supabase.from("group_members").select("*").eq("chat_id", chatId);
  if (error || !members || members.length === 0) return ctx.reply("Gagal mengambil data member atau database kosong.");

  let mentionText = textArg ? `<blockquote>${textArg}</blockquote>\n\n` : "";
  members.forEach((member) => {
    const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    mentionText += `<a href="tg://user?id=${member.user_id}">${randomEmoji}</a> `;
  });

  await ctx.reply(mentionText, { parse_mode: "HTML" });
});

bot.command("inti", async (ctx) => {
  if (!(await hasTagAccess(ctx))) {
    return ctx.reply("❌ Anda tidak memiliki izin untuk menggunakan perintah tag di grup ini!");
  }

  const textArg = ctx.match;
  try {
    const administrators = await ctx.getChatAdministrators();
    let mentionText = textArg ? `<blockquote>${textArg}</blockquote>\n\n` : "";
    
    administrators.forEach((admin) => {
      const randomEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      mentionText += `<a href="tg://user?id=${admin.user.id}">${randomEmoji}</a> `;
    });
    
    await ctx.reply(mentionText, { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply("Gagal mengambil daftar admin grup.");
  }
});

// Vercel Serverless Webhook Export Handler
const handleWebhook = webhookCallback(bot, "http");
export default async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("Bot is running safely!");
  }
  return handleWebhook(req, res);
};