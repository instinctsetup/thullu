# ♠ THULLU — Upgraded Edition

A real-time, 4-player card-elimination game in the browser, now with **game-theory AI opponents**, a full redesign, and a polished game experience.

## ▶ Play live: [thullu-8e7a0.web.app](https://thullu-8e7a0.web.app)

> Upgraded edition of [ursthakurmahesh/A-four-player-card-game](https://github.com/ursthakurmahesh/A-four-player-card-game) by Mahesh Thakur & Aakash Kushwaha. Original rules and core engine (`core_engine_logic/logics.cpp`) are unchanged.

## What's new in this edition

- **AI players (the README's planned "ML with game theory" feature).** Empty seats are filled automatically — play solo vs 3 AI, or with any mix of 1–4 humans. The bot engine (`ThulluBot` in `public/app.js`) reasons over public information only:
  - **Card counting** from the room's public move log.
  - **Void-suit inference**: a player who fails to follow suit is provably void; the bot tracks every inferred void.
  - **Risk estimation**: when a player still to act is known/expected void in the lead suit, the bot ducks instead of sitting on the highest card (that's how you eat a THULLU pickup); when the trick is safe it wins as cheaply as possible to burn cards; when void itself it dumps high cards from its shortest suit to manufacture future voids.
- **Bot takeover + rejoin**: if a human disconnects mid-game, an AI quietly plays their seat, and they can rejoin with the room code + name to take it back.
- **Full experience redesign** (UI by Claude `claude-sonnet-5-high`): casino-felt theme, card animations, synthesized sound effects with mute, scoreboard, trick summaries, settings (sound / animations / theme), and a mobile-friendly layout.
- **Security**: anonymous Firebase Auth + locked Realtime Database rules (auth required, schema-validated) instead of the original open test-mode rules.

## Play

Hosted on Firebase (Spark, free tier): **https://thullu-8e7a0.web.app**

## Rules (unchanged)

1. Exactly 4 seats; 13 cards each from a 52-card deck.
2. Ace (high) > K > Q > J > 10 … 2.
3. **A♠ opens Round 1.**
4. Follow the lead suit if you can.
5. If everyone follows, cards burn and the highest lead-suit card leads next.
6. **THULLU**: if you can't follow suit, play anything — the highest lead-suit card picks up ALL table cards.
7. **Rule 10 (Last Stand)**: empty hand but you lead the next trick? Draw a random card from the player with the most cards.
8. 15-second blitz timer auto-plays a legal card.
9. Round 1 grace: a Round 1 THULLU discards safely.
10. First two to empty their hands take Rank 1 and Rank 2 — game over.

## Stack

- Vanilla JS (ES modules), HTML, CSS — no framework, no build step.
- Firebase Realtime Database (room sync), Firebase Auth (anonymous), Firebase Hosting.

## Run locally

```bash
cd public
python3 -m http.server 8000   # ES modules need HTTP, not file://
```

## Deploy

```bash
firebase login
firebase use thullu-8e7a0     # or your own project: update public/app.js firebaseConfig + .firebaserc
firebase deploy               # hosting + database rules
```

## Credits

- Original game design, C++ engine and first JS port: **Mahesh Thakur** & **Aakash Kushwaha**.
- Upgrade (UI redesign, AI engine, security hardening, deployment): built with Claude.
