(() => {
  const boardElement = document.getElementById('chessBoard');
  const statusElement = document.getElementById('chessStatus');
  const difficultyElement = document.getElementById('chessDifficulty');
  const restartButton = document.getElementById('chessRestart');
  if (!boardElement || !statusElement || !difficultyElement || !restartButton) return;

  const icons = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
  };
  const pieceNames = { K: 'rei branco', Q: 'dama branca', R: 'torre branca', B: 'bispo branco', N: 'cavalo branco', P: 'peão branco',
    k: 'rei preto', q: 'dama preta', r: 'torre preta', b: 'bispo preto', n: 'cavalo preto', p: 'peão preto' };
  const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
  let game;
  let selected = null;
  let legalDestinations = [];
  let thinking = false;
  let finished = false;
  let awardedWin = false;
  let gameToken = 0;

  function newGame() {
    gameToken += 1;
    game = {
      board: [
        'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
        'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
        ...Array(32).fill(null),
        'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
        'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
      ],
      turn: 'w',
      castle: { w: { k: true, q: true }, b: { k: true, q: true } },
      enPassant: null,
      halfMoves: 0
    };
    selected = null;
    legalDestinations = [];
    thinking = false;
    finished = false;
    awardedWin = false;
    statusElement.textContent = 'Sua vez! Você joga com as peças claras.';
    render();
  }

  function colorOf(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'w' : 'b';
  }

  function inside(row, column) {
    return row >= 0 && row < 8 && column >= 0 && column < 8;
  }

  function indexAt(row, column) {
    return row * 8 + column;
  }

  function coordinates(index) {
    return [Math.floor(index / 8), index % 8];
  }

  function squareName(index) {
    const [row, column] = coordinates(index);
    return `${'abcdefgh'[column]}${8 - row}`;
  }

  function copyPosition(position) {
    return {
      board: position.board.slice(),
      turn: position.turn,
      castle: {
        w: { ...position.castle.w },
        b: { ...position.castle.b }
      },
      enPassant: position.enPassant,
      halfMoves: position.halfMoves
    };
  }

  function isSquareAttacked(position, target, attacker) {
    const [targetRow, targetColumn] = coordinates(target);
    for (let index = 0; index < 64; index += 1) {
      const piece = position.board[index];
      if (!piece || colorOf(piece) !== attacker) continue;
      const type = piece.toLowerCase();
      const [row, column] = coordinates(index);
      const rowDistance = targetRow - row;
      const columnDistance = targetColumn - column;

      if (type === 'p' && rowDistance === (attacker === 'w' ? -1 : 1) && Math.abs(columnDistance) === 1) return true;
      if (type === 'n' && ((Math.abs(rowDistance) === 2 && Math.abs(columnDistance) === 1) ||
          (Math.abs(rowDistance) === 1 && Math.abs(columnDistance) === 2))) return true;
      if (type === 'k' && Math.max(Math.abs(rowDistance), Math.abs(columnDistance)) === 1) return true;

      const diagonal = Math.abs(rowDistance) === Math.abs(columnDistance) && rowDistance !== 0;
      const straight = (rowDistance === 0) !== (columnDistance === 0);
      if (!((type === 'b' && diagonal) || (type === 'r' && straight) ||
          (type === 'q' && (diagonal || straight)))) continue;

      const rowStep = Math.sign(rowDistance);
      const columnStep = Math.sign(columnDistance);
      let pathRow = row + rowStep;
      let pathColumn = column + columnStep;
      let blocked = false;
      while (pathRow !== targetRow || pathColumn !== targetColumn) {
        if (position.board[indexAt(pathRow, pathColumn)]) {
          blocked = true;
          break;
        }
        pathRow += rowStep;
        pathColumn += columnStep;
      }
      if (!blocked) return true;
    }
    return false;
  }

  function kingInCheck(position, color) {
    const king = color === 'w' ? 'K' : 'k';
    const kingSquare = position.board.indexOf(king);
    return kingSquare < 0 || isSquareAttacked(position, kingSquare, color === 'w' ? 'b' : 'w');
  }

  function pseudoMoves(position, from) {
    const piece = position.board[from];
    if (!piece) return [];
    const color = colorOf(piece);
    const type = piece.toLowerCase();
    const [row, column] = coordinates(from);
    const moves = [];
    const addTarget = (targetRow, targetColumn, extra = {}) => {
      if (!inside(targetRow, targetColumn)) return false;
      const to = indexAt(targetRow, targetColumn);
      const occupant = position.board[to];
      if (occupant && (colorOf(occupant) === color || occupant.toLowerCase() === 'k')) return false;
      moves.push({ from, to, ...extra });
      return !occupant;
    };

    if (type === 'p') {
      const direction = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promotionRow = color === 'w' ? 0 : 7;
      const oneRow = row + direction;
      if (inside(oneRow, column) && !position.board[indexAt(oneRow, column)]) {
        addTarget(oneRow, column, oneRow === promotionRow ? { promotion: color === 'w' ? 'Q' : 'q' } : {});
        const twoRow = row + direction * 2;
        if (row === startRow && !position.board[indexAt(twoRow, column)]) addTarget(twoRow, column, { doublePawn: true });
      }
      for (const offset of [-1, 1]) {
        const targetColumn = column + offset;
        if (!inside(oneRow, targetColumn)) continue;
        const to = indexAt(oneRow, targetColumn);
        const occupant = position.board[to];
        if (occupant && colorOf(occupant) !== color && occupant.toLowerCase() !== 'k') {
          addTarget(oneRow, targetColumn, oneRow === promotionRow ? { promotion: color === 'w' ? 'Q' : 'q' } : {});
        } else if (to === position.enPassant) {
          moves.push({ from, to, enPassant: true });
        }
      }
      return moves;
    }

    if (type === 'n') {
      for (const [rowStep, columnStep] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        addTarget(row + rowStep, column + columnStep);
      }
      return moves;
    }

    if (type === 'k') {
      for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
        for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
          if (rowStep || columnStep) addTarget(row + rowStep, column + columnStep);
        }
      }
      const homeRow = color === 'w' ? 7 : 0;
      const opponent = color === 'w' ? 'b' : 'w';
      const rights = position.castle[color];
      if (row === homeRow && column === 4 && !kingInCheck(position, color)) {
        if (rights.k && !position.board[indexAt(homeRow, 5)] && !position.board[indexAt(homeRow, 6)] &&
            position.board[indexAt(homeRow, 7)] === (color === 'w' ? 'R' : 'r') &&
            !isSquareAttacked(position, indexAt(homeRow, 5), opponent) &&
            !isSquareAttacked(position, indexAt(homeRow, 6), opponent)) {
          moves.push({ from, to: indexAt(homeRow, 6), castle: 'k' });
        }
        if (rights.q && !position.board[indexAt(homeRow, 1)] && !position.board[indexAt(homeRow, 2)] &&
            !position.board[indexAt(homeRow, 3)] &&
            position.board[indexAt(homeRow, 0)] === (color === 'w' ? 'R' : 'r') &&
            !isSquareAttacked(position, indexAt(homeRow, 3), opponent) &&
            !isSquareAttacked(position, indexAt(homeRow, 2), opponent)) {
          moves.push({ from, to: indexAt(homeRow, 2), castle: 'q' });
        }
      }
      return moves;
    }

    const directions = [];
    if (type === 'b' || type === 'q') directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === 'r' || type === 'q') directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [rowStep, columnStep] of directions) {
      let targetRow = row + rowStep;
      let targetColumn = column + columnStep;
      while (inside(targetRow, targetColumn)) {
        const canContinue = addTarget(targetRow, targetColumn);
        if (!canContinue) break;
        targetRow += rowStep;
        targetColumn += columnStep;
      }
    }
    return moves;
  }

  function applyMove(position, move) {
    const next = copyPosition(position);
    const piece = next.board[move.from];
    const color = colorOf(piece);
    const capturedSquare = move.enPassant ? move.to + (color === 'w' ? 8 : -8) : move.to;
    const captured = next.board[capturedSquare];

    next.board[move.from] = null;
    next.board[capturedSquare] = null;
    next.board[move.to] = move.promotion || piece;

    if (move.castle) {
      const row = color === 'w' ? 7 : 0;
      const rookFrom = indexAt(row, move.castle === 'k' ? 7 : 0);
      const rookTo = indexAt(row, move.castle === 'k' ? 5 : 3);
      next.board[rookTo] = next.board[rookFrom];
      next.board[rookFrom] = null;
    }

    if (piece.toLowerCase() === 'k') {
      next.castle[color] = { k: false, q: false };
    }
    if (piece.toLowerCase() === 'r') {
      if (move.from === 63) next.castle.w.k = false;
      if (move.from === 56) next.castle.w.q = false;
      if (move.from === 7) next.castle.b.k = false;
      if (move.from === 0) next.castle.b.q = false;
    }
    if (captured && captured.toLowerCase() === 'r') {
      if (capturedSquare === 63) next.castle.w.k = false;
      if (capturedSquare === 56) next.castle.w.q = false;
      if (capturedSquare === 7) next.castle.b.k = false;
      if (capturedSquare === 0) next.castle.b.q = false;
    }

    next.enPassant = move.doublePawn ? (move.from + move.to) / 2 : null;
    next.halfMoves = piece.toLowerCase() === 'p' || captured ? 0 : next.halfMoves + 1;
    next.turn = color === 'w' ? 'b' : 'w';
    return next;
  }

  function legalMoves(position, color = position.turn) {
    const moves = [];
    for (let from = 0; from < 64; from += 1) {
      if (!position.board[from] || colorOf(position.board[from]) !== color) continue;
      for (const move of pseudoMoves(position, from)) {
        const next = applyMove(position, move);
        if (!kingInCheck(next, color)) moves.push(move);
      }
    }
    return moves;
  }

  function render() {
    const checkingKing = game.board.indexOf(game.turn === 'w' ? 'K' : 'k');
    const inCheck = kingInCheck(game, game.turn);
    const moveByOrigin = new Map();
    legalDestinations.forEach((move) => moveByOrigin.set(move.to, move));
    boardElement.replaceChildren();

    for (let index = 0; index < 64; index += 1) {
      const [row, column] = coordinates(index);
      const piece = game.board[index];
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `chess-square ${(row + column) % 2 ? 'dark-square' : 'light-square'}`;
      square.setAttribute('role', 'gridcell');
      square.setAttribute('aria-label', `${squareName(index)}${piece ? `, ${pieceNames[piece]}` : ''}`);
      if (piece) {
        square.textContent = icons[piece];
        square.classList.add(colorOf(piece) === 'w' ? 'white-piece' : 'black-piece');
      }
      if (selected === index) square.classList.add('selected-square');
      if (moveByOrigin.has(index)) square.classList.add(game.board[index] ? 'legal-capture' : 'legal-square');
      if (inCheck && index === checkingKing) square.classList.add('check-square');
      square.disabled = thinking || finished;
      square.addEventListener('click', () => handleSquareClick(index));
      boardElement.appendChild(square);
    }
  }

  function finishIfNeeded() {
    const moves = legalMoves(game);
    if (!moves.length) {
      finished = true;
      if (kingInCheck(game, game.turn)) {
        const whiteWon = game.turn === 'b';
        statusElement.textContent = whiteWon ? 'Xeque-mate! Você venceu a IA! 🏆' : 'Xeque-mate. A IA venceu desta vez. Tente outra partida!';
        if (whiteWon && !awardedWin) {
          awardedWin = true;
          window.dispatchEvent(new CustomEvent('rumo:xp', { detail: 50 }));
        }
      } else {
        statusElement.textContent = 'Empate por afogamento. Uma boa partida!';
      }
      render();
      return true;
    }
    if (game.halfMoves >= 100) {
      finished = true;
      statusElement.textContent = 'Empate pela regra dos 50 lances sem captura ou movimento de peão.';
      render();
      return true;
    }
    if (kingInCheck(game, game.turn)) statusElement.textContent = game.turn === 'w' ? 'Xeque! Encontre uma saída.' : 'A IA está em xeque!';
    return false;
  }

  function playMove(move) {
    game = applyMove(game, move);
    selected = null;
    legalDestinations = [];
    if (finishIfNeeded()) return;
    render();

    if (game.turn === 'b') {
      thinking = true;
      statusElement.textContent = 'A IA está pensando...';
      render();
      const token = gameToken;
      window.setTimeout(() => makeComputerMove(token), 120);
    } else {
      statusElement.textContent = kingInCheck(game, 'w')
        ? 'Xeque! Encontre uma saída.'
        : 'Sua vez! Você joga com as peças claras.';
    }
  }

  function handleSquareClick(index) {
    if (thinking || finished || game.turn !== 'w') return;
    const move = legalDestinations.find((candidate) => candidate.to === index);
    if (selected !== null && move) {
      playMove(move);
      return;
    }
    if (game.board[index] && colorOf(game.board[index]) === 'w') {
      selected = index;
      legalDestinations = legalMoves(game, 'w').filter((candidate) => candidate.from === index);
    } else {
      selected = null;
      legalDestinations = [];
    }
    render();
  }

  function evaluate(position, player) {
    let score = 0;
    for (let index = 0; index < 64; index += 1) {
      const piece = position.board[index];
      if (!piece) continue;
      const color = colorOf(piece);
      const type = piece.toLowerCase();
      const [row, column] = coordinates(index);
      const centerBonus = Math.round((3.5 - (Math.abs(3.5 - row) + Math.abs(3.5 - column) / 2)) * 5);
      const advancement = type === 'p' ? (color === 'w' ? 6 - row : row - 1) * 5 : 0;
      const positional = type === 'n' || type === 'b' ? centerBonus : advancement;
      score += (color === 'w' ? 1 : -1) * (values[type] + positional);
    }
    return score * (player === 'w' ? 1 : -1);
  }

  function movePriority(position, move) {
    const captured = position.board[move.to] || (move.enPassant ? 'p' : null);
    return (captured ? values[captured.toLowerCase()] * 10 - values[position.board[move.from].toLowerCase()] : 0) +
      (move.promotion ? 8000 : 0) + (move.castle ? 50 : 0);
  }

  function search(position, depth, alpha, beta, maximizing, player) {
    const moves = legalMoves(position);
    if (!moves.length) {
      if (kingInCheck(position, position.turn)) {
        return position.turn === player ? -100000 - depth : 100000 + depth;
      }
      return 0;
    }
    if (position.halfMoves >= 100) return 0;
    if (depth === 0) return evaluate(position, player);

    moves.sort((a, b) => movePriority(position, b) - movePriority(position, a));
    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        best = Math.max(best, search(applyMove(position, move), depth - 1, alpha, beta, false, player));
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    }
    let best = Infinity;
    for (const move of moves) {
      best = Math.min(best, search(applyMove(position, move), depth - 1, alpha, beta, true, player));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  function makeComputerMove(token) {
    if (token !== gameToken || game.turn !== 'b' || finished) return;
    const moves = legalMoves(game, 'b');
    if (!moves.length) {
      thinking = false;
      finishIfNeeded();
      return;
    }
    const difficulty = difficultyElement.value;
    let chosen;
    if (difficulty === 'easy') {
      chosen = moves[Math.floor(Math.random() * moves.length)];
    } else {
      const depth = difficulty === 'hard' ? 3 : 2;
      let bestScore = -Infinity;
      const orderedMoves = moves.sort((a, b) => movePriority(game, b) - movePriority(game, a));
      for (const move of orderedMoves) {
        const score = search(applyMove(game, move), depth - 1, -Infinity, Infinity, false, 'b');
        if (score > bestScore) {
          bestScore = score;
          chosen = move;
        }
      }
    }
    thinking = false;
    playMove(chosen);
  }

  restartButton.addEventListener('click', newGame);
  difficultyElement.addEventListener('change', () => {
    statusElement.textContent = 'Dificuldade atualizada. A mudança vale para a próxima jogada da IA.';
  });
  newGame();
})();
