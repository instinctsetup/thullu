import * as E from './engineB.mjs';
console.log = () => {}; // silence engine checkWinner logs
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

function playGame(policies, track) {
    const playersList = [
        { id: "p0", name: "P0", seat: 0 }, { id: "p1", name: "P1", seat: 1 },
        { id: "p2", name: "P2", seat: 2 }, { id: "p3", name: "P3", seat: 3 }
    ];
    const playersMap = Object.fromEntries(playersList.map(p => [p.id, p]));
    const deck = E.initialize_card();
    const hands = E.distributeCards(playersList.map(p => p.id), deck);
    Object.keys(hands).forEach(id => E.sortHand(hands[id]));
    const playingOrder = E.OrderOfPlaying(playersList, hands);
    const gs = {
        firstRound: true, currSuit: "Spades", leadSuit: "Spades", turnInRound: 0,
        currHighestVal: -1, highestPlayerId: playingOrder[0], currentTurnPlayerId: playingOrder[0],
        playingOrder, table: [], hands, contd: [], result: [], roundNum: 1, moveHistory: []
    };
    let steps = 0;
    while ((gs.result || []).length < 2 && steps < 4000) {
        steps++;
        if (gs.settling) {
            const winner = gs.settling.highestPlayerId, kind = gs.settling.kind;
            E.settleTrickState(gs, playersMap);
            if (kind === "thul" && track) track.pickups[winner] = (track.pickups[winner] || 0) + 1;
            continue;
        }
        const pid = gs.currentTurnPlayerId;
        const pol = policies[pid];
        const chooser = pol === "easy" ? E.botChooseCardEasy : pol === "medium" ? E.botChooseCard : E.botChooseCardHardB;
        const idx = chooser(gs, pid, playersMap);
        if (idx < 0) break;
        const wasLeading = (gs.turnInRound || 0) === 0;
        const card = gs.hands[pid][idx];
        const r = E.applyMove(gs, playersMap, pid, playersMap[pid].name, idx);
        if (r === null) { log("REJECTED MOVE - BUG", pid, idx); break; }
        gs.moveHistory = (gs.moveHistory || []).concat([{ by: pid, card: { value: card.value, suit: card.suit, name: card.name }, led: wasLeading, round: gs.roundNum }]);
    }
    return { result: gs.result || [], moves: steps, rounds: gs.roundNum };
}

function measure(label, seatPolicy, otherPolicy, N) {
    let rank1 = 0, top2 = 0, totMoves = 0, pickups = 0, finished = 0;
    for (let g = 0; g < N; g++) {
        const policies = { p0: seatPolicy, p1: otherPolicy, p2: otherPolicy, p3: otherPolicy };
        const track = { pickups: {} };
        const { result, moves } = playGame(policies, track);
        if (result.length >= 2) finished++;
        if (result[0] === "p0") rank1++;
        if (result.includes("p0")) top2++;
        pickups += track.pickups.p0 || 0;
        totMoves += moves;
    }
    log(`${label}: rank1=${(100*rank1/N).toFixed(1)}%  top2=${(100*top2/N).toFixed(1)}%  pile-pickups/game=${(pickups/N).toFixed(2)}  moves/game=${(totMoves/N).toFixed(0)}  (N=${N}, finished=${finished})`);
}

function measureSymmetric(label, policy, N) {
    // all four seats same policy: sanity check ~25% rank1 each
    let wins = [0,0,0,0];
    for (let g = 0; g < N; g++) {
        const { result } = playGame({ p0: policy, p1: policy, p2: policy, p3: policy });
        if (result[0]) wins[["p0","p1","p2","p3"].indexOf(result[0])]++;
    }
    log(`${label}: rank1 by seat = ${wins.map(w => (100*w/N).toFixed(1) + "%").join(" / ")} (expect ~25% each)`);
}

const N = parseInt(process.argv[2] || "500");
measureSymmetric("sanity all-random", "easy", N);
measure("MEDIUM (current live bot) vs 3 random", "medium", "easy", N);
measure("HARD (new bot) vs 3 random        ", "hard", "easy", N);
measure("HARD vs 3 MEDIUM                   ", "hard", "medium", N);
measure("MEDIUM vs 3 HARD                   ", "medium", "hard", N);
