# FiveM RP Discord Bot

Discord bot pro správu **AllowListu**, **BlackListu** a **Discord banů** pro FiveM RP server.
Postavený jako Discord Interactions (HTTP webhook) bot bez potřeby běžícího procesu 24/7 - hostuje se
na Vercelu jako serverless funkce. Data (AllowList/BlackList) se ukládají do **Vercel KV** (Redis).

> Propojení s FiveM/ESX serverem (aby se AllowList/BlackList reálně projevil ve hře) zatím není
> součástí - bot zatím jen spravuje data na Discord straně. Až budeš chtít, doděláme např. endpoint,
> na který se FiveM server bude ptát při připojení hráče.

## Příkazy

| Příkaz | Kdo může | Co dělá |
|---|---|---|
| `/allowlist-add user` | role `ALLOWLIST_ROLE_ID` | přidá hráče na AllowList |
| `/allowlist-remove user` | role `ALLOWLIST_ROLE_ID` | odebere hráče z AllowListu |
| `/allowlist-list` | role `ALLOWLIST_ROLE_ID` | vypíše celý AllowList |
| `/allowlist-check user` | role `ALLOWLIST_ROLE_ID` | zkontroluje, jestli tam hráč je |
| `/blacklist-add user reason` | role `BLACKLIST_ROLE_ID` | přidá hráče na BlackList i s důvodem |
| `/blacklist-remove user` | role `BLACKLIST_ROLE_ID` | odebere hráče z BlackListu |
| `/blacklist-list` | role `BLACKLIST_ROLE_ID` | vypíše celý BlackList i s důvody |
| `/blacklist-check user` | role `BLACKLIST_ROLE_ID` | zkontroluje, jestli tam hráč je |
| `/ban user reason [delete_days]` | role `BLACKLIST_ROLE_ID` | zabanuje hráče přímo z Discord serveru |

Všechny akce se (pokud nastavíš `LOG_WEBHOOK_URL`) zalogují do zvoleného kanálu formou embedu.

## 1. Založení Discord aplikace

1. Jdi na https://discord.com/developers/applications -> **New Application**.
2. V sekci **General Information** si zkopíruj:
   - **Application ID** -> `DISCORD_APPLICATION_ID`
   - **Public Key** -> `DISCORD_PUBLIC_KEY`
3. V sekci **Bot**:
   - Klikni **Reset Token** a zkopíruj token -> `DISCORD_BOT_TOKEN`
   - Zapni **Server Members Intent** (kvůli rolím) pokud to Discord vyžaduje.
4. V sekci **OAuth2 -> URL Generator** zaškrtni scope `bot` a `applications.commands`,
   u bota zaškrtni permission `Ban Members`. Vygenerovaný link použij pro pozvání bota na server.
5. Zjisti **ID serveru (guild)** - v Discordu zapni Developer Mode (Nastavení -> Pokročilé),
   pak klikni pravým na server -> Copy Server ID -> `GUILD_ID`.
6. Zjisti **ID rolí** stejným způsobem (pravý klik na roli v nastavení serveru) ->
   `ALLOWLIST_ROLE_ID`, `BLACKLIST_ROLE_ID`.

## 2. Nasazení na Vercel

1. Nahraj tuto složku do vlastního GitHub repozitáře.
2. Na https://vercel.com -> **Add New Project** -> vyber svůj repozitář -> Deploy.
3. V nastavení projektu (**Settings -> Environment Variables**) přidej všechny proměnné
   z `.env.example` (kromě `KV_REST_API_URL` a `KV_REST_API_TOKEN` - ty přidáš v dalším kroku).
4. **Settings -> Storage -> Create Database -> KV** (Upstash Redis) a propoj ji s projektem -
   `KV_REST_API_URL` a `KV_REST_API_TOKEN` se doplní automaticky.
5. Po nasazení zkopíruj URL tvého projektu, např. `https://tvuj-bot.vercel.app`.

## 3. Nastavení Interactions Endpoint URL

1. Zpět v Discord Developer Portal -> **General Information** -> **Interactions Endpoint URL**
   nastav na: `https://tvuj-bot.vercel.app/api/interactions`
2. Discord si endpoint hned po uložení ověří (pošle PING) - pokud je vše nasazené správně, uloží se to bez chyby.

## 4. Registrace slash příkazů

Lokálně u sebe v projektu:

```bash
npm install
cp .env.example .env
# vyplň .env (stačí DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, GUILD_ID)
npm run register
```

Příkazy se objeví na serveru prakticky okamžitě (registrace je per-guild, ne globální).

## 5. Použití

Přiřaď rolím `ALLOWLIST_ROLE_ID` a `BLACKLIST_ROLE_ID` lidi, kteří mají mít přístup, a příkazy
už jim naskočí v Discordu (jinak dostanou zprávu "Na tento příkaz nemáš oprávnění").

---

### Poznámky k rozšíření (až budeš chtít)

- **Propojení s FiveM serverem:** nejjednodušší cesta je přidat do `api/interactions.js` další
  endpoint (např. `api/check.js`), na který se přes HTTP zeptá tvůj Lua resource při připojení
  hráče (`GET /api/check?discordId=...`), a bot mu vrátí, jestli je na AllowListu/BlackListu.
  Vyžaduje to ale propojit Discord účet s FiveM identifikátorem (typicky přes Discord OAuth
  nebo ruční párování v databázi).
- **Další příkazy:** stačí přidat nový handler do `COMMAND_HANDLERS` v `api/interactions.js`
  a definici příkazu do `register-commands.js`.
