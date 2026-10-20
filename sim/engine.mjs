// AUTO-EXTRACTED from public/app.js - pure game logic + bots (no DOM/Firebase)
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
// PACING: visible trick pause ("settling")
// When a trick completes, the table cards stay on screen for TRICK_PAUSE_MS so
// everyone can see what was played. Only then does the executor settle the
// trick: THUL pickup / burn, round advance, winner check, Rule 10 - the exact
// steps the original applied immediately in applyMove.
// ==========================================
const TRICK_PAUSE_MS = 2200;

function settleTrickState(gameState, playersMap) {
    const s = gameState.settling;
    if (!s) return [];
    const pendingEvents = [];
    let playingOrder = gameState.playingOrder || [];
    const highestPlayerId = s.highestPlayerId;

    if (s.kind === "thul") {
        const targetHand = gameState.hands[highestPlayerId] || [];
        thulAdd(targetHand, gameState.table || []);
    }
    gameState.table = [];
    gameState.firstRound = false;
    gameState.currSuit = "ANY";
    gameState.roundNum = (gameState.roundNum || 1) + 1;
    gameState.highestPlayerId = highestPlayerId;
    gameState.currentTurnPlayerId = highestPlayerId;
    gameState.turnInRound = 0;
    gameState.currHighestVal = -1;
    delete gameState.settling;
    checkWinner(gameState, playersMap);
    if ((gameState.result || []).length < 2) {
        const active = gameState.playingOrder || [];
        if (active.length && !active.includes(gameState.currentTurnPlayerId)) {
            gameState.currentTurnPlayerId = nextActiveAfter(playingOrder, highestPlayerId, active);
        }
    }
    // Rule 10 (Last Stand) for an empty-handed next leader - faithful port
    const nextLeadHand = gameState.hands[highestPlayerId] || [];
    if (nextLeadHand.length === 0 && (gameState.playingOrder || []).includes(highestPlayerId)) {
        const gId = getRandom(highestPlayerId, gameState);
        if (gId) {
            pendingEvents.push(`🎴 Rule 10: ${playersMap[highestPlayerId]?.name || "The next leader"} had no cards, so ${playersMap[gId]?.name || "a player"} handed one over.`);
        }
        checkWinner(gameState, playersMap);
    }
    applyPendingEvents(gameState, pendingEvents);
    return pendingEvents;
}

// Only the room executor settles (single writer). Deduped by settleSeq so both
// the mover's client and the listener can request the same settle safely.
// ==========================================
// MOVE ENGINE (identical rules to the original handleCardClick,
// parameterized so humans AND bots execute the exact same move logic)
// ==========================================
function applyMove(gameState, playersMap, playerId, playerName, cardIndex) {
    const myHand = gameState.hands[playerId];
    if (!myHand || cardIndex < 0 || cardIndex >= myHand.length) return null;
    if (gameState.settling) return null; // trick is in its visible pause - no moves until it settles

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
                gameState.table = table;
                gameState.highestPlayerId = highestPlayerId;
                gameState.settleSeq = (gameState.settleSeq || 0) + 1;
                gameState.settling = { kind: "round1", highestPlayerId: highestPlayerId, settleSeq: gameState.settleSeq };
            } else {
                if (playedCard.value > currHighestVal) {
                    highestPlayerId = playerId;
                    currHighestVal = playedCard.value;
                }
                table.push(playedCard);
                const activeCount = playingOrder.length;
                if (turnInRound === activeCount - 1) {
                    gameState.table = table;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.settleSeq = (gameState.settleSeq || 0) + 1;
                    gameState.settling = { kind: "round1", highestPlayerId: highestPlayerId, settleSeq: gameState.settleSeq };
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
                gameState.table = table;
                gameState.highestPlayerId = highestPlayerId;
                gameState.contd = contd;
                gameState.settleSeq = (gameState.settleSeq || 0) + 1;
                gameState.settling = { kind: "thul", highestPlayerId: highestPlayerId, settleSeq: gameState.settleSeq };
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
                    gameState.table = table;
                    gameState.highestPlayerId = highestPlayerId;
                    gameState.contd = contd;
                    gameState.settleSeq = (gameState.settleSeq || 0) + 1;
                    gameState.settling = { kind: "burn", highestPlayerId: highestPlayerId, settleSeq: gameState.settleSeq };
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

// Easy bot: uniform random legal card (baseline difficulty).
function botChooseCardEasy(gameState, botId) {
    const hand = gameState.hands[botId] || [];
    const legal = botLegalIndices(hand, gameState);
    if (!legal.length) return -1;
    return legal[Math.floor(Math.random() * legal.length)];
}

// Hard bot: everything the medium bot does, plus
//  - unseen-card estimation per suit (played + own hand vs 13)
//  - probabilistic THUL risk when a later player may be void (not just proven void)
//  - high-card liability awareness: don't sit on the highest remaining lead-suit
//    card when the trick may break
//  - endgame tuning: public hand counts steer lead choice when someone is close
//    to going out
function botChooseCardHard(gameState, botId, playersMap) {
    const hand = gameState.hands[botId] || [];
    const legal = botLegalIndices(hand, gameState);
    if (legal.length === 0) return -1;
    if (legal.length === 1) return legal[0];

    const K = buildBotKnowledge(gameState);
    const turnInRound = gameState.turnInRound || 0;
    const leadSuit = gameState.leadSuit || gameState.currSuit;
    const order = gameState.playingOrder || [];
    const myIdx = order.indexOf(botId);
    const suits = ["Spades", "Hearts", "Diamonds", "Clubs"];

    const myCount = {};
    for (const s of suits) myCount[s] = 0;
    for (const c of hand) myCount[c.suit]++;

    const unseen = {};
    for (const s of suits) unseen[s] = 13 - (K.playedBySuit[s] || 0) - myCount[s];

    const others = order.filter(p => p !== botId);
    const laterPlayers = [];
    for (let k = 1; k < order.length - turnInRound; k++) {
        const pid = order[(myIdx + k) % order.length];
        if (pid !== botId) laterPlayers.push(pid);
    }
    const handSize = (pid) => ((gameState.hands || {})[pid] || []).length;
    const minOppCards = others.length ? Math.min(...others.map(handSize)) : 99;

    // Probability estimate that a player still to act is void in the lead suit
    const voidRisk = (pid, suit) => {
        if (K.voids[pid] && K.voids[pid][suit]) return 1;
        const u = unseen[suit];
        if (u <= 0) return 0.9;              // no cards of this suit left for others
        if (u <= 2) return handSize(pid) <= 4 ? 0.5 : 0.3;
        if (u <= 5) return handSize(pid) <= 3 ? 0.3 : 0.12;
        return 0.03;
    };
    const thulRisk = laterPlayers.length
        ? Math.max(...laterPlayers.map(pid => voidRisk(pid, leadSuit)))
        : 0;

    // highest remaining card of a suit (played cards removed); do I hold it?
    const topRemaining = {};
    for (const s of suits) {
        let top = -1;
        for (let v = 14; v >= 2; v--) {
            const playedCount = (K.playedValues && K.playedValues[s] && K.playedValues[s][v]) || 0;
            if (playedCount > 0) continue;
            top = v; break;
        }
        topRemaining[s] = top;
    }
    const myHigh = {};
    for (const s of suits) {
        myHigh[s] = -1;
        for (const c of hand) if (c.suit === s && c.value > myHigh[s]) myHigh[s] = c.value;
    }
    const byValueAsc = (a, b) => hand[a].value - hand[b].value;

    if (turnInRound === 0) {
        // LEADING
        const suitsMap = {};
        for (const i of legal) {
            const s = hand[i].suit;
            if (!suitsMap[s]) suitsMap[s] = [];
            suitsMap[s].push(i);
        }
        let bestSuit = null, bestScore = -1e9;
        for (const s of Object.keys(suitsMap)) {
            const someoneVoid = others.some(pid => K.voids[pid] && K.voids[pid][s]);
            const voidP = others.length ? Math.max(...others.map(pid => voidRisk(pid, s))) : 0;
            let score = suitsMap[s].length * 2;                 // shed from the longest suit
            if (someoneVoid) score -= 120;                      // proven void: never feed it
            score -= voidP * 40;                                // probabilistic void risk
            // liability: holding the top remaining card of this suit while it may break
            if (myHigh[s] >= topRemaining[s] && myHigh[s] > 0) score -= 25 * voidP + 8;
            score -= Math.min(...suitsMap[s].map(i => hand[i].value)) * 0.1; // lead low
            if (minOppCards <= 2) score += unseen[s] * 1.5;     // endgame: low-variance suits
            if (score > bestScore) { bestScore = score; bestSuit = s; }
        }
        const choices = (bestSuit ? suitsMap[bestSuit] : legal).sort(byValueAsc);
        return choices[0];
    }

    const canFollow = !thul(leadSuit, hand);
    if (!canFollow) {
        // THUL: dump from the shortest suit; prefer dumping liability (high cards)
        const suitsMap = {};
        for (const i of legal) {
            const s = hand[i].suit;
            if (!suitsMap[s]) suitsMap[s] = [];
            suitsMap[s].push(i);
        }
        let dumpSuit = null, bestDump = -1e9;
        for (const s of Object.keys(suitsMap)) {
            const hi = Math.max(...suitsMap[s].map(i => hand[i].value));
            const score = -suitsMap[s].length * 10 + hi * 0.5;
            if (score > bestDump) { bestDump = score; dumpSuit = s; }
        }
        return suitsMap[dumpSuit].sort((a, b) => hand[b].value - hand[a].value)[0];
    }

    // FOLLOWING SUIT
    const currHighest = gameState.currHighestVal;
    const followIdx = legal.slice().sort(byValueAsc);
    const winners = followIdx.filter(i => hand[i].value > currHighest);
    const risky = thulRisk >= 0.45;
    if (risky) {
        // trick may break after me: never sit on top - duck with the highest loser (sheds liability)
        const losers = followIdx.filter(i => hand[i].value < currHighest);
        return (losers.length ? losers[losers.length - 1] : followIdx[followIdx.length - 1]);
    }
    if (winners.length) return winners[0]; // safe burn: win as cheaply as possible
    return followIdx[followIdx.length - 1]; // cannot win: dump the highest (shed liability)
}


export { shuffleArray, initialize_card, distributeCards, AceOfSpades, OrderOfPlaying, cardCmp, sortHand, checkValid, thul, thulAdd, applyPendingEvents, checkWinner, getRandom, nextActiveAfter, applyMove, settleTrickState, buildBotKnowledge, botLegalIndices, botChooseCard, botChooseCardEasy, botChooseCardHard };
