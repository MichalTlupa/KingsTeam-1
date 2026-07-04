require('dotenv').config();

const {
  DISCORD_APPLICATION_ID,
  DISCORD_BOT_TOKEN,
  GUILD_ID,
} = process.env;

if (!DISCORD_APPLICATION_ID || !DISCORD_BOT_TOKEN || !GUILD_ID) {
  console.error('❌ Chybí DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN nebo GUILD_ID v .env souboru.');
  process.exit(1);
}

const userOption = (name, description, required = true) => ({
  type: 6, // USER
  name,
  description,
  required,
});

const stringOption = (name, description, required = true, choices) => ({
  type: 3, // STRING
  name,
  description,
  required,
  ...(choices ? { choices } : {}),
});

const integerOption = (name, description, required = false, min, max) => ({
  type: 4, // INTEGER
  name,
  description,
  required,
  ...(min !== undefined ? { min_value: min } : {}),
  ...(max !== undefined ? { max_value: max } : {}),
});

const commands = [
  {
    name: 'allowlist-add',
    description: 'Přidá hráče na AllowList',
    dm_permission: false,
    options: [userOption('user', 'Discord uživatel, kterého chceš přidat')],
  },
  {
    name: 'allowlist-remove',
    description: 'Odebere hráče z AllowListu',
    dm_permission: false,
    options: [userOption('user', 'Discord uživatel, kterého chceš odebrat')],
  },
  {
    name: 'allowlist-list',
    description: 'Vypíše všechny hráče na AllowListu',
    dm_permission: false,
  },
  {
    name: 'allowlist-check',
    description: 'Zkontroluje, jestli je hráč na AllowListu',
    dm_permission: false,
    options: [userOption('user', 'Discord uživatel, kterého chceš zkontrolovat')],
  },
  {
    name: 'blacklist-add',
    description: 'Přidá hráče na BlackList',
    dm_permission: false,
    options: [
      userOption('user', 'Discord uživatel, kterého chceš přidat'),
      stringOption('reason', 'Důvod přidání na BlackList', false),
    ],
  },
  {
    name: 'blacklist-remove',
    description: 'Odebere hráče z BlackListu',
    dm_permission: false,
    options: [userOption('user', 'Discord uživatel, kterého chceš odebrat')],
  },
  {
    name: 'blacklist-list',
    description: 'Vypíše všechny hráče na BlackListu',
    dm_permission: false,
  },
  {
    name: 'blacklist-check',
    description: 'Zkontroluje, jestli je hráč na BlackListu',
    dm_permission: false,
    options: [userOption('user', 'Discord uživatel, kterého chceš zkontrolovat')],
  },
  {
    name: 'ban',
    description: 'Zabanuje hráče z Discord serveru',
    dm_permission: false,
    options: [
      userOption('user', 'Discord uživatel, kterého chceš banout'),
      stringOption('reason', 'Důvod banu', false),
      integerOption('delete_days', 'Kolik dní zpětně smazat zprávy (0-7)', false, 0, 7),
    ],
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Registrace selhala (${res.status}):`, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✅ Zaregistrováno ${data.length} příkazů pro server ${GUILD_ID}:`);
  data.forEach((cmd) => console.log(`   /${cmd.name}`));
}

registerCommands();
