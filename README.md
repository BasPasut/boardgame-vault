# BoardgameVault

**BoardgameVault** brings physical board games online — create a session, share a link, and play with friends anywhere. No expensive boxes required.

🌐 **Live:** [boardgame-vault.vercel.app](https://boardgame-vault.vercel.app)

## Games

| Game | Players | Status |
|------|---------|--------|
| Shadows Over Thornwick | 5–15 | ✅ Available |
| Hues & Cues | 3–10 | ✅ Available |
| Werewolf | 6–20 | 🔜 Coming Soon |
| Secret Hitler | 5–10 | 🔜 Coming Soon |

## Tech Stack

- **Framework**: Next.js (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 — dark gothic theme
- **Database & Realtime**: Supabase (Postgres + Realtime subscriptions)
- **Hosting**: Vercel
- **i18n**: Manual `{en, th}` objects throughout (English + Thai)

## Architecture

```
app/
  page.tsx                    # Landing page with game cards
  session/
    create/page.tsx           # Create a new game session
    [code]/
      page.tsx                # Session room (lobby → game phases)
      HnCPlaying.tsx          # Hues & Cues game component
  guide/
    [gameId]/page.tsx         # How-to-play guide per game

lib/
  supabase.ts                 # Supabase client
  hooks/
    useAmbientAudio.ts        # Ambient audio with crossfade
  utils/
    lang.ts                   # Language persistence
    session.ts                # Code + player ID generation
  games/
    shadows-over-thornwick/   # SoT roles, scripts, logic
    hues-and-cues/
      colors.ts               # 30×16 grid color math + scoring

public/
  audio/                      # ambient-lobby.mp3, ambient-day.mp3, ambient-night.mp3
  images/
    games/                    # Per-game cover art
    platform/                 # Background images
```

## Database Schema

### `sessions`
| Column | Type | Description |
|--------|------|-------------|
| `code` | text (PK) | 6-char room code |
| `game_id` | text | `shadows-over-thornwick` or `hues-and-cues` |
| `phase` | text | `lobby` → game phases → `ended` |
| `game_state` | jsonb | Game-specific state object |
| `created_at` | timestamptz | Auto-cleanup after 24h |

### `players`
| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `session_code` | text (FK) | References sessions |
| `name` | text | Display name |
| `player_state` | jsonb | `{ is_alive, is_storyteller }` |

### `messages`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto |
| `session_code` | text | Room |
| `from_id` | text | Sender player ID |
| `to_id` | text | Recipient player ID |
| `body` | text | Message content |

## Games in Detail

### Shadows Over Thornwick
Social deduction. One Storyteller runs the game. Players are divided into Good (Townsfolk, Outsiders) and Evil (Minions, Demon). The village must execute the Demon before it kills everyone.

**Phases:** `lobby → role-reveal → day ⟷ night → ended`

### Hues & Cues
Color-guessing game on a 30×16 grid. Each round one player (Cue Giver) sees a target color and describes it in 1–2 words. Everyone else places a pin on their best guess.

**Scoring:** Bullseye = 3pts · Ring 1 (d≤2) = 2pts · Ring 2 (d≤4) = 1pt · Cue Giver earns 1pt per guesser in Ring 1 or 2. First to the score goal wins.

## Development

```bash
npm install
npm run dev
```

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Design Language

- **Colors**: Deep navy `#0d0a1a` · Gold `#d4af37` · Parchment `#e8d5b0`
- **Typography**: Gothic serif for headings, monospace for codes
- **Motif**: Gothic grimoire — vault doors, candlelight, fog, runes
- **Audio**: Crossfading ambient tracks per game phase (lobby / day / night)
