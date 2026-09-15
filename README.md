<div align="center">

# ♠ THULLU — The Ultimate Card Elimination Arena

*A real-time, 4-player multiplayer version of the card game we've been playing with friends for years — now in a browser.*

</div>

---

## Why this exists

so me and my friends use to play this card game in free time or after having some food so I got an idea why not code it so in my summer vacation of 2026 I though of doing this .

In my mind i planned it completely of how this would be delivered first I wrote down all the rules and everything noted multiple edge cases and all then I wrote the whole core engine logic in C++ using OOPS and DataStructures (why c++ cuz I am pretty comfortable with it so though of doing this) then after it was done I and my friend discussed like how can we deploy this and all and after that we selected firebase and this was my first time working over it so first I tried to understand its few syntaxes instances of its database and all and then me and my friend both worked together in converting the c++ code into Js functions and linking it to the html files and all (this was my first time working on Js so I also got familiar to it a bit)

then using AI we debugged some parts of Js improvised the html and ui feel using CSS and that's it we deployed it on firebase.

---

## What it actually is

A 4-seat, real-time multiplayer trick-taking card game:

- Create a room, share a 6-letter code, 3 friends join.
- Cards are dealt, seating order is randomized, whoever holds the **Ace of Spades** opens Round 1.
- Every move syncs live across all four browsers — no refreshing, no polling, no accounts.
- A 15-second per-turn timer keeps the game moving (auto-plays a legal card if you snooze).
- First two players to empty their hand are ranked 1st and 2nd — game over.

---

## Object Model — C++ Prototype vs JS Port

The C++ prototype (`logics.cpp`) defines the objects. The JS port (`app1.js`) reproduces each one, but since the game state has to be stored in Firebase (which can't hold class instances or pointers), objects became plain JSON and pointers became ID lookups.

### Card

**C++ (class, `logics.cpp`):**
```cpp
class Card {
private:
    int value;    // 2..14  (2=Two ... 11=J, 12=Q, 13=K, 14=Ace)
    string name;  // "Two", "Three", ..., "Ace"
    string suit;  // "Spades" | "Hearts" | "Diamonds" | "Clubs"
public:
    Card(int v, string c, string n);
    int getValue();
    string getSuit();
    void print();
};
```

**JS (plain object, `app1.js`):**
```js
{ value: 14, suit: "Spades", name: "Ace" }
```

### Player

**C++ (class, `logics.cpp`):**
```cpp
class Player {
private:
    string name;
    int colour;        // random 0-3, seat-color tag
public:
    vector<Card> hand;
    bool isHuman;
    Player(string n, int c);
    void showCards();
    int getColour();
    string getName();
};
```

**JS — split into two pieces of state:**
```js
// (a) lobby/seat info -> rooms/{roomId}/players/{playerId}
{ id: "p_x7f2a9k", name: "Mahesh", seat: 0 }

// (b) that player's live hand -> rooms/{roomId}/gameState.hands[playerId]
hands["p_x7f2a9k"] = [ {value:14, suit:"Spades", name:"Ace"}, ... ]
```

> Note: `colour` and `isHuman` were dropped in the port — seat position replaces `colour`, and since bots aren't implemented yet, `isHuman` is implicitly always true.

### Turn Order (`linked_list` in C++)

**C++ (class, `logics.cpp`):**
```cpp
class linked_list {
public:
    Player *p;
    linked_list *next;   // circular — last node points back to head
};
```

**JS — plain array, wrapped with modulo instead of pointers:**
```js
gameState.playingOrder = ["p_ace_holder", "p_b", "p_c", "p_d"];
// "next" becomes:
let nextIdx = (currentIdx + 1) % 4;
```

### CurrTable (live per-trick game state)

**C++ (class, `logics.cpp`):**
```cpp
class CurrTable {
public:
    bool firstRound;
    string currSuit;
    vector<Card> table;
    linked_list *head;
    vector<Player*> contd;    // just emptied their hand this trick
    vector<Player*> result;   // final ranking (game ends at size 2)
};
```

**JS — `gameState`, the exact object written to Firebase:**
```js
gameState = {
  firstRound: true,
  currSuit: "Spades",
  leadSuit: "Spades",
  turnInRound: 0,
  currHighestVal: -1,
  highestPlayerId: playingOrder[0],
  currentTurnPlayerId: playingOrder[0],
  playingOrder: [ /* 4 player ids, in turn order */ ],
  table: [],           // == CurrTable::table
  hands: { /* playerId -> Card[] */ },
  contd: [],           // == CurrTable::contd, stores ids not pointers
  result: [],          // == CurrTable::result, game ends when length hits 2
  roundNum: 1
}
```

The mapping is 1:1 in meaning: every `Player*` in C++ became a `playerId` string lookup into `hands`/`players` in JS, since Firebase can't store pointers. Field names, what each one tracks, and when the game ends are otherwise unchanged from the C++ version.

---

## Game Rules (quick version)

The full rules ship inside the app itself (registration screen), but in short:

1. Exactly 4 players, 13 cards each, standard 52-card deck.
2. Rank order: A (high) → K → Q → J → 10 → ... → 2.
3. Whoever holds **A♠** leads Round 1.
4. You must follow the lead suit if you have a card in it.
5. If everyone follows suit, the highest card wins the trick and leads next.
6. **Thullu**: if you *can't* follow suit, you can throw any card — but the player holding the highest lead-suit card has to pick up every card on the table.
7. Round 1 is a grace round: a Round-1 Thullu discards safely, no pickup.
8. **Rule 10**: if you're out of cards but it becomes your turn again, you draw one random card from whoever's holding the most cards.
9. 15 seconds per move, or the game auto-plays a legal card for you.
10. First player to empty their hand is Rank 1, second is Rank 2 — game over.

---

## Tech stack

| Layer | What's used |
|---|---|
| Game logic prototype | C++ (`logics.cpp`) — console-only, used to design & test rules |
| Frontend | Vanilla JavaScript (ES modules), HTML, CSS — no framework |
| Realtime sync / backend | Firebase Realtime Database |
| Hosting | Firebase Hosting |
| Fonts | Google Fonts — Montserrat & Cinzel |

---

## Project structure

```
thullu/
├── index.html      # All screens: register, lobby, game table, results, error
├── style1.css      # Felt-table dark UI theme
├── app1.js         # Game logic (ported from logics.cpp) + Firebase sync + DOM rendering
├── logics.cpp      # Original C++ prototype — where the rules were designed & tested
└── images/         # Diagrams referenced in this README
```

---

## Running it on your own machine

You don't need to build anything — it's static files — but you do need your own Firebase project, since the one in this repo's `app1.js` points at our database.

1. **Clone the repo**
   ```bash
   git clone https://github.com/ursthakurmahesh/<repo-name>.git
   cd <repo-name>
   ```

2. **Create your own Firebase project**
   - Go to the [Firebase Console](https://console.firebase.google.com/), create a project.
   - Enable **Realtime Database** (start in test mode while developing, then lock it down — see below).
   - Register a Web App inside the project to get your config object.

3. **Swap in your config**
   In `app1.js`, replace the `firebaseConfig` object near the top with the one from your own Firebase project.

4. **Serve it locally**
   Because it uses ES modules (`type="module"`), you can't just double-click `index.html` — it needs to be served over HTTP. Easiest options:
   ```bash
   # Python
   python3 -m http.server 5500

   # or Node
   npx serve .
   ```
   Then open `http://localhost:5500`.

5. **Play**
   Open the same URL in 4 tabs (or share it with 3 friends) to actually fill a table.

### Trying the original C++ prototype

If you just want to see the rules engine on its own, without any of the multiplayer/UI layer:

```bash
g++ -O2 -o thullu_cli logics.cpp
./thullu_cli
```

It'll deal 4 hands, tell you who holds A♠, and let you play a full game via the terminal by typing card indices — this is genuinely how the rules were first tested.

---

## Deploying (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # point it at this folder, set index.html as entry
firebase deploy
```

---

## Known limitations / what's next

currently this needs full manual 4 player but what i think of the future is i can integrate some ML model using concept of game theory and all so that's what i think of and currently i do fill the UI is to aish but i am not currently that good in css so some work can be done upon it.

---

## Credits

Built by:

- **Mahesh Thakur** — [hydrogenislove@gmail.com](mailto:hydrogenislove@gmail.com)
- **Aakash Kushwaha** — [aakash_2401cb18@iitp.ac.in](mailto:aakash_2401cb18@iitp.ac.in)
