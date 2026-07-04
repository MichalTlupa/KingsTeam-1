/**
 * FiveM RP Discord Bot - hlavní handler (Discord Interactions / HTTP webhook)
 * Hostováno na Vercelu. Veškerá logika záměrně v jednom souboru.
 *
 * Příkazy:
 *  /allowlist-add    user  [role: ALLOWLIST_ROLE_ID]
 *  /allowlist-remove user  [role: ALLOWLIST_ROLE_ID]
 *  /allowlist-list         [role: ALLOWLIST_ROLE_ID]
 *  /allowlist-check  user  [role: ALLOWLIST_ROLE_ID]
 *  /blacklist-add    user reason  [role: BLACKLIST_ROLE_ID]
 *  /blacklist-remove user  [role: BLACKLIST_ROLE_ID]
 *  /blacklist-list         [role: BLACKLIST_ROLE_ID]
 *  /blacklist-check  user  [role: BLACKLIST_ROLE_ID]
 *  /ban              user reason [delete_days]  [role: BLACKLIST_ROLE_ID]
 *
 * Potřebné ENV proměnné (nastavit ve Vercel projektu):
 *  DISCORD_PUBLIC_KEY      - Public Key aplikace (Discord Developer Portal)
 *  DISCORD_BOT_TOKEN       - Token bota (pro volání Discord REST API - ban, atd.)
 *  ALLOWLIST_ROLE_ID       - ID role, která smí spravovat AllowList
 *  BLACKLIST_ROLE_ID       - ID role, která smí spravovat BlackList a Ban
 *  LOG_WEBHOOK_URL         - (volitelné) webhook URL kam se logují všechny akce
 *  KV_REST_API_URL         - doplní Vercel automaticky při propojení KV storu
 *  KV_REST_API_TOKEN       - doplní Vercel automaticky při propojení KV storu
 */

const { verifyKey, InteractionType, InteractionResponseType } = require('discord-interactions');
const { kv } = require('@vercel/kv');

// Vercel: potřebujeme RAW tělo requestu kvůli ověření podpisu -> vypnout auto body parsing
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWLIST_ROLE_ID = process.env.ALLOWLIST_ROLE_ID;
const BLACKLIST_ROLE_ID = process.env.BLACKLIST_ROLE_ID;
const LOG_WEBHOOK_URL = process.env.LOG_WEBHOOK_URL;
const DISCORD_API = 'https://discord.com/api/v10';

const KV_ALLOWLIST_SET = 'allowlist';
const KV_BLACKLIST_HASH = 'blacklist';

// ---------- Pomocné funkce ----------

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function getOption(interaction, name) {
  const opt = (interaction.data.options || []).find((o) => o.name === name);
  return opt ? opt.value : undefined;
}

function getTargetUser(interaction, optionName = 'user') {
  const userId = getOption(interaction, optionName);
  if (!userId) return null;
  const resolved = interaction.data.resolved || {};
  const user = resolved.users ? resolved.users[userId] : null;
  const member = resolved.members ? resolved.members[userId] : null;
  return {
    id: userId,
    username: user ? (user.global_name || user.username) : userId,
    tag: user ? `${user.username}` : userId,
    member,
  };
}

function hasRole(interaction, roleId) {
  if (!roleId) return false; // pokud role není nastavená v ENV, radši nikoho nepustit
  const roles = (interaction.member && interaction.member.roles) || [];
  return roles.includes(roleId);
}

function reply(content, ephemeral = true) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? 64 : undefined,
    },
  };
}

function noPermission() {
  return reply('⛔ Na tento příkaz nemáš oprávnění.');
}

async function sendLog(title, description, color = 0xd4af37) {
  if (!LOG_WEBHOOK_URL) return;
  try {
    await fetch(LOG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Log webhook selhal:', err);
  }
}

function actorTag(interaction) {
  const u = interaction.member?.user || interaction.user;
  return u ? `${u.username} (${u.id})` : 'neznámý';
}

// ---------- Handlery jednotlivých příkazů ----------

async function handleAllowlistAdd(interaction) {
  if (!hasRole(interaction, ALLOWLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');

  await kv.sadd(KV_ALLOWLIST_SET, target.id);
  await sendLog(
    '✅ AllowList - přidán hráč',
    `**Hráč:** <@${target.id}> (${target.id})\n**Přidal:** ${actorTag(interaction)}`,
    0x2ecc71
  );
  return reply(`✅ Uživatel <@${target.id}> byl přidán na **AllowList**.`);
}

async function handleAllowlistRemove(interaction) {
  if (!hasRole(interaction, ALLOWLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');

  const removed = await kv.srem(KV_ALLOWLIST_SET, target.id);
  if (!removed) return reply(`ℹ️ Uživatel <@${target.id}> na AllowListu nebyl.`);

  await sendLog(
    '🗑️ AllowList - odebrán hráč',
    `**Hráč:** <@${target.id}> (${target.id})\n**Odebral:** ${actorTag(interaction)}`,
    0xe67e22
  );
  return reply(`🗑️ Uživatel <@${target.id}> byl odebrán z **AllowListu**.`);
}

async function handleAllowlistList(interaction) {
  if (!hasRole(interaction, ALLOWLIST_ROLE_ID)) return noPermission();
  const members = await kv.smembers(KV_ALLOWLIST_SET);
  if (!members || members.length === 0) return reply('📋 AllowList je momentálně prázdný.');
  const list = members.map((id) => `• <@${id}>`).join('\n');
  return reply(`📋 **AllowList (${members.length}):**\n${list}`);
}

async function handleAllowlistCheck(interaction) {
  if (!hasRole(interaction, ALLOWLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');
  const isMember = await kv.sismember(KV_ALLOWLIST_SET, target.id);
  return reply(isMember ? `✅ <@${target.id}> JE na AllowListu.` : `❌ <@${target.id}> NENÍ na AllowListu.`);
}

async function handleBlacklistAdd(interaction) {
  if (!hasRole(interaction, BLACKLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');
  const reason = getOption(interaction, 'reason') || 'Nebyl uveden důvod';

  const entry = {
    reason,
    addedBy: actorTag(interaction),
    addedAt: new Date().toISOString(),
  };
  await kv.hset(KV_BLACKLIST_HASH, { [target.id]: JSON.stringify(entry) });

  await sendLog(
    '⛔ BlackList - přidán hráč',
    `**Hráč:** <@${target.id}> (${target.id})\n**Důvod:** ${reason}\n**Přidal:** ${actorTag(interaction)}`,
    0xe74c3c
  );
  return reply(`⛔ Uživatel <@${target.id}> byl přidán na **BlackList**.\n**Důvod:** ${reason}`);
}

async function handleBlacklistRemove(interaction) {
  if (!hasRole(interaction, BLACKLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');

  const removed = await kv.hdel(KV_BLACKLIST_HASH, target.id);
  if (!removed) return reply(`ℹ️ Uživatel <@${target.id}> na BlackListu nebyl.`);

  await sendLog(
    '🗑️ BlackList - odebrán hráč',
    `**Hráč:** <@${target.id}> (${target.id})\n**Odebral:** ${actorTag(interaction)}`,
    0xe67e22
  );
  return reply(`🗑️ Uživatel <@${target.id}> byl odebrán z **BlackListu**.`);
}

async function handleBlacklistList(interaction) {
  if (!hasRole(interaction, BLACKLIST_ROLE_ID)) return noPermission();
  const all = await kv.hgetall(KV_BLACKLIST_HASH);
  const ids = all ? Object.keys(all) : [];
  if (ids.length === 0) return reply('📋 BlackList je momentálně prázdný.');

  const list = ids
    .map((id) => {
      let data = {};
      try {
        data = JSON.parse(all[id]);
      } catch (_) {}
      return `• <@${id}> — ${data.reason || 'bez důvodu'}`;
    })
    .join('\n');
  return reply(`📋 **BlackList (${ids.length}):**\n${list}`);
}

async function handleBlacklistCheck(interaction) {
  if (!hasRole(interaction, BLACKLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');
  const raw = await kv.hget(KV_BLACKLIST_HASH, target.id);
  if (!raw) return reply(`✅ <@${target.id}> NENÍ na BlackListu.`);
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch (_) {}
  return reply(
    `⛔ <@${target.id}> JE na BlackListu.\n**Důvod:** ${data.reason || 'neuveden'}\n**Přidal:** ${data.addedBy || '?'}`
  );
}

async function handleBan(interaction) {
  if (!hasRole(interaction, BLACKLIST_ROLE_ID)) return noPermission();
  const target = getTargetUser(interaction);
  if (!target) return reply('❌ Musíš zadat uživatele.');
  const reason = getOption(interaction, 'reason') || 'Nebyl uveden důvod';
  const deleteDays = getOption(interaction, 'delete_days') || 0;
  const guildId = interaction.guild_id;

  if (!guildId) return reply('❌ Tento příkaz lze použít jen na serveru.');

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/bans/${target.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': encodeURIComponent(reason),
      },
      body: JSON.stringify({
        delete_message_seconds: Math.min(Math.max(Number(deleteDays) || 0, 0), 7) * 86400,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const errText = await res.text();
      console.error('Ban selhal:', res.status, errText);
      return reply(`❌ Ban se nepodařilo provést (Discord vrátil chybu ${res.status}).`);
    }

    await sendLog(
      '🔨 Discord BAN',
      `**Hráč:** <@${target.id}> (${target.id})\n**Důvod:** ${reason}\n**Provedl:** ${actorTag(interaction)}`,
      0x992d22
    );
    return reply(`🔨 Uživatel <@${target.id}> byl **banutý z Discordu**.\n**Důvod:** ${reason}`);
  } catch (err) {
    console.error('Ban error:', err);
    return reply('❌ Nastala chyba při provádění banu.');
  }
}

// ---------- Routing příkazů ----------

const COMMAND_HANDLERS = {
  'allowlist-add': handleAllowlistAdd,
  'allowlist-remove': handleAllowlistRemove,
  'allowlist-list': handleAllowlistList,
  'allowlist-check': handleAllowlistCheck,
  'blacklist-add': handleBlacklistAdd,
  'blacklist-remove': handleBlacklistRemove,
  'blacklist-list': handleBlacklistList,
  'blacklist-check': handleBlacklistCheck,
  ban: handleBan,
};

async function handleCommand(interaction) {
  const name = interaction.data?.name;
  const handler = COMMAND_HANDLERS[name];
  if (!handler) {
    return reply('❌ Neznámý příkaz.');
  }
  try {
    return await handler(interaction);
  } catch (err) {
    console.error(`Chyba v příkazu ${name}:`, err);
    return reply('❌ Nastala neočekávaná chyba, zkus to prosím znovu.');
  }
}

// ---------- Vercel handler (entry point) ----------

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await readRawBody(req);

  const isValid =
    signature &&
    timestamp &&
    verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);

  if (!isValid) {
    res.status(401).send('Bad request signature');
    return;
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    res.status(200).json({ type: InteractionResponseType.PONG });
    return;
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const response = await handleCommand(interaction);
    res.status(200).json(response);
    return;
  }

  res.status(400).send('Unsupported interaction type');
};
