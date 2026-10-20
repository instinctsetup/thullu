// THULLU - upgraded edition
// Core game rules are ported 1:1 from logics.cpp (unchanged logic).
// New: anonymous auth, AI seats (game-theory bot engine), auto-fill, bot
// takeover on disconnect + rejoin, sounds, settings, scoreboard.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, onValue, update, onDisconnect, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCw2u_UHL-uygm5m_iXah8U7Ohewr3JE-0",
    authDomain: "thullu-8e7a0.firebaseapp.com",
    databaseURL: "https://thullu-8e7a0-default-rtdb.firebaseio.com",
    projectId: "thullu-8e7a0",
    storageBucket: "thullu-8e7a0.firebasestorage.app",
    messagingSenderId: "113813136186",
    appId: "1:113813136186:web:79fe5afd7bec0a81d56603"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
let authReady = false;
signInAnonymously(auth).catch(err => console.error("anon auth failed", err));
onAuthStateChanged(auth, (u) => { authReady = !!u; });

onValue(ref(db, ".info/connected"), (snap) => {
    const dot = document.getElementById("conn-dot");
    const text = document.getElementById("conn-text");
    const isOnline = snap.val() === true;
    if (dot) dot.style.background = isOnline ? "#00e676" : "#ff2a4b";
    if (text) text.textContent = isOnline ? "Online" : "Reconnecting...";
});

// Local identity (sessionStorage keeps the seat stable across a refresh on the same tab)
let localPlayerId = sessionStorage.getItem("thullu_pid");
if (!localPlayerId) {
    localPlayerId = "p_" + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem("thullu_pid", localPlayerId);
}
let humanUserName = sessionStorage.getItem("thullu_name") || "Player 1";
let currentRoomId = "";
let roomListener = null;

// ==========================================
// CORE LOGIC FUNCTIONS (faithful port of logics.cpp - unchanged)
// ==========================================

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// Line 92 logics.cpp: initialize_card
function initialize_card() {
    const deck = [];
    const names = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
    const suits = ["Spades", "Hearts", "Diamonds", "Clubs"];
    for (const suit of suits) {
        for (let i = 2; i <= 14; i++) {
            deck.push({ value: i, suit: suit, name: names[i - 2] });
        }
    }
    return deck;
}

// Line 138 logics.cpp: distributeCards
function distributeCards(playerIds, deck) {
    const permut = [];
    for (let i = 0; i < 13; i++) {
        permut.push(0, 1, 2, 3);
    }
    shuffleArray(permut);
    shuffleArray(permut);
    const hands = {};
    playerIds.forEach(id => { hands[id] = []; });
    for (let i = 0; i < 52; i++) {
        const pId = playerIds[permut[i]];
        hands[pId].push(deck[i]);
    }
    return hands;
}

// Line 168 logics.cpp: AceOfSpades
function AceOfSpades(hand) {
    if (!hand) return false;
    for (const c of hand) {
        if (c.value === 14 && c.suit === "Spades") return true;
    }
    return false;
}

// Line 178 logics.cpp: OrderOfPlaying
function OrderOfPlaying(playerList, hands) {
    let playersCopy = [...playerList];
    for (let i = 0; i < playersCopy.length; i++) {
        if (AceOfSpades(hands[playersCopy[i].id])) {
            let temp = playersCopy[0];
            playersCopy[0] = playersCopy[i];
            playersCopy[i] = temp;
            break;
        }
    }
    let rest = playersCopy.slice(1);
    shuffleArray(rest);
    shuffleArray(rest);
    shuffleArray(rest);
    playersCopy[1] = rest[0];
    playersCopy[2] = rest[1];
    playersCopy[3] = rest[2];
    return playersCopy.map(p => p.id);
}

// Line 281 logics.cpp: cardCmp
function cardCmp(a, b) {
    const suitRank = (s) => {
        if (s === "Clubs") return 3;
        if (s === "Diamonds") return 2;
        if (s === "Hearts") return 1;
        return 0;
    };
    if (suitRank(a.suit) !== suitRank(b.suit)) {
        return suitRank(a.suit) - suitRank(b.suit);
    }
    return a.value - b.value;
}

// Line 299 logics.cpp: sortHand
function sortHand(hand) {
    if (!hand) return;
    hand.sort(cardCmp);
}

// Line 253 logics.cpp: checkValid
function checkValid(idx, hand, currSuit) {
    if (!hand || idx < 0 || idx >= hand.length) {
        return false;
    }
    if (hand[idx].suit === currSuit || currSuit === "ANY") {
        return true;
    }
    return false;
}

// Line 268 logics.cpp: thul
function thul(suit, hand) {
    if (!hand) return true;
    for (let i = 0; i < hand.length; i++) {
        if (hand[i].suit === suit) {
            return false;
        }
    }
    return true;
}

// Line 304 logics.cpp: thulAdd
function thulAdd(targetHand, tableCards) {
    while (tableCards.length > 0) {
        targetHand.push(tableCards.pop());
    }
    sortHand(targetHand);
}

function applyPendingEvents(gameState, pendingEvents) {
    if (pendingEvents.length) {
        gameState.eventSeq = (gameState.eventSeq || 0) + 1;
        gameState.lastEvent = { seq: gameState.eventSeq, text: pendingEvents.join("  •  ") };
    }
}

// Line 314 logics.cpp: checkWinner
function checkWinner(gameState, playersMap) {
    let contd = gameState.contd || [];
    let result = gameState.result || [];
    let playingOrder = gameState.playingOrder || [];
    for (const winnerId of contd) {
        let hand = gameState.hands[winnerId] || [];
        if (hand.length !== 0) continue;
        if (result.includes(winnerId)) continue;
        if (result.length < 2) {
            result.push(winnerId);
        }
        console.log(`Player ${playersMap[winnerId]?.name || winnerId} has scored rank ${result.length}`);
        playingOrder = playingOrder.filter(id => id !== winnerId);
        if (result.length >= 2) {
            gameState.contd = [];
            gameState.result = result;
            gameState.playingOrder = playingOrder;
            return;
        }
    }
    gameState.contd = [];
    gameState.result = result;
    gameState.playingOrder = playingOrder;
}

// Line 387 logics.cpp: getRandom (Rule 10)
function getRandom(pId, gameState) {
    let playingOrder = gameState.playingOrder || [];
    let maxLen = 0;
    let giverId = null;
    for (let id of playingOrder) {
        let h = gameState.hands[id] || [];
        if (h.length > maxLen) {
            maxLen = h.length;
            giverId = id;
        }
    }
    if (giverId && gameState.hands[giverId] && gameState.hands[giverId].length > 0) {
        let giverHand = gameState.hands[giverId];
        let idx = Math.floor(Math.random() * giverHand.length);
        let chosen = giverHand.splice(idx, 1)[0];
        let pHand = gameState.hands[pId] || [];
        pHand.push(chosen);
        sortHand(pHand);
        if (giverHand.length === 0) {
            if (!gameState.contd) gameState.contd = [];
            if (!gameState.contd.includes(giverId)) gameState.contd.push(giverId);
        }
    }
    return giverId;
}


// Port completion: when the trick winner emptied their hand (ranked + removed from
// playingOrder by checkWinner), the lead must pass to the next active player in
// circular order - the C++ linked_list removal implies this skip.
function nextActiveAfter(originalOrder, afterId, activeOrder) {
    const n = originalOrder.length;
    let i = originalOrder.indexOf(afterId);
    if (i === -1) return activeOrder[0];
    for (let k = 1; k <= n; k++) {
        const cand = originalOrder[(i + k) % n];
        if (activeOrder.includes(cand)) return cand;
    }
    return activeOrder[0];
}

// ==========================================
// MOVE ENGINE (identical rules to the original handleCardClick,
// parameterized so humans AND bots execute the exact same move logic)
// ==========================================
function applyMove(gameState, playersMap, playerId, playerName, cardIndex) {
    const myHand = gameState.hands[playerId];
    if (!myHand || cardIndex < 0 || cardIndex >= myHand.length) return null;

    const handBeforePlay = myHand.slice();
    const pendingEvents = [];

    const playedCard = myHand.splice(cardIndex, 1)[0];
    playedCard.playedBy = playerId;
    playedCard.playedByName = playerName;

    let playingOrder = gameState.playingOrder || [];
    let currentTurnIndex = playingOrder.indexOf(playerId);
    if (currentTurnIndex === -1) currentTurnIndex = 0;

    let turnInRound = gameState.turnInRound || 0;
    let leadSuit = gameState.leadSuit || "Spades";
    let currHighestVal = gameState.currHighestVal;
    let highestPlayerId = gameState.highestPlayerId || playerId;
    let firstRound = gameState.firstRound;
    let roundNum = gameState.roundNum || 1;
    let table = gameState.table || [];
    let contd = gameState.contd || [];

    if (firstRound) {
        if (turnInRound === 0) {
            if (playedCard.value > currHighestVal) {
                highestPlayerId = playerId;
                currHighestVal = playedCard.value;
            }
            table.push(playedCard);
            let nextTurnIndex = (currentTurnIndex + 1) % playingOrder.length;
            gameState.currentTurnPlayerId = playingOrder[nextTurnIndex];
            gameState.turnInRound = 1;
            gameState.currHighestVal = currHighestVal;
            gameState.highestPlayerId = highestPlayerId;
            gameState.table = table;
        } else {
            let thulf = thul(leadSuit, handBeforePlay);
            if (thulf) {
                table.push(playedCard);
                pendingEvents.push(`🔥 THUL! ${playerName} had no ${leadSuit} — Round 1 grace, cards discarded safely.`);
                gameState.table = [];
                gameState.firstRound = false;
                gameState.currSuit = "ANY";
                gameState.roundNum = roundNum + 1;
                gameState.highestPlayerId = highestPlayerId;
                gameState.currentTurnPlayerId = highestPlayerId;
                gameState.turnInRound = 0;
                gameState.currHighestVal = -1;
            } else {
                if (playedCard.value > currHighestVal) {
                    highestPlayerId = playerId;
                    currHighestVal = playedCard.value;
                }
                table.push(playedCard);
                const activeCount = playingOrder.length;
                if (turnInRound === activeCount - 1) {
                    gameState.table = [];
                    gameState.firstRound = false;
                    gameState.currSuit = "ANY";
                    gameState.roundNum = roundNum + 1;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.currentTurnPlayerId = highestPlayerId;
                    gameState.turnInRound = 0;
                    gameState.currHighestVal = -1;
                } else {
                    let nextTurnIndex = (currentTurnIndex + 1) % playingOrder.length;
                    gameState.currentTurnPlayerId = playingOrder[nextTurnIndex];
                    gameState.turnInRound = turnInRound + 1;
                    gameState.currHighestVal = currHighestVal;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.table = table;
                }
            }
        }
    } else {
        if (turnInRound === 0) {
            if (myHand.length === 0) {
                let giverId = getRandom(playerId, gameState);
                if (giverId) {
                    pendingEvents.push(`🎴 Rule 10: ${playerName} had no cards, so ${playersMap[giverId]?.name || "a player"} handed one over.`);
                }
                if (giverId && gameState.hands[giverId].length === 0) {
                    if (!contd.includes(giverId)) contd.push(giverId);
                }
                checkWinner(gameState, playersMap);
                if (gameState.result && gameState.result.length >= 2) {
                    applyPendingEvents(gameState, pendingEvents);
                    return pendingEvents;
                }
            }

            if (playedCard.value > currHighestVal) {
                highestPlayerId = playerId;
                currHighestVal = playedCard.value;
            }
            leadSuit = playedCard.suit;
            gameState.currSuit = leadSuit;
            gameState.leadSuit = leadSuit;
            table.push(playedCard);

            if (myHand.length === 0) {
                if (!contd.includes(playerId)) contd.push(playerId);
            }

            let nextTurnIndex = (currentTurnIndex + 1) % playingOrder.length;
            gameState.currentTurnPlayerId = playingOrder[nextTurnIndex];
            gameState.turnInRound = 1;
            gameState.currHighestVal = currHighestVal;
            gameState.highestPlayerId = highestPlayerId;
            gameState.table = table;
            gameState.contd = contd;
        } else {
            let thulf = thul(leadSuit, handBeforePlay);
            if (thulf) {
                table.push(playedCard);
                const pickupName = playersMap[highestPlayerId]?.name || "the trick winner";
                pendingEvents.push(`🔥 THUL! ${playerName} had no ${leadSuit} — ${pickupName} picks up the whole table!`);
                if (myHand.length === 0) {
                    if (!contd.includes(playerId)) contd.push(playerId);
                }
                let targetHand = gameState.hands[highestPlayerId] || [];
                thulAdd(targetHand, table);
                gameState.table = [];
                gameState.firstRound = false;
                gameState.currSuit = "ANY";
                gameState.roundNum = roundNum + 1;
                gameState.highestPlayerId = highestPlayerId;
                gameState.currentTurnPlayerId = highestPlayerId;
                gameState.turnInRound = 0;
                gameState.currHighestVal = -1;
                gameState.contd = contd;
                checkWinner(gameState, playersMap);
                if ((gameState.result || []).length < 2) {
                    const active = gameState.playingOrder || [];
                    if (active.length && !active.includes(gameState.currentTurnPlayerId)) {
                        gameState.currentTurnPlayerId = nextActiveAfter(playingOrder, highestPlayerId, active);
                    }
                }
                let nextLeadHand = gameState.hands[highestPlayerId] || [];
                if (nextLeadHand.length === 0 && (gameState.playingOrder || []).includes(highestPlayerId)) {
                    let gId = getRandom(highestPlayerId, gameState);
                    if (gId) {
                        pendingEvents.push(`🎴 Rule 10: ${playersMap[highestPlayerId]?.name || "The next leader"} had no cards, so ${playersMap[gId]?.name || "a player"} handed one over.`);
                    }
                    checkWinner(gameState, playersMap);
                }
            } else {
                if (playedCard.value > currHighestVal) {
                    highestPlayerId = playerId;
                    currHighestVal = playedCard.value;
                }
                table.push(playedCard);
                if (myHand.length === 0) {
                    if (!contd.includes(playerId)) contd.push(playerId);
                }
                const activeCount = playingOrder.length;
                if (turnInRound === activeCount - 1) {
                    gameState.table = [];
                    gameState.firstRound = false;
                    gameState.currSuit = "ANY";
                    gameState.roundNum = roundNum + 1;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.currentTurnPlayerId = highestPlayerId;
                    gameState.turnInRound = 0;
                    gameState.currHighestVal = -1;
                    gameState.contd = contd;
                    checkWinner(gameState, playersMap);
                    if ((gameState.result || []).length < 2) {
                        const active = gameState.playingOrder || [];
                        if (active.length && !active.includes(gameState.currentTurnPlayerId)) {
                            gameState.currentTurnPlayerId = nextActiveAfter(playingOrder, highestPlayerId, active);
                        }
                    }
                    let nextLeadHand = gameState.hands[highestPlayerId] || [];
                    if (nextLeadHand.length === 0 && (gameState.playingOrder || []).includes(highestPlayerId)) {
                        let gId = getRandom(highestPlayerId, gameState);
                        if (gId) {
                            pendingEvents.push(`🎴 Rule 10: ${playersMap[highestPlayerId]?.name || "The next leader"} had no cards, so ${playersMap[gId]?.name || "a player"} handed one over.`);
                        }
                        checkWinner(gameState, playersMap);
                    }
                } else {
                    let nextTurnIndex = (currentTurnIndex + 1) % playingOrder.length;
                    gameState.currentTurnPlayerId = playingOrder[nextTurnIndex];
                    gameState.turnInRound = turnInRound + 1;
                    gameState.currHighestVal = currHighestVal;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.table = table;
                    gameState.contd = contd;
                }
            }
        }
    }

    applyPendingEvents(gameState, pendingEvents);
    return pendingEvents;
}

// ==========================================
// AI ENGINE - "ThulluBot" game-theory opponent
// Imperfect-information reasoning: card counting from the public move log,
// void-suit inference (a player who failed to follow suit is marked void),
// and risk estimation of a THUL landing on the bot's own high card.
// Only public information is used: own hand, table, and the move history.
// ==========================================
function buildBotKnowledge(gameState) {
    const voids = {};
    const playedBySuit = { Spades: 0, Hearts: 0, Diamonds: 0, Clubs: 0 };
    const history = gameState.moveHistory || [];
    let activeLead = null;
    let turnInRoundAtPlay = 0;
    for (const mv of history) {
        const suit = mv.card && mv.card.suit;
        if (!suit) continue;
        playedBySuit[suit] = (playedBySuit[suit] || 0) + 1;
        if (mv.led) {
            activeLead = suit;
        } else if (activeLead && suit !== activeLead) {
            // played off-suit while a lead suit was active => provably void
            if (!voids[mv.by]) voids[mv.by] = {};
            voids[mv.by][activeLead] = true;
        }
        turnInRoundAtPlay++;
    }
    return { voids, playedBySuit };
}

function botLegalIndices(hand, gameState) {
    const res = [];
    const firstRound = gameState.firstRound;
    const turnInRound = gameState.turnInRound || 0;
    const leadSuit = gameState.leadSuit || gameState.currSuit;
    for (let i = 0; i < hand.length; i++) {
        if (firstRound && turnInRound === 0) {
            if (hand[i].suit === "Spades" && hand[i].value === 14) res.push(i);
        } else if (turnInRound === 0) {
            res.push(i);
        } else {
            if (!thul(leadSuit, hand)) {
                if (hand[i].suit === leadSuit) res.push(i);
            } else {
                res.push(i);
            }
        }
    }
    return res;
}

function botChooseCard(gameState, botId, playersMap) {
    const hand = gameState.hands[botId] || [];
    const legal = botLegalIndices(hand, gameState);
    if (legal.length === 0) return -1;
    if (legal.length === 1) return legal[0];

    const K = buildBotKnowledge(gameState);
    const turnInRound = gameState.turnInRound || 0;
    const leadSuit = gameState.leadSuit || gameState.currSuit;
    const order = gameState.playingOrder || [];
    const myIdx = order.indexOf(botId);
    // players still to act after me in this trick
    const laterPlayers = [];
    for (let k = 1; k < order.length - turnInRound; k++) {
        const pid = order[(myIdx + k) % order.length];
        if (pid !== botId) laterPlayers.push(pid);
    }
    const riskOfThul = laterPlayers.some(pid => K.voids[pid] && K.voids[pid][leadSuit]);

    const byValueAsc = (a, b) => hand[a].value - hand[b].value;

    if (turnInRound === 0) {
        // LEADING: shed a low card from a suit nobody is known void in.
        const suits = {};
        for (const i of legal) {
            const s = hand[i].suit;
            if (!suits[s]) suits[s] = [];
            suits[s].push(i);
        }
        let bestSuit = null, bestScore = -1e9;
        for (const s of Object.keys(suits)) {
            const someoneVoid = laterPlayers.concat(order.filter(p => p !== botId))
                .some(pid => K.voids[pid] && K.voids[pid][s]);
            let score = suits[s].length * 2;            // prefer longest suit
            if (someoneVoid) score -= 100;              // avoid suits with known voids
            score -= Math.min(...suits[s].map(i => hand[i].value)) * 0.1;
            if (score > bestScore) { bestScore = score; bestSuit = s; }
        }
        const choices = (bestSuit ? suits[bestSuit] : legal).sort(byValueAsc);
        return choices[0]; // lowest card of the chosen suit
    }

    const canFollow = !thul(leadSuit, hand);
    if (!canFollow) {
        // THUL: dump the highest card of the shortest remaining suit (build future voids).
        const suits = {};
        for (const i of legal) {
            const s = hand[i].suit;
            if (!suits[s]) suits[s] = [];
            suits[s].push(i);
        }
        let dumpSuit = null, minLen = 1e9;
        for (const s of Object.keys(suits)) {
            if (suits[s].length < minLen) { minLen = suits[s].length; dumpSuit = s; }
        }
        return suits[dumpSuit].sort((a, b) => hand[b].value - hand[a].value)[0];
    }

    // FOLLOWING SUIT
    const currHighest = gameState.currHighestVal;
    const followIdx = legal.slice().sort(byValueAsc);
    const winners = followIdx.filter(i => hand[i].value > currHighest);
    if (riskOfThul) {
        // someone after me is void: never sit on top - play lowest possible
        const losers = followIdx.filter(i => hand[i].value < currHighest);
        return (losers.length ? losers[0] : followIdx[0]);
    }
    if (winners.length) {
        // safe to take the trick: win as cheaply as possible (cards burn, hand shrinks)
        return winners[0];
    }
    return followIdx[0]; // cannot win: duck with the lowest
}

// ==========================================
// SOUND ENGINE (synthesized, no assets) + SETTINGS
// ==========================================
const settings = Object.assign(
    { sound: true, anim: true, theme: "felt" },
    JSON.parse(localStorage.getItem("thullu_settings") || "{}")
);
function saveSettings() { localStorage.setItem("thullu_settings", JSON.stringify(settings)); }
function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.classList.toggle("reduced-anim", !settings.anim);
    const st = document.getElementById("sound-toggle");
    const at = document.getElementById("anim-toggle");
    const ts = document.getElementById("theme-select");
    if (st) st.checked = settings.sound;
    if (at) at.checked = settings.anim;
    if (ts) ts.value = settings.theme;
    const muteBtn = document.getElementById("mute-btn");
    if (muteBtn) muteBtn.textContent = settings.sound ? "🔊" : "🔇";
}

let audioCtx = null;
function ac() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}
function tone(freq, dur, type = "sine", gain = 0.12, when = 0) {
    if (!settings.sound) return;
    try {
        const ctx = ac();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime + when);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur);
    } catch (e) { /* audio unavailable */ }
}
function noiseBurst(dur = 0.08, gain = 0.08) {
    if (!settings.sound) return;
    try {
        const ctx = ac();
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = gain;
        src.connect(g); g.connect(ctx.destination); src.start();
    } catch (e) { }
}
const sfx = {
    play: () => noiseBurst(0.09, 0.10),
    click: () => tone(660, 0.05, "triangle", 0.06),
    turn: () => { tone(880, 0.09, "sine", 0.08); tone(1174, 0.12, "sine", 0.07, 0.09); },
    thul: () => { tone(392, 0.16, "sawtooth", 0.09); tone(261, 0.25, "sawtooth", 0.09, 0.14); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.10, i * 0.13)); },
    rule10: () => tone(494, 0.15, "square", 0.06)
};

// ==========================================
// DOM ELEMENTS & UI CONTROL
// ==========================================
const screens = {
    register: document.getElementById("register-screen"),
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    results: document.getElementById("results-screen"),
    error: document.getElementById("error-screen")
};

const elements = {
    usernameInput: document.getElementById("username"),
    createRoomBtn: document.getElementById("create-room-btn"),
    roomIdInput: document.getElementById("room-id-input"),
    joinBtn: document.getElementById("join-btn"),
    soloBtn: document.getElementById("solo-btn"),
    rejoinCodeInput: document.getElementById("rejoin-code-input"),
    rejoinBtn: document.getElementById("rejoin-btn"),
    displayRoomId: document.getElementById("display-room-id"),
    countLbl: document.getElementById("count-lbl"),
    playerList: document.getElementById("player-list"),
    leaderControls: document.getElementById("leader-controls"),
    startGameBtn: document.getElementById("start-game-btn"),
    leaveRoomBtn: document.getElementById("leave-room-btn"),
    turnIndicator: document.getElementById("turn-indicator"),
    inGameLeaveBtn: document.getElementById("in-game-leave-btn"),
    timerProgress: document.getElementById("timer-progress-fluid"),
    infoSuit: document.getElementById("info-suit"),
    infoVal: document.getElementById("info-val"),
    infoRound: document.getElementById("info-round"),
    connDot: document.getElementById("conn-dot"),
    connText: document.getElementById("conn-text"),
    myCards: document.getElementById("my-cards"),
    handCount: document.getElementById("hand-count"),
    playedCardsZone: document.getElementById("played-cards-zone"),
    rule10Alert: document.getElementById("rule10-alert"),
    thulluBanner: document.getElementById("thullu-banner"),
    topCardsCount: document.getElementById("top-cards-count"),
    leftCardsCount: document.getElementById("left-cards-count"),
    rightCardsCount: document.getElementById("right-cards-count"),
    podiumBoard: document.getElementById("podium-ranking-board"),
    returnMainMenuBtn: document.getElementById("return-main-menu-btn"),
    errorTitle: document.getElementById("error-title"),
    errorMessage: document.getElementById("error-message"),
    errorMenuBtn: document.getElementById("error-menu-btn"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsPanel: document.getElementById("settings-panel"),
    scoreboardBtn: document.getElementById("scoreboard-btn"),
    scoreboardPanel: document.getElementById("scoreboard-panel"),
    scoreboardBody: document.getElementById("scoreboard-list"),
    roundSummary: document.getElementById("round-summary"),
    muteBtn: document.getElementById("mute-btn")
};

let timerInterval = null;
let timerSeconds = 15;
let lastShownEventSeq = -1;
let lastRenderedRound = 1;
let botActToken = "";
let lastRoomSnapshot = null;

function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            screens[key].classList.toggle("hidden", key !== screenKey);
        }
    });
}

function getSuitSymbol(suit) {
    switch (suit) {
        case "Spades": return "♠";
        case "Hearts": return "♥";
        case "Diamonds": return "♦";
        case "Clubs": return "♣";
        default: return suit;
    }
}

function getValueString(val) {
    if (val === 14) return "A";
    if (val === 13) return "K";
    if (val === 12) return "Q";
    if (val === 11) return "J";
    return val.toString();
}

function showAlert(message) {
    if (elements.rule10Alert) {
        elements.rule10Alert.textContent = message;
        elements.rule10Alert.classList.remove("hidden");
        setTimeout(() => { if (elements.rule10Alert) elements.rule10Alert.classList.add("hidden"); }, 4500);
    }
    if (message.includes("THUL")) {
        sfx.thul();
        if (elements.thulluBanner) {
            elements.thulluBanner.textContent = message;
            elements.thulluBanner.classList.remove("hidden");
            setTimeout(() => { if (elements.thulluBanner) elements.thulluBanner.classList.add("hidden"); }, 3000);
        }
    } else if (message.includes("Rule 10")) {
        sfx.rule10();
    }
    if (elements.roundSummary) {
        elements.roundSummary.textContent = message;
        elements.roundSummary.classList.remove("hidden");
        clearTimeout(elements.roundSummary._t);
        elements.roundSummary._t = setTimeout(() => elements.roundSummary.classList.add("hidden"), 5200);
    }
}

function showDisbandError(reason, isNetwork) {
    stopTimer();
    detachRoomListener();
    if (elements.errorTitle) elements.errorTitle.textContent = isNetwork ? "⚠️ NETWORK ERROR" : "TABLE DISBANDED";
    if (elements.errorMessage) elements.errorMessage.textContent = reason || "A player left or disconnected from the table. The game has ended.";
    showScreen("error");
}

function startTimer() {
    clearInterval(timerInterval);
    timerSeconds = 15;
    if (elements.timerProgress) elements.timerProgress.style.width = "100%";
    timerInterval = setInterval(() => {
        timerSeconds -= 0.1;
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            if (elements.timerProgress) elements.timerProgress.style.width = "0%";
            autoPlayTimeout();
        } else {
            const pct = (timerSeconds / 15) * 100;
            if (elements.timerProgress) elements.timerProgress.style.width = `${pct}%`;
        }
    }, 100);
}

function stopTimer() { clearInterval(timerInterval); }

function detachRoomListener() {
    if (currentRoomId && roomListener) {
        off(ref(db, `rooms/${currentRoomId}`), 'value', roomListener);
        roomListener = null;
    }
    currentRoomId = "";
    lastShownEventSeq = -1;
    botActToken = "";
}

// ==========================================
// ROOM FLOWS
// ==========================================
function seatHuman(roomId, name, solo) {
    humanUserName = name;
    sessionStorage.setItem("thullu_name", name);
}

async function waitAuth() {
    for (let i = 0; i < 40 && !authReady; i++) await new Promise(r => setTimeout(r, 250));
    return authReady;
}

if (elements.createRoomBtn) {
    elements.createRoomBtn.addEventListener("click", async () => {
        sfx.click();
        if (!(await waitAuth())) { alert("Still connecting - try again in a second."); return; }
        const name = elements.usernameInput.value.trim() || "Player 1";
        seatHuman(null, name);
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        currentRoomId = roomId;
        const roomData = {
            roomId: roomId,
            status: "waiting",
            hostId: localPlayerId,
            disbandReason: "",
            players: {
                [localPlayerId]: { id: localPlayerId, name: name, seat: 0, connected: true }
            }
        };
        const roomRef = ref(db, `rooms/${roomId}`);
        await set(roomRef, roomData);
        onDisconnect(ref(db, `rooms/${roomId}/players/${localPlayerId}/connected`)).set(false);
        listenToRoom(roomId);
        showScreen("lobby");
    });
}

if (elements.soloBtn) {
    elements.soloBtn.addEventListener("click", async () => {
        sfx.click();
        if (!(await waitAuth())) { alert("Still connecting - try again in a second."); return; }
        const name = elements.usernameInput.value.trim() || "Player 1";
        seatHuman(null, name);
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        currentRoomId = roomId;
        const roomData = {
            roomId: roomId,
            status: "waiting",
            hostId: localPlayerId,
            disbandReason: "",
            solo: true,
            players: {
                [localPlayerId]: { id: localPlayerId, name: name, seat: 0, connected: true }
            }
        };
        const roomRef = ref(db, `rooms/${roomId}`);
        await set(roomRef, roomData);
        onDisconnect(ref(db, `rooms/${roomId}/players/${localPlayerId}/connected`)).set(false);
        listenToRoom(roomId);
        showScreen("lobby");
        // solo table starts immediately - AI fills the remaining seats
        setTimeout(() => startGameWithBots(roomId), 600);
    });
}

if (elements.joinBtn) {
    elements.joinBtn.addEventListener("click", async () => {
        sfx.click();
        if (!(await waitAuth())) { alert("Still connecting - try again in a second."); return; }
        const name = elements.usernameInput.value.trim() || "Player 1";
        const code = elements.roomIdInput.value.trim().toUpperCase();
        if (!code) { alert("Please enter a valid 6-Letter Room Code!"); return; }
        seatHuman(null, name);
        const roomRef = ref(db, `rooms/${code}`);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) { alert("Room Code not found!"); return; }
        const room = snapshot.val();
        if (room.status !== "waiting") { alert("Table is no longer accepting players (Game in progress or disbanded)."); return; }
        const existingPlayers = room.players ? Object.values(room.players) : [];
        if (existingPlayers.length >= 4) { alert("Table is full! (4/4 players already seated)."); return; }
        const seatNum = existingPlayers.length;
        const playerRef = ref(db, `rooms/${code}/players/${localPlayerId}`);
        await set(playerRef, { id: localPlayerId, name: name, seat: seatNum, connected: true });
        onDisconnect(ref(db, `rooms/${code}/players/${localPlayerId}/connected`)).set(false);
        currentRoomId = code;
        listenToRoom(code);
        showScreen("lobby");
    });
}

// Rejoin a seat that an AI took over after a disconnect
if (elements.rejoinBtn) {
    elements.rejoinBtn.addEventListener("click", async () => {
        sfx.click();
        if (!(await waitAuth())) { alert("Still connecting - try again in a second."); return; }
        const name = elements.usernameInput.value.trim();
        const code = (elements.rejoinCodeInput ? elements.rejoinCodeInput.value.trim().toUpperCase() : "");
        if (!name || !code) { alert("Enter your name and the table code to rejoin."); return; }
        const snapshot = await get(ref(db, `rooms/${code}`));
        if (!snapshot.exists()) { alert("Room Code not found!"); return; }
        const room = snapshot.val();
        if (room.status !== "playing") { alert("That table is not in a live game."); return; }
        const players = room.players ? Object.values(room.players) : [];
        const mine = players.find(p => p.name === name && p.connected === false && !p.isBot);
        if (!mine) { alert("No AI-held seat found for that name on this table."); return; }
        localPlayerId = mine.id;
        sessionStorage.setItem("thullu_pid", localPlayerId);
        seatHuman(null, name);
        await update(ref(db, `rooms/${code}/players/${mine.id}`), { connected: true });
        onDisconnect(ref(db, `rooms/${code}/players/${mine.id}/connected`)).set(false);
        currentRoomId = code;
        listenToRoom(code);
        showScreen("game");
    });
}

async function startGameWithBots(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return;
    const room = snapshot.val();
    if (room.hostId !== localPlayerId) return; // only the table leader starts
    const playersList = Object.values(room.players || {});
    if (playersList.length < 1 || playersList.length > 4) return;

    // AI fills every empty seat (user requirement: works with 1-4 humans)
    const botNames = ["Chintu", "Monty", "Bablu"];
    let seatCursor = playersList.length;
    let botNum = 0;
    while (playersList.length < 4) {
        playersList.push({ id: `bot_${botNum + 1}`, name: botNames[botNum], seat: seatCursor, isBot: true, connected: true });
        seatCursor++; botNum++;
    }

    const deck = initialize_card();
    const hands = distributeCards(playersList.map(p => p.id), deck);
    Object.keys(hands).forEach(pId => sortHand(hands[pId]));
    const playingOrder = OrderOfPlaying(playersList, hands);

    const playersObj = {};
    playersList.forEach(p => { playersObj[p.id] = p; });

    const initialGameState = {
        firstRound: true,
        currSuit: "Spades",
        leadSuit: "Spades",
        turnInRound: 0,
        currHighestVal: -1,
        highestPlayerId: playingOrder[0],
        currentTurnPlayerId: playingOrder[0],
        playingOrder: playingOrder,
        table: [],
        hands: hands,
        contd: [],
        result: [],
        roundNum: 1,
        moveHistory: []
    };

    await update(roomRef, {
        status: "playing",
        players: playersObj,
        gameState: initialGameState
    });
}

if (elements.startGameBtn) {
    elements.startGameBtn.addEventListener("click", () => {
        sfx.click();
        if (currentRoomId) startGameWithBots(currentRoomId);
    });
}

function leaveAndDisbandTable() {
    if (currentRoomId && lastRoomSnapshot && lastRoomSnapshot.status === "waiting") {
        update(ref(db, `rooms/${currentRoomId}`), {
            status: "disbanded",
            disbandReason: `${humanUserName} left the table on purpose.`,
            disbandType: "left"
        });
    } else if (currentRoomId) {
        // mid-game: seat is handed to the AI (connected=false via onDisconnect too)
        update(ref(db, `rooms/${currentRoomId}/players/${localPlayerId}`), { connected: false });
    }
    detachRoomListener();
    stopTimer();
    showScreen("register");
}

if (elements.leaveRoomBtn) elements.leaveRoomBtn.addEventListener("click", leaveAndDisbandTable);
if (elements.inGameLeaveBtn) elements.inGameLeaveBtn.addEventListener("click", leaveAndDisbandTable);
if (elements.returnMainMenuBtn) {
    elements.returnMainMenuBtn.addEventListener("click", () => { detachRoomListener(); showScreen("register"); });
}
if (elements.errorMenuBtn) {
    elements.errorMenuBtn.addEventListener("click", () => { detachRoomListener(); showScreen("register"); });
}

// ==========================================
// REALTIME CONTROLLER + AI ORCHESTRATION
// ==========================================
function humanPlayers(room) {
    return Object.values(room.players || {}).filter(p => !p.isBot);
}
function connectedHumans(room) {
    return humanPlayers(room).filter(p => p.connected !== false).sort((a, b) => a.seat - b.seat);
}
function executorId(room) {
    const h = connectedHumans(room);
    return h.length ? h[0].id : null;
}
function isAiSeat(player) {
    return !!player && (player.isBot || player.connected === false);
}

async function executeBotMove(roomId, token) {
    const snapshot = await get(ref(db, `rooms/${roomId}`));
    if (!snapshot.exists()) return;
    const room = snapshot.val();
    if (room.status !== "playing") return;
    const gs = room.gameState;
    if (!gs || (gs.result || []).length >= 2) return;
    const pid = gs.currentTurnPlayerId;
    const player = (room.players || {})[pid];
    if (!isAiSeat(player)) return;
    if (executorId(room) !== localPlayerId) return;
    const liveToken = `${pid}:${gs.roundNum}:${gs.turnInRound}:${(gs.table || []).length}:${(gs.moveHistory || []).length}`;
    if (liveToken !== token) return; // state moved on; a newer snapshot owns this move

    const idx = botChooseCard(gs, pid, room.players || {});
    if (idx < 0) return;
    const wasLeading = (gs.turnInRound || 0) === 0;
    const card = (gs.hands[pid] || [])[idx];
    applyMove(gs, room.players || {}, pid, player.name, idx);
    gs.moveHistory = (gs.moveHistory || []).concat([{ by: pid, card: { value: card.value, suit: card.suit, name: card.name }, led: wasLeading, round: gs.roundNum }]);
    await update(ref(db, `rooms/${roomId}/gameState`), gs);
    sfx.play();
}

function maybeDriveAi(room) {
    const gs = room.gameState;
    if (!gs || (gs.result || []).length >= 2) return;
    const pid = gs.currentTurnPlayerId;
    const player = (room.players || {})[pid];
    if (!isAiSeat(player)) return;
    if (executorId(room) !== localPlayerId) return;
    const token = `${pid}:${gs.roundNum}:${gs.turnInRound}:${(gs.table || []).length}:${(gs.moveHistory || []).length}`;
    if (token === botActToken) return;
    botActToken = token;
    setTimeout(() => executeBotMove(currentRoomId, token), 900 + Math.random() * 900);
}

function listenToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    roomListener = onValue(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            showDisbandError("This table no longer exists.", true);
            return;
        }
        const room = snapshot.val();
        lastRoomSnapshot = room;

        if (room.status === "disbanded") {
            showDisbandError(room.disbandReason || "A player left the game.", room.disbandType === "network");
            return;
        }

        const playersList = room.players ? Object.values(room.players) : [];

        if (room.status === "waiting") {
            const humans = humanPlayers(room).filter(p => p.connected !== false);
            if (humans.length < 1) {
                showDisbandError("Everyone left the table.", false);
                return;
            }
            // host migration: if the table leader dropped, the lowest-seat human takes over
            if (room.players[room.hostId] && room.players[room.hostId].connected === false && humans[0].id === localPlayerId && room.hostId !== localPlayerId) {
                update(ref(db, `rooms/${roomId}`), { hostId: localPlayerId });
                room.hostId = localPlayerId;
            }
            if (elements.displayRoomId) elements.displayRoomId.textContent = `ROOM CODE: ${roomId}`;
            if (elements.countLbl) elements.countLbl.textContent = humans.length.toString();
            if (elements.playerList) {
                elements.playerList.innerHTML = humans.map(p => `
                    <li>
                        <span>👤 ${p.name} ${p.id === localPlayerId ? '(You)' : ''}</span>
                        <span style="color:${p.id === room.hostId ? '#00e676' : '#00e5ff'};">
                            ${p.id === room.hostId ? 'HOST' : 'PLAYER'}
                        </span>
                    </li>
                `).join("");
            }
            if (localPlayerId === room.hostId) {
                if (elements.leaderControls) elements.leaderControls.classList.remove("hidden");
                if (elements.startGameBtn) {
                    elements.startGameBtn.classList.remove("hidden");
                    const bots = 4 - humans.length;
                    elements.startGameBtn.textContent = bots > 0
                        ? `🚀 Start (${humans.length} player${humans.length > 1 ? 's' : ''} + ${bots} AI)`
                        : "🚀 Launch 4-Player Tournament";
                }
            } else if (elements.leaderControls) {
                elements.leaderControls.classList.add("hidden");
            }
            showScreen("lobby");
            return;
        }

        if (room.status === "playing") {
            if (connectedHumans(room).length < 1) {
                update(ref(db, `rooms/${roomId}`), {
                    status: "disbanded",
                    disbandReason: `All players left the table. The game has ended.`,
                    disbandType: "network"
                });
                return;
            }
            showScreen("game");
            renderGameScreen(room);
            maybeDriveAi(room);
        }
    });
}

// Render Game Screen
function renderGameScreen(room) {
    const gameState = room.gameState;
    if (!gameState) return;
    const playersMap = room.players || {};
    const playersList = Object.values(playersMap);

    if (gameState.lastEvent && gameState.lastEvent.seq > lastShownEventSeq) {
        lastShownEventSeq = gameState.lastEvent.seq;
        showAlert(gameState.lastEvent.text);
    }

    if ((gameState.roundNum || 1) !== lastRenderedRound) {
        lastRenderedRound = gameState.roundNum || 1;
    }

    if (gameState.result && gameState.result.length >= 2) {
        stopTimer();
        showScreen("results");
        sfx.win();
        if (elements.podiumBoard) {
            const r1 = playersMap[gameState.result[0]]?.name || "Player";
            const r2 = playersMap[gameState.result[1]]?.name || "Player";
            elements.podiumBoard.innerHTML = `
                <div class="podium-slot rank-1">
                    <span style="font-size:1.6rem;">🥇</span>
                    <div>
                        <div style="font-size:0.8rem; color:#ffd700; font-weight:700;">TOURNAMENT CHAMPION (RANK 1)</div>
                        <strong>${r1}</strong>
                    </div>
                </div>
                <div class="podium-slot rank-2">
                    <span style="font-size:1.6rem;">🥈</span>
                    <div>
                        <div style="font-size:0.8rem; color:#c0c0c0; font-weight:700;">RUNNER UP (RANK 2)</div>
                        <strong>${r2}</strong>
                    </div>
                </div>
            `;
        }
        return;
    }

    const currentTurnId = gameState.currentTurnPlayerId;
    const isMyTurn = (currentTurnId === localPlayerId);

    if (elements.turnIndicator) {
        if (isMyTurn) {
            elements.turnIndicator.textContent = "YOUR TURN! PLAY A LEGAL CARD";
            elements.turnIndicator.style.color = "#00e676";
            startTimer();
        } else {
            const p = playersMap[currentTurnId];
            const activeName = (p?.name || "PLAYER") + (isAiSeat(p) ? " (AI)" : "");
            elements.turnIndicator.textContent = `${activeName.toUpperCase()}'S TURN...`;
            elements.turnIndicator.style.color = "#ffd700";
            stopTimer();
        }
    }

    if (elements.infoSuit) {
        elements.infoSuit.textContent = gameState.currSuit === "ANY" ? "ANY SUIT" : `${getSuitSymbol(gameState.currSuit)} ${gameState.currSuit}`;
    }
    if (elements.infoVal) {
        elements.infoVal.textContent = gameState.currHighestVal > -1 ? `${getValueString(gameState.currHighestVal)} (${gameState.currHighestVal})` : "None";
    }
    if (elements.infoRound) elements.infoRound.textContent = (gameState.roundNum || 1).toString();

    renderScoreboard(room);

    let myIndex = playersList.findIndex(p => p.id === localPlayerId);
    if (myIndex === -1) myIndex = 0;
    const leftPlayer = playersList[(myIndex + 1) % 4];
    const topPlayer = playersList[(myIndex + 2) % 4];
    const rightPlayer = playersList[(myIndex + 3) % 4];
    renderOpponentSeat(elements.leftCardsCount, leftPlayer, gameState);
    renderOpponentSeat(elements.topCardsCount, topPlayer, gameState);
    renderOpponentSeat(elements.rightCardsCount, rightPlayer, gameState);

    const myHand = (gameState.hands && gameState.hands[localPlayerId]) ? gameState.hands[localPlayerId] : [];
    if (elements.myCards) {
        elements.myCards.innerHTML = "";
        myHand.forEach((card, idx) => {
            const isRed = (card.suit === "Hearts" || card.suit === "Diamonds");
            const isPlayable = isMyTurn && checkValidPlay(idx, myHand, gameState);
            const cardEl = document.createElement("div");
            cardEl.className = `card-item ${isRed ? 'red' : ''} ${isPlayable ? 'playable' : ''}`;
            cardEl.innerHTML = `
                <div style="font-size:0.75rem; font-weight:800;">${getValueString(card.value)}</div>
                <div class="card-label">${getSuitSymbol(card.suit)}</div>
                <div class="card-suit-icon">${getSuitSymbol(card.suit)}</div>
            `;
            if (isPlayable) {
                cardEl.addEventListener("click", () => handleCardClick(idx, room));
            }
            elements.myCards.appendChild(cardEl);
        });
    }
    if (elements.handCount) elements.handCount.textContent = myHand.length.toString();

    if (elements.playedCardsZone) {
        elements.playedCardsZone.innerHTML = "";
        const tableCards = gameState.table || [];
        tableCards.forEach(card => {
            const isRed = (card.suit === "Hearts" || card.suit === "Diamonds");
            const container = document.createElement("div");
            container.className = "played-card-container";
            container.innerHTML = `
                <div class="card-item ${isRed ? 'red' : ''}">
                    <div style="font-size:0.75rem; font-weight:800;">${getValueString(card.value)}</div>
                    <div class="card-label">${getSuitSymbol(card.suit)}</div>
                    <div class="card-suit-icon">${getSuitSymbol(card.suit)}</div>
                </div>
                <div class="played-player-tag">${card.playedByName || 'Player'}</div>
            `;
            elements.playedCardsZone.appendChild(container);
        });
    }
}

function renderScoreboard(room) {
    if (!elements.scoreboardBody) return;
    const playersMap = room.players || {};
    const gs = room.gameState || {};
    const result = gs.result || [];
    const rows = Object.values(playersMap)
        .sort((a, b) => ((gs.hands?.[a.id] || []).length) - ((gs.hands?.[b.id] || []).length))
        .map(p => {
            const left = (gs.hands?.[p.id] || []).length;
            const rankIdx = result.indexOf(p.id);
            const badge = rankIdx === 0 ? "🥇" : rankIdx === 1 ? "🥈" : "";
            const ai = isAiSeat(p) ? '<span class="bot-badge">AI</span>' : "";
            return `<li class="score-row ${p.id === gs.currentTurnPlayerId ? 'active' : ''}">
                <span>${badge} ${p.name} ${ai}</span><span>${left} card${left === 1 ? '' : 's'}</span>
            </li>`;
        }).join("");
    elements.scoreboardBody.innerHTML = rows;
}

function checkValidPlay(idx, hand, gameState) {
    if (!hand || idx < 0 || idx >= hand.length) return false;
    if (gameState.firstRound && gameState.turnInRound === 0) {
        return hand[idx].suit === "Spades" && hand[idx].value === 14;
    }
    if (gameState.turnInRound === 0) return true;
    const leadSuit = gameState.leadSuit || gameState.currSuit;
    const canFollowSuit = !thul(leadSuit, hand);
    if (canFollowSuit) return hand[idx].suit === leadSuit;
    return true;
}

function renderOpponentSeat(container, player, gameState) {
    if (!container || !player) return;
    container.innerHTML = "";
    const parentSlot = container.parentElement;
    if (parentSlot) {
        const badge = parentSlot.querySelector(".player-badge");
        if (badge) {
            const pHand = (gameState.hands && gameState.hands[player.id]) ? gameState.hands[player.id] : [];
            const isTurn = gameState.currentTurnPlayerId === player.id;
            const aiTag = isAiSeat(player) ? " 🤖" : "";
            badge.textContent = `${player.name}${aiTag} (${pHand.length}) ${isTurn ? '⏳' : ''}`;
            badge.classList.toggle("active-turn", isTurn);
        }
    }
    const count = (gameState.hands && gameState.hands[player.id]) ? gameState.hands[player.id].length : 0;
    for (let i = 0; i < Math.min(count, 13); i++) {
        const back = document.createElement("div");
        back.className = "mini-card-back";
        container.appendChild(back);
    }
}

function autoPlayTimeout() {
    if (!currentRoomId) return;
    get(ref(db, `rooms/${currentRoomId}`)).then(snapshot => {
        if (!snapshot.exists()) return;
        const room = snapshot.val();
        if (room.status !== "playing") return;
        const gameState = room.gameState;
        if (gameState.currentTurnPlayerId !== localPlayerId) return;
        const myHand = gameState.hands[localPlayerId] || [];
        let validIndices = [];
        for (let i = 0; i < myHand.length; i++) {
            if (checkValidPlay(i, myHand, gameState)) validIndices.push(i);
        }
        if (validIndices.length === 0) {
            for (let i = 0; i < myHand.length; i++) validIndices.push(i);
        }
        if (validIndices.length > 0) handleCardClick(validIndices[0], room);
    });
}

async function handleCardClick(cardIndex, room) {
    const gameState = room.gameState;
    if (!gameState || gameState.currentTurnPlayerId !== localPlayerId) return;
    const wasLeading = (gameState.turnInRound || 0) === 0;
    const card = (gameState.hands[localPlayerId] || [])[cardIndex];
    if (!card) return;
    const events = applyMove(gameState, room.players || {}, localPlayerId, humanUserName, cardIndex);
    if (events === null) return;
    gameState.moveHistory = (gameState.moveHistory || []).concat([{ by: localPlayerId, card: { value: card.value, suit: card.suit, name: card.name }, led: wasLeading, round: gameState.roundNum }]);
    sfx.play();
    await update(ref(db, `rooms/${currentRoomId}/gameState`), gameState);
}

// ==========================================
// SETTINGS / PANELS
// ==========================================
if (elements.settingsBtn && elements.settingsPanel) {
    elements.settingsBtn.addEventListener("click", () => { sfx.click(); elements.settingsPanel.classList.toggle("hidden"); });
}
if (elements.scoreboardBtn && elements.scoreboardPanel) {
    elements.scoreboardBtn.addEventListener("click", () => { sfx.click(); elements.scoreboardPanel.classList.toggle("hidden"); });
}
document.addEventListener("click", (e) => {
    if (elements.settingsPanel && !elements.settingsPanel.classList.contains("hidden") &&
        !elements.settingsPanel.contains(e.target) && e.target !== elements.settingsBtn) {
        elements.settingsPanel.classList.add("hidden");
    }
});
const soundToggle = document.getElementById("sound-toggle");
if (soundToggle) soundToggle.addEventListener("change", () => { settings.sound = soundToggle.checked; saveSettings(); applySettings(); });
const animToggle = document.getElementById("anim-toggle");
if (animToggle) animToggle.addEventListener("change", () => { settings.anim = animToggle.checked; saveSettings(); applySettings(); });
const themeSelect = document.getElementById("theme-select");
if (themeSelect) themeSelect.addEventListener("change", () => { settings.theme = themeSelect.value; saveSettings(); applySettings(); });
if (elements.muteBtn) elements.muteBtn.addEventListener("click", () => { settings.sound = !settings.sound; saveSettings(); applySettings(); });
document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", () => { const m = btn.closest(".modal-overlay"); if (m) m.classList.add("hidden"); });
});

if (elements.usernameInput) elements.usernameInput.value = humanUserName === "Player 1" ? "" : humanUserName;
applySettings();
