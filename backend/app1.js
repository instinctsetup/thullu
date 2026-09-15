import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, push, onValue, remove, update, onDisconnect, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// BACKEND CLOUD ROUTING MAP
const firebaseConfig = {
//USE YOUR CONFIG 
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


onValue(ref(db, ".info/connected"), (snap) => {
    const dot = document.getElementById("conn-dot");
    const text = document.getElementById("conn-text");
    const isOnline = snap.val() === true;
    if (dot) dot.style.background = isOnline ? "#00e676" : "#ff2a4b";
    if (text) text.textContent = isOnline ? "Online" : "Reconnecting...";
});

// Local Player Identity
const localPlayerId = "p_" + Math.random().toString(36).substring(2, 9);
let humanUserName = "Player 1";
let currentRoomId = "";
let roomListener = null;

// ==========================================
// CORE LOGIC FUNCTIONS 
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
        return 0; // Spades
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

        // Remove winner node from active circular list playingOrder
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
    errorMenuBtn: document.getElementById("error-menu-btn")
};

let timerInterval = null;
let timerSeconds = 15;
let lastShownEventSeq = -1;

function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            if (key === screenKey) {
                screens[key].classList.remove("hidden");
            } else {
                screens[key].classList.add("hidden");
            }
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
        setTimeout(() => {
            if (elements.rule10Alert) elements.rule10Alert.classList.add("hidden");
        }, 4500);
    }
    
    if (elements.thulluBanner && message.includes("THUL")) {
        elements.thulluBanner.textContent = message;
        elements.thulluBanner.classList.remove("hidden");
        setTimeout(() => {
            if (elements.thulluBanner) elements.thulluBanner.classList.add("hidden");
        }, 3000);
    }
}

// isNetwork = true -> a player disconnected mid-session (shows "NETWORK ERROR")
// isNetwork = false -> someone chose to leave on purpose (shows "TABLE DISBANDED")
function showDisbandError(reason, isNetwork) {
    stopTimer();
    detachRoomListener();

    if (elements.errorTitle) {
        elements.errorTitle.textContent = isNetwork ? "⚠️ NETWORK ERROR" : "TABLE DISBANDED";
    }
    if (elements.errorMessage) {
        elements.errorMessage.textContent = reason || "A player left or disconnected from the table. The game has ended.";
    }
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

function stopTimer() {
    clearInterval(timerInterval);
}

function detachRoomListener() {
    if (currentRoomId && roomListener) {
        off(ref(db, `rooms/${currentRoomId}`), 'value', roomListener);
        roomListener = null;
    }
    currentRoomId = "";
    lastShownEventSeq = -1; 
}

// ==========================================
// REALTIME FIREBASE CONTROLLER
// ==========================================

if (elements.createRoomBtn) {
    elements.createRoomBtn.addEventListener("click", async () => {
        const name = elements.usernameInput.value.trim() || "Player 1";
        humanUserName = name;
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        currentRoomId = roomId;

        const roomData = {
            roomId: roomId,
            status: "waiting",
            hostId: localPlayerId,
            disbandReason: "",
            players: {
                [localPlayerId]: { id: localPlayerId, name: name, seat: 0 }
            }
        };

        const roomRef = ref(db, `rooms/${roomId}`);
        await set(roomRef, roomData);

        onDisconnect(ref(db, `rooms/${roomId}/status`)).set("disbanded");
        onDisconnect(ref(db, `rooms/${roomId}/disbandReason`)).set(`Connection to ${name} (Host) was lost. Game ended.`);
        onDisconnect(ref(db, `rooms/${roomId}/disbandType`)).set("network");
        onDisconnect(ref(db, `rooms/${roomId}/players/${localPlayerId}`)).remove();

        listenToRoom(roomId);
        showScreen("lobby");
    });
}

if (elements.joinBtn) {
    elements.joinBtn.addEventListener("click", async () => {
        const name = elements.usernameInput.value.trim() || "Player 1";
        const code = elements.roomIdInput.value.trim().toUpperCase();
        if (!code) {
            alert("Please enter a valid 6-Letter Room Code!");
            return;
        }

        humanUserName = name;
        const roomRef = ref(db, `rooms/${code}`);
        const snapshot = await get(roomRef);

        if (!snapshot.exists()) {
            alert("Room Code not found!");
            return;
        }

        const room = snapshot.val();
        if (room.status !== "waiting") {
            alert("Table is no longer accepting players (Game in progress or disbanded).");
            return;
        }

        const existingPlayers = room.players ? Object.values(room.players) : [];
        if (existingPlayers.length >= 4) {
            alert("Table is full! (4/4 players already seated).");
            return;
        }

        const seatNum = existingPlayers.length;
        const playerRef = ref(db, `rooms/${code}/players/${localPlayerId}`);
        await set(playerRef, { id: localPlayerId, name: name, seat: seatNum });

        onDisconnect(ref(db, `rooms/${code}/status`)).set("disbanded");
        onDisconnect(ref(db, `rooms/${code}/disbandReason`)).set(`Connection to ${name} was lost. Game ended.`);
        onDisconnect(ref(db, `rooms/${code}/disbandType`)).set("network");
        onDisconnect(playerRef).remove();

        currentRoomId = code;
        listenToRoom(code);
        showScreen("lobby");
    });
}

if (elements.startGameBtn) {
    elements.startGameBtn.addEventListener("click", async () => {
        if (!currentRoomId) return;

        const roomRef = ref(db, `rooms/${currentRoomId}`);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) return;

        const room = snapshot.val();
        const playersList = Object.values(room.players || {});
        if (playersList.length < 4) {
            alert("Must have exactly 4 players sitting down to start!");
            return;
        }

        // Run C++ logic initialization
        const deck = initialize_card();
        const hands = distributeCards(playersList.map(p => p.id), deck);
        
        Object.keys(hands).forEach(pId => sortHand(hands[pId]));

    
        const playingOrder = OrderOfPlaying(playersList, hands);

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
            roundNum: 1
        };

        await update(roomRef, {
            status: "playing",
            gameState: initialGameState
        });
    });
}

function leaveAndDisbandTable() {
    if (currentRoomId) {
        update(ref(db, `rooms/${currentRoomId}`), {
            status: "disbanded",
            disbandReason: `${humanUserName} left the table on purpose.`,
            disbandType: "left"
        });
    }
    detachRoomListener();
    stopTimer();
    showScreen("register");
}

if (elements.leaveRoomBtn) elements.leaveRoomBtn.addEventListener("click", leaveAndDisbandTable);
if (elements.inGameLeaveBtn) elements.inGameLeaveBtn.addEventListener("click", leaveAndDisbandTable);
if (elements.returnMainMenuBtn) {
    elements.returnMainMenuBtn.addEventListener("click", () => {
        detachRoomListener();
        showScreen("register");
    });
}

if (elements.errorMenuBtn) {
    elements.errorMenuBtn.addEventListener("click", () => {
        detachRoomListener();
        showScreen("register");
    });
}

function listenToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    roomListener = onValue(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            showDisbandError("This table no longer exists.", true);
            return;
        }

        const room = snapshot.val();

        if (room.status === "disbanded") {
            showDisbandError(room.disbandReason || "A player left the game.", room.disbandType === "network");
            return;
        }

        const playersList = room.players ? Object.values(room.players) : [];

        if (room.status === "waiting") {
            if (playersList.length < 1) {
                showDisbandError("Everyone left the table.", false);
                return;
            }

            if (elements.displayRoomId) elements.displayRoomId.textContent = `ROOM CODE: ${roomId}`;
            if (elements.countLbl) elements.countLbl.textContent = playersList.length.toString();

            if (elements.playerList) {
                elements.playerList.innerHTML = playersList.map(p => `
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
                    if (playersList.length === 4) {
                        elements.startGameBtn.classList.remove("hidden");
                        elements.startGameBtn.textContent = "🚀 Launch 4-Player Tournament";
                    } else {
                        elements.startGameBtn.classList.add("hidden");
                    }
                }
            } else {
                if (elements.leaderControls) elements.leaderControls.classList.add("hidden");
            }
            showScreen("lobby");
            return;
        }

        if (room.status === "playing") {
            if (playersList.length < 4) {
                update(ref(db, `rooms/${roomId}`), {
                    status: "disbanded",
                    disbandReason: `A player lost connection mid-game. The game has ended immediately.`,
                    disbandType: "network"
                });
                return;
            }

            showScreen("game");
            renderGameScreen(room);
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

  
    if (gameState.result && gameState.result.length >= 2) {
        stopTimer();
        showScreen("results");
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

    // Turn Indicator
    if (elements.turnIndicator) {
        if (isMyTurn) {
            elements.turnIndicator.textContent = "YOUR TURN! PLAY A LEGAL CARD";
            elements.turnIndicator.style.color = "#00e676";
            startTimer();
        } else {
            const activeName = playersMap[currentTurnId]?.name || "PLAYER";
            elements.turnIndicator.textContent = `${activeName.toUpperCase()}'S TURN...`;
            elements.turnIndicator.style.color = "#ffd700";
            stopTimer();
        }
    }

    // Table Information Bar
    if (elements.infoSuit) {
        elements.infoSuit.textContent = gameState.currSuit === "ANY" ? "ANY SUIT" : `${getSuitSymbol(gameState.currSuit)} ${gameState.currSuit}`;
    }
    if (elements.infoVal) {
        elements.infoVal.textContent = gameState.currHighestVal > -1 ? `${getValueString(gameState.currHighestVal)} (${gameState.currHighestVal})` : "None";
    }
    if (elements.infoRound) {
        elements.infoRound.textContent = (gameState.roundNum || 1).toString();
    }

    // Map Relative Seats (Local User at Bottom)
    let myIndex = playersList.findIndex(p => p.id === localPlayerId);
    if (myIndex === -1) myIndex = 0;

    const leftPlayer = playersList[(myIndex + 1) % 4];
    const topPlayer = playersList[(myIndex + 2) % 4];
    const rightPlayer = playersList[(myIndex + 3) % 4];

    renderOpponentSeat(elements.leftCardsCount, leftPlayer, gameState);
    renderOpponentSeat(elements.topCardsCount, topPlayer, gameState);
    renderOpponentSeat(elements.rightCardsCount, rightPlayer, gameState);

    // Render User Hand Deck
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

    if (elements.handCount) {
        elements.handCount.textContent = myHand.length.toString();
    }

    // Render Center Played Cards Zone with Player Names
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

function checkValidPlay(idx, hand, gameState) {
    if (!hand || idx < 0 || idx >= hand.length) return false;

    // Leader of Round 1 must play the Ace of Spades (only whoever holds it leads).
    if (gameState.firstRound && gameState.turnInRound === 0) {
        return hand[idx].suit === "Spades" && hand[idx].value === 14;
    }

    // Any other trick leader can open with whatever card they want.
    if (gameState.turnInRound === 0) {
        return true;
    }

    // Following a trick: you must match the lead suit IF you have one.
    // If you don't have the lead suit at all, that's a "Thul" — any card is legal.
    const leadSuit = gameState.leadSuit || gameState.currSuit;
    const canFollowSuit = !thul(leadSuit, hand);
    if (canFollowSuit) {
        return hand[idx].suit === leadSuit;
    }
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
            badge.textContent = `${player.name} (${pHand.length}) ${isTurn ? '⏳' : ''}`;
            if (isTurn) {
                badge.classList.add("active-turn");
            } else {
                badge.classList.remove("active-turn");
            }
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
            if (checkValidPlay(i, myHand, gameState)) {
                validIndices.push(i);
            }
        }
        if (validIndices.length === 0) {
            for (let i = 0; i < myHand.length; i++) validIndices.push(i);
        }
        if (validIndices.length > 0) {
            handleCardClick(validIndices[0], room);
        }
    });
}

// 100% Faithful Execution of Round logic from logics.cpp
async function handleCardClick(cardIndex, room) {
    const gameState = room.gameState;
    const playersMap = room.players || {};
    const myHand = gameState.hands[localPlayerId];
    if (!myHand || cardIndex < 0 || cardIndex >= myHand.length) return;

    // Snapshot of the FULL hand before the card leaves it — thul() must always be judged
    // against everything the player was holding, never against the hand after playing.
    const handBeforePlay = myHand.slice();
    const pendingEvents = [];

    const playedCard = myHand.splice(cardIndex, 1)[0];
    playedCard.playedBy = localPlayerId;
    playedCard.playedByName = humanUserName;

    let playingOrder = gameState.playingOrder || [];
    let currentTurnIndex = playingOrder.indexOf(localPlayerId);
    if (currentTurnIndex === -1) currentTurnIndex = 0;

    let turnInRound = gameState.turnInRound || 0;
    let leadSuit = gameState.leadSuit || "Spades";
    let currHighestVal = gameState.currHighestVal;
    let highestPlayerId = gameState.highestPlayerId || localPlayerId;
    let firstRound = gameState.firstRound;
    let roundNum = gameState.roundNum || 1;
    let table = gameState.table || [];
    let contd = gameState.contd || [];

    if (firstRound) {
        // ROUND 1 LOGIC (logics.cpp lines 415-496)
        if (turnInRound === 0) {
            if (playedCard.value > currHighestVal) {
                highestPlayerId = localPlayerId;
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
                // Round 1 Thullu -> Discard table cards (First Round Grace: no pickup penalty)
                table.push(playedCard);
                pendingEvents.push(`🔥 THUL! ${humanUserName} had no ${leadSuit} — Round 1 grace, cards discarded safely.`);
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
                    highestPlayerId = localPlayerId;
                    currHighestVal = playedCard.value;
                }
                table.push(playedCard);

                const activeCount = playingOrder.length;
                if (turnInRound === activeCount - 1) {
                    // Round 1 Complete!
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
        // SUBSEQUENT ROUNDS LOGIC (logics.cpp lines 498-613)
        if (turnInRound === 0) {
            // Check Rule 10 before lead turn if hand was empty
            if (myHand.length === 0) {
                let giverId = getRandom(localPlayerId, gameState);
                if (giverId) {
                    pendingEvents.push(`🎴 Rule 10: ${humanUserName} had no cards, so ${playersMap[giverId]?.name || "a player"} handed one over.`);
                }
                if (giverId && gameState.hands[giverId].length === 0) {
                    if (!contd.includes(giverId)) contd.push(giverId);
                }
                checkWinner(gameState, playersMap);
                if (gameState.result && gameState.result.length >= 2) {
                    applyPendingEvents(gameState, pendingEvents);
                    await update(ref(db, `rooms/${currentRoomId}/gameState`), gameState);
                    return;
                }
            }

            if (playedCard.value > currHighestVal) {
                highestPlayerId = localPlayerId;
                currHighestVal = playedCard.value;
            }
            leadSuit = playedCard.suit;
            gameState.currSuit = leadSuit;
            gameState.leadSuit = leadSuit;
            table.push(playedCard);

            if (myHand.length === 0) {
                if (!contd.includes(localPlayerId)) contd.push(localPlayerId);
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
                // Thullu penalty! All table cards go to highest lead card holder
                table.push(playedCard);
                const pickupName = playersMap[highestPlayerId]?.name || "the trick winner";
                pendingEvents.push(`🔥 THUL! ${humanUserName} had no ${leadSuit} — ${pickupName} picks up the whole table!`);
                if (myHand.length === 0) {
                    if (!contd.includes(localPlayerId)) contd.push(localPlayerId);
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
                
                // Rule 10 check for next lead player if empty hand
                let nextLeadHand = gameState.hands[highestPlayerId] || [];
                if (nextLeadHand.length === 0) {
                    let gId = getRandom(highestPlayerId, gameState);
                    if (gId) {
                        pendingEvents.push(`🎴 Rule 10: ${playersMap[highestPlayerId]?.name || "The next leader"} had no cards, so ${playersMap[gId]?.name || "a player"} handed one over.`);
                    }
                    checkWinner(gameState, playersMap);
                }
            } else {
                if (playedCard.value > currHighestVal) {
                    highestPlayerId = localPlayerId;
                    currHighestVal = playedCard.value;
                }
                table.push(playedCard);

                if (myHand.length === 0) {
                    if (!contd.includes(localPlayerId)) contd.push(localPlayerId);
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

                    let nextLeadHand = gameState.hands[highestPlayerId] || [];
                    if (nextLeadHand.length === 0) {
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

    // Push updated game state to Firebase DB for all 4 clients
    applyPendingEvents(gameState, pendingEvents);
    await update(ref(db, `rooms/${currentRoomId}/gameState`), gameState);
}
