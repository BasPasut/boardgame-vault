# BoardgameVault

Turn your physical board games into online sessions. Create a room, share the code, and play with friends anywhere — no expensive physical sets required.

🌐 **Live:** [boardgame-vault.vercel.app](https://boardgame-vault.vercel.app)

---

## Games

| Game | Status | Players |
|------|--------|---------|
| Shadows Over Thornwick | ✅ Available | 5–15 |
| Werewolf | 🔜 Coming Soon | 6–20 |
| Secret Hitler | 🔜 Coming Soon | 5–10 |

---

## How to Play

1. **Create a room** — pick a game, enter your name as Storyteller, get a 6-digit code
2. **Share the code** — friends open the site and type the code to join
3. **Start the game** — Storyteller assigns roles, runs day/night phases
4. All game state syncs in real-time across every device

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 — gothic dark theme |
| Real-time | Supabase Postgres + Realtime subscriptions |
| i18n | English + Thai (manual `{en, th}` toggle) |
| Fonts | Cinzel (headings) + Inter (body) |
| Deploy | Vercel |

---

## Project Structure

```
app/
  page.tsx                  # Landing page
  session/
    create/page.tsx         # Create room flow
    [code]/page.tsx         # Live game session (real-time)

lib/
  supabase.ts               # Supabase client
  games/
    shadows-over-thornwick/ # Role definitions, scripts, role-count table
  utils/
    session.ts              # Code + player ID generators

types/
  game.ts                   # Shared TypeScript types

public/images/
  platform/                 # Landing, vault door, create session backgrounds
  games/shadows-over-thornwick/
    roles/                  # 22 role card images
```

---

## Database Schema (Supabase)

```sql
-- One row per active game room
sessions (
  code        varchar(6)  -- room code, e.g. "A3K9PX"
  game_id     text        -- e.g. "shadows-over-thornwick"
  phase       text        -- lobby | role-reveal | day | night | ended
  game_state  jsonb       -- all game-specific state (roles, day, night index…)
  created_at  timestamptz
)

-- One row per player in a room
players (
  id           text
  session_code varchar(6)
  name         text
  player_state jsonb       -- { is_alive, is_storyteller } — extensible per game
  joined_at    timestamptz
)
```

`game_state` and `player_state` are JSONB so adding a new game requires no schema changes — each game defines its own state shape in code.

---

## Local Development

Requires **Node.js v20+**.

```bash
npm install
npm run dev
```

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploying

1. Push to GitHub
2. Import repo on [Vercel](https://vercel.com)
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel environment variables
4. Deploy — zero config needed for Next.js
