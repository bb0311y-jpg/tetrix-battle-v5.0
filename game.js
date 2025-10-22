const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL_SIZE = 30;

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
  GHOST: 'rgba(255, 255, 255, 0.2)',
  GARBAGE: '#808080'
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]]
};

const PIECE_TYPES = Object.keys(SHAPES);
const COMBO_MULTIPLIER = 1.4;

class TetrisBoard {
  constructor(canvasId, nextCanvasId, playerId, isDisplayOnly = false, serverControlled = false) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById(nextCanvasId);
    this.nextCtx = this.nextCanvas.getContext('2d');
    this.playerId = playerId;
    this.isDisplayOnly = isDisplayOnly;
    this.serverControlled = serverControlled;
    
    this.board = this.createEmptyBoard();
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentPiece = null;
    this.nextPiece = null;
    this.gameOver = false;
    this.isPaused = false;
    this.pendingGarbage = 0;
    
    this.dropInterval = 1000;
    this.lastDropTime = 0;
    this.fastDrop = false;
    
    if (!this.serverControlled) {
      this.initNewPiece();
      this.updateNextPiece();
    }
  }
  
  createEmptyBoard() {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
  }
  
  initNewPiece() {
    if (!this.nextPiece) {
      this.nextPiece = this.createRandomPiece();
    }
    this.currentPiece = this.nextPiece;
    this.currentPiece.x = Math.floor((BOARD_WIDTH - this.currentPiece.shape[0].length) / 2);
    this.currentPiece.y = 0;
    this.nextPiece = this.createRandomPiece();
    this.updateNextPiece();
    
    if (this.checkCollision(this.currentPiece, 0, 0)) {
      this.handleTopOut();
    }
  }
  
  createRandomPiece() {
    let type;
    
    if (game.isMultiplayer && !this.isDisplayOnly && game.sharedPieceQueue && game.sharedPieceQueue.length > 0) {
      type = game.sharedPieceQueue.shift();
      
      if (game.sharedPieceQueue.length < 5 && game.socket && game.roomId) {
        game.socket.emit('requestNextPiece', game.roomId);
      }
    } else {
      type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    }
    
    return {
      type: type,
      shape: JSON.parse(JSON.stringify(SHAPES[type])),
      color: COLORS[type],
      x: 0,
      y: 0
    };
  }
  
  handleTopOut() {
    if (game.isMultiplayer && game.socket && !this.isDisplayOnly) {
      game.socket.emit('topout', { roomId: game.roomId });
      
      this.combo = 0;
      this.updateCombo();
      
      this.pendingGarbage = 0;
      if (game.mode === 'pvp' || game.mode === 'practice') {
        const opponentBoard = this.playerId === 1 ? game.player2Board : game.player1Board;
        if (opponentBoard) {
          opponentBoard.pendingGarbage = 0;
        }
      }
      
      this.triggerTopoutVisual();
    } else if (!game.isMultiplayer) {
      this.lives--;
      this.updateLives();
      
      this.combo = 0;
      this.updateCombo();
      
      this.pendingGarbage = 0;
      
      this.triggerTopoutVisual();
      
      if (this.lives <= 0) {
        this.gameOver = true;
        game.endGame(this.playerId === 1 ? 2 : 1);
      } else {
        this.board = this.createEmptyBoard();
        this.initNewPiece();
      }
    }
  }
  
  triggerTopoutVisual() {
    const playerAreas = document.querySelectorAll('.player-area');
    const playerArea = playerAreas[this.playerId === 1 ? 0 : 1];
    
    playerArea.classList.add('topout');
    setTimeout(() => {
      playerArea.classList.remove('topout');
    }, 500);
  }
  
  updateNextPiece() {
    this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    if (this.nextPiece) {
      const cellSize = 20;
      const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * cellSize) / 2;
      const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * cellSize) / 2;
      
      this.nextPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            this.nextCtx.fillStyle = this.nextPiece.color;
            this.nextCtx.fillRect(
              offsetX + x * cellSize,
              offsetY + y * cellSize,
              cellSize - 1,
              cellSize - 1
            );
          }
        });
      });
    }
  }
  
  checkCollision(piece, offsetX, offsetY) {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x + offsetX;
          const newY = piece.y + y + offsetY;
          
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return true;
          }
          
          if (newY >= 0 && this.board[newY][newX]) {
            return true;
          }
        }
      }
    }
    return false;
  }
  
  rotate() {
    if (this.serverControlled) {
      if (game.socket && game.roomId) {
        game.socket.emit('playerInput', { roomId: game.roomId, action: 'rotate' });
      }
      return true;
    }
    
    const rotated = this.currentPiece.shape[0].map((_, index) =>
      this.currentPiece.shape.map(row => row[index]).reverse()
    );
    
    const originalShape = this.currentPiece.shape;
    const originalX = this.currentPiece.x;
    this.currentPiece.shape = rotated;
    
    if (!this.checkCollision(this.currentPiece, 0, 0)) {
      return true;
    }
    
    const wallKickOffsets = [-1, 1, -2, 2];
    for (const offset of wallKickOffsets) {
      this.currentPiece.x = originalX + offset;
      if (!this.checkCollision(this.currentPiece, 0, 0)) {
        return true;
      }
    }
    
    this.currentPiece.shape = originalShape;
    this.currentPiece.x = originalX;
    return false;
  }
  
  move(direction) {
    if (this.serverControlled) {
      if (game.socket && game.roomId) {
        game.socket.emit('playerInput', { roomId: game.roomId, action: direction });
      }
      return true;
    }
    
    const offset = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    if (!this.checkCollision(this.currentPiece, offset, 0)) {
      this.currentPiece.x += offset;
      return true;
    }
    return false;
  }
  
  drop() {
    if (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
      return true;
    } else {
      this.lockPiece();
      return false;
    }
  }
  
  hardDrop() {
    if (this.serverControlled) {
      if (game.socket && game.roomId) {
        game.socket.emit('playerInput', { roomId: game.roomId, action: 'drop' });
      }
      return;
    }
    
    while (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
    }
    
    this.lockPiece();
  }
  
  lockPiece() {
    this.currentPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const boardY = this.currentPiece.y + y;
          const boardX = this.currentPiece.x + x;
          if (boardY >= 0) {
            this.board[boardY][boardX] = this.currentPiece.color;
          }
        }
      });
    });
    
    const linesCleared = this.clearLines();
    this.applyPendingGarbage();
    this.initNewPiece();
  }
  
  clearLines() {
    let linesCleared = 0;
    
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (this.board[y].every(cell => cell !== 0)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(BOARD_WIDTH).fill(0));
        linesCleared++;
        y++;
      }
    }
    
    if (linesCleared > 0) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      
      const points = this.calculateScore(linesCleared);
      this.score += points;
      this.updateScore();
      this.updateCombo();
      
      const garbageLines = this.calculateGarbageLines(linesCleared, this.combo);
      if (garbageLines > 0 && (game.mode === 'pvp' || game.mode === 'practice')) {
        const opponentBoard = this.playerId === 1 ? game.player2Board : game.player1Board;
        opponentBoard.pendingGarbage += garbageLines;
        
        if (game.isMultiplayer && game.socket && !this.isDisplayOnly) {
          game.socket.emit('linesCleared', { 
            roomId: game.roomId, 
            lines: linesCleared, 
            combo: this.combo, 
            garbageLines 
          });
        }
      }
    } else {
      this.combo = 0;
      this.updateCombo();
    }
    
    return linesCleared;
  }
  
  calculateScore(linesCleared) {
    const baseScores = [0, 100, 300, 500, 800];
    let points = baseScores[linesCleared] || 0;
    
    if (this.combo > 1) {
      points += (this.combo - 1) * 50;
    }
    
    return points;
  }
  
  calculateGarbageLines(linesCleared, combo) {
    const baseGarbage = Math.floor(linesCleared / 2);
    
    if (baseGarbage === 0) {
      return 0;
    }
    
    if (combo >= 2) {
      const multiplier = Math.pow(COMBO_MULTIPLIER, combo - 1);
      return Math.floor(baseGarbage * multiplier);
    }
    
    return baseGarbage;
  }
  
  receiveGarbage(lines) {
    for (let i = 0; i < lines; i++) {
      const gapPosition = Math.floor(Math.random() * BOARD_WIDTH);
      
      this.board.shift();
      const garbageLine = Array(BOARD_WIDTH).fill(COLORS.GARBAGE);
      garbageLine[gapPosition] = 0;
      this.board.push(garbageLine);
    }
  }
  
  applyPendingGarbage() {
    if (this.pendingGarbage > 0) {
      if (game.mode === 'pvp') {
        const opponentBoard = this.playerId === 1 ? game.player2Board : game.player1Board;
        const myPending = this.pendingGarbage;
        const opponentPending = opponentBoard.pendingGarbage;
        
        if (opponentPending > 0) {
          const netGarbage = myPending - opponentPending;
          
          if (netGarbage > 0) {
            this.receiveGarbage(netGarbage);
          } else if (netGarbage < 0) {
          }
          
          this.pendingGarbage = 0;
          opponentBoard.pendingGarbage = 0;
        } else {
          this.receiveGarbage(myPending);
          this.pendingGarbage = 0;
        }
      } else {
        this.receiveGarbage(this.pendingGarbage);
        this.pendingGarbage = 0;
      }
    }
  }
  
  updateScore() {
    document.getElementById(`player${this.playerId}-score`).textContent = this.score;
  }
  
  updateLives() {
    const hearts = '❤️'.repeat(this.lives) + '🖤'.repeat(3 - this.lives);
    document.getElementById(`player${this.playerId}-lives`).innerHTML = hearts;
  }
  
  updateCombo() {
    const comboElement = document.getElementById(`player${this.playerId}-combo`);
    comboElement.textContent = this.combo;
    if (this.combo > 1) {
      comboElement.style.color = '#00ff88';
      comboElement.style.fontSize = '1.5rem';
    } else {
      comboElement.style.color = '#00d4ff';
      comboElement.style.fontSize = '1.2rem';
    }
  }
  
  getGhostPieceY() {
    let ghostY = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece, 0, ghostY - this.currentPiece.y + 1)) {
      ghostY++;
    }
    return ghostY;
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        this.ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
    
    this.board.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          this.ctx.fillStyle = cell;
          this.ctx.fillRect(
            x * CELL_SIZE,
            y * CELL_SIZE,
            CELL_SIZE - 1,
            CELL_SIZE - 1
          );
        }
      });
    });
    
    if (this.currentPiece && !this.gameOver) {
      const ghostY = this.getGhostPieceY();
      this.currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            this.ctx.fillStyle = COLORS.GHOST;
            this.ctx.fillRect(
              (this.currentPiece.x + x) * CELL_SIZE,
              (ghostY + y) * CELL_SIZE,
              CELL_SIZE - 1,
              CELL_SIZE - 1
            );
          }
        });
      });
      
      this.currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            this.ctx.fillStyle = this.currentPiece.color;
            this.ctx.fillRect(
              (this.currentPiece.x + x) * CELL_SIZE,
              (this.currentPiece.y + y) * CELL_SIZE,
              CELL_SIZE - 1,
              CELL_SIZE - 1
            );
          }
        });
      });
    }
  }
  
  update(deltaTime) {
    if (this.isPaused || this.gameOver || this.serverControlled) return;
    
    this.lastDropTime += deltaTime;
    const dropSpeed = this.fastDrop ? 50 : this.dropInterval;
    
    if (this.lastDropTime >= dropSpeed) {
      this.drop();
      this.lastDropTime = 0;
    }
  }
}

class Game {
  constructor() {
    this.mode = null;
    this.player1Board = null;
    this.player2Board = null;
    this.isRunning = false;
    this.lastTime = 0;
    this.gameStartTime = 0;
    this.gameTimeLimit = 180000;
    this.keys = {};
    this.touchAction = null;
    this.aiDifficulty = 'easy';
    this.socket = null;
    this.roomId = null;
    this.playerId = null;
    this.isMultiplayer = false;
    this.myPlayerIndex = null;
    this.sharedPieceQueue = [];
    
    this.setupKeyboardControls();
    this.connectSocket();
  }
  
  connectSocket() {
    const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
    this.socket = io(socketUrl);
    
    this.socket.on('roomCreated', ({ roomId, playerId }) => {
      this.roomId = roomId;
      this.playerId = playerId;
      document.getElementById('room-code-display').textContent = roomId;
    });
    
    this.socket.on('playerJoined', ({ players }) => {
      if (players.length === 2) {
        if (this.socket.id === players[0].id) {
          this.socket.emit('startGame', this.roomId);
        }
      }
    });
    
    this.socket.on('gameStart', ({ players, initialPieces, gameStartTime }) => {
      const myIndex = players.findIndex(p => p.id === this.socket.id);
      const opponentIndex = myIndex === 0 ? 1 : 0;
      
      this.myPlayerIndex = myIndex;
      
      document.getElementById('player1-name').textContent = players[myIndex].name;
      document.getElementById('player2-name').textContent = players[opponentIndex].name;
      
      this.isMultiplayer = true;
      this.mode = 'pvp';
      
      this.sharedPieceQueue = initialPieces || [];
      this.gameStartTime = gameStartTime;
      
      this.startGame();
    });
    
    // this.socket.on('nextPiece', ({ type }) => {
    //   this.sharedPieceQueue.push(type);
    // });
    
    this.socket.on('gameState', ({ myBoard, opponentBoard }) => {
      if (!this.player1Board || !this.player2Board) return;
      
      this.player1Board.board = myBoard.board;
      this.player1Board.currentPiece = myBoard.currentPiece;
      this.player1Board.nextPiece = myBoard.nextPiece;
      this.player1Board.score = myBoard.score;
      this.player1Board.lives = myBoard.lives;
      this.player1Board.combo = myBoard.combo;
      this.player1Board.pendingGarbage = myBoard.pendingGarbage;
      this.player1Board.gameOver = myBoard.gameOver;
      
      this.player2Board.board = opponentBoard.board;
      this.player2Board.currentPiece = opponentBoard.currentPiece;
      this.player2Board.nextPiece = opponentBoard.nextPiece;
      this.player2Board.score = opponentBoard.score;
      this.player2Board.lives = opponentBoard.lives;
      this.player2Board.combo = opponentBoard.combo;
      this.player2Board.pendingGarbage = opponentBoard.pendingGarbage;
      this.player2Board.gameOver = opponentBoard.gameOver;
      
      this.player1Board.updateScore();
      this.player1Board.updateLives();
      this.player1Board.updateCombo();
      this.player1Board.updateNextPiece();
      
      this.player2Board.updateScore();
      this.player2Board.updateLives();
      this.player2Board.updateCombo();
      this.player2Board.updateNextPiece();
      
      this.updateGarbageIndicator();
      
      if (myBoard.gameOver || opponentBoard.gameOver) {
        this.isRunning = false;
      }
    });
    
    this.socket.on('gameEnded', ({ winnerId, reason }) => {
      this.isRunning = false;
      
      const myWon = winnerId === this.socket.id;
      const winnerIndex = this.myPlayerIndex === 0 ?
        (myWon ? 1 : 2) : (myWon ? 2 : 1);
      
      let resultMessage = '';
      if (reason === 'lives') {
        resultMessage = myWon ? '你獲勝！對手生命值歸零' : '你輸了！生命值歸零';
      } else if (reason === 'time') {
        resultMessage = myWon ? '你獲勝！時間到，你的狀態較佳' : '你輸了！時間到，對手狀態較佳';
      }
      
      setTimeout(() => {
        alert(resultMessage);
        this.endGame(winnerIndex);
      }, 500);
    });
    
    this.socket.on('opponentDisconnected', () => {
      alert('對手已離線');
      this.exitToMenu();
    });
    
    this.socket.on('joinError', (message) => {
      document.getElementById('join-error').textContent = message;
    });
  }
  
  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      if (!this.isRunning || !this.player1Board) return;
      
      this.keys[e.key] = true;
      
      if (e.key === 'ArrowLeft') {
        this.player1Board.move('left');
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        this.player1Board.move('right');
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        this.player1Board.rotate();
        e.preventDefault();
      } else if (e.key === ' ') {
        this.player1Board.hardDrop();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.player1Board.fastDrop = true;
        if (this.player1Board.serverControlled && this.socket && this.roomId) {
          this.socket.emit('playerInput', { roomId: this.roomId, action: 'down' });
        }
        e.preventDefault();
      }
    });
    
    document.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
      
      if (e.key === 'ArrowDown' && this.player1Board) {
        this.player1Board.fastDrop = false;
        if (this.player1Board.serverControlled && this.socket && this.roomId) {
          this.socket.emit('playerInput', { roomId: this.roomId, action: 'down-release' });
        }
      }
    });
  }
  
  showMenu() {
    this.hideAllScreens();
    document.getElementById('menu-screen').classList.add('active');
  }
  
  showRules() {
    this.hideAllScreens();
    document.getElementById('rules-screen').classList.add('active');
  }
  
  showPvPOptions() {
    this.hideAllScreens();
    document.getElementById('pvp-options-screen').classList.add('active');
  }
  
  showCreateRoom() {
    this.hideAllScreens();
    document.getElementById('create-room-screen').classList.add('active');
    document.getElementById('create-player-name').value = '';
    document.getElementById('room-waiting-area').style.display = 'none';
  }
  
  createRoomWithName() {
    const playerName = document.getElementById('create-player-name').value.trim() || '玩家';
    document.getElementById('room-waiting-area').style.display = 'block';
    document.getElementById('create-player-name').parentElement.style.display = 'none';
    this.socket.emit('createRoom', playerName);
  }
  
  showJoinRoom() {
    this.hideAllScreens();
    document.getElementById('join-room-screen').classList.add('active');
    document.getElementById('join-error').textContent = '';
  }
  
  joinRoomWithCode() {
    const playerName = document.getElementById('join-player-name').value.trim() || '玩家';
    const roomCode = document.getElementById('room-code-input').value.toUpperCase().trim();
    
    if (!playerName) {
      document.getElementById('join-error').textContent = '請輸入名字';
      return;
    }
    
    if (roomCode.length !== 6) {
      document.getElementById('join-error').textContent = '請輸入6位房間代碼';
      return;
    }
    
    this.socket.emit('joinRoom', { roomId: roomCode, playerName });
  }
  
  cancelRoom() {
    if (this.roomId && this.socket) {
      this.socket.emit('leaveRoom', this.roomId);
    }
    this.roomId = null;
    this.isMultiplayer = false;
    this.showPvPOptions();
  }
  
  showAIDifficultySelect() {
    this.hideAllScreens();
    document.getElementById('ai-difficulty-screen').classList.add('active');
  }
  
  startPracticeWithDifficulty(difficulty) {
    this.aiDifficulty = difficulty;
    this.mode = 'practice';
    this.isMultiplayer = false;
    this.startGame();
  }
  
  startPvPMode() {
    this.showPvPOptions();
  }
  
  startPracticeMode() {
    this.showAIDifficultySelect();
  }
  
  startGame() {
    this.hideAllScreens();
    document.getElementById('game-screen').classList.add('active');
    
    const isServerControlled = this.mode === 'pvp';
    
    this.player1Board = new TetrisBoard('player1-board', 'player1-next', 1, false, isServerControlled);
    this.player2Board = new TetrisBoard('player2-board', 'player2-next', 2, true, isServerControlled);
    
    if (this.mode === 'practice') {
      document.getElementById('player2-name').textContent = 'AI 對手';
    }
    
    this.isRunning = true;
    this.gameStartTime = this.gameStartTime || Date.now();
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }
  
  gameLoop(currentTime) {
    if (!this.isRunning) return;
    
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    this.player1Board.update(deltaTime);
    
    if (this.mode === 'practice') {
      this.updateAI();
    }
    this.player2Board.update(deltaTime);
    
    this.player1Board.render();
    this.player2Board.render();
    
    this.updateGameTimer();
    this.updateGarbageIndicator();
    
    requestAnimationFrame((time) => this.gameLoop(time));
  }
  
  updateAI() {
    if (!this.player2Board || !this.player2Board.currentPiece) return;
    
    const delays = {
      easy: 150,
      medium: 120,
      hard: 90
    };
    
    if (!this.aiLastAction) {
      this.aiLastAction = Date.now();
      this.aiRotationAttempts = 0;
      this.aiTargetRotation = null;
    }
    
    const now = Date.now();
    const delay = delays[this.aiDifficulty] || 100;
    
    if (now - this.aiLastAction < delay) {
      return;
    }
    this.aiLastAction = now;
    
    const board = this.player2Board;
    const piece = board.currentPiece;
    
    if (this.aiTargetRotation === null) {
      let bestScore = -Infinity;
      let bestRotation = 0;
      let bestX = piece.x;
      
      for (let rotation = 0; rotation < 4; rotation++) {
        const testPiece = {
          shape: this.getRotatedShape(SHAPES[piece.type], rotation),
          x: 0,
          y: 0,
          color: piece.color,
          type: piece.type
        };
        
        for (let x = 0; x < BOARD_WIDTH; x++) {
          testPiece.x = x;
          testPiece.y = 0;
          
          if (board.checkCollision(testPiece, 0, 0)) continue;
          
          let landingY = 0;
          while (!board.checkCollision(testPiece, 0, landingY + 1)) {
            landingY++;
          }
          testPiece.y = landingY;
          
          const score = this.evaluateAIPosition(board, testPiece);
          if (score > bestScore) {
            bestScore = score;
            bestRotation = rotation;
            bestX = x;
          }
        }
      }
      
      this.aiTargetRotation = bestRotation;
      this.aiTargetX = bestX;
      this.aiCurrentRotation = 0;
    }
    
    if (this.aiCurrentRotation < this.aiTargetRotation) {
      const rotated = board.rotate();
      if (rotated) {
        this.aiCurrentRotation++;
        this.aiRotationAttempts = 0;
      } else {
        this.aiRotationAttempts++;
        if (this.aiRotationAttempts >= 3) {
          this.aiCurrentRotation = this.aiTargetRotation;
        }
      }
      return;
    }
    
    if (piece.x < this.aiTargetX) {
      board.move('right');
      return;
    } else if (piece.x > this.aiTargetX) {
      board.move('left');
      return;
    }
    
    board.hardDrop();
    this.aiTargetRotation = null;
    this.aiRotationAttempts = 0;
  }
  
  getRotatedShape(shape, rotations) {
    let rotated = JSON.parse(JSON.stringify(shape));
    for (let i = 0; i < rotations; i++) {
      rotated = rotated[0].map((_, index) =>
        rotated.map(row => row[index]).reverse()
      );
    }
    return rotated;
  }
  
  getPieceRotation(shape) {
    const baseShape = this.player2Board.currentPiece.type;
    const shapes = SHAPES[baseShape];
    
    for (let rotation = 0; rotation < 4; rotation++) {
      let rotated = shapes;
      for (let i = 0; i < rotation; i++) {
        rotated = rotated[0].map((_, index) =>
          rotated.map(row => row[index]).reverse()
        );
      }
      
      if (JSON.stringify(rotated) === JSON.stringify(shape)) {
        return rotation;
      }
    }
    
    return 0;
  }
  
  evaluateAIPosition(board, piece) {
    const weights = {
      easy: { lines: 100000, height: 5, holes: 10, totalHeight: 0.5, bumpiness: 2, almostComplete: 5000, filledCells: 50 },
      medium: { lines: 500000, height: 3, holes: 5, totalHeight: 0.3, bumpiness: 1, almostComplete: 20000, filledCells: 100 },
      hard: { lines: 2000000, height: 1, holes: 2, totalHeight: 0.1, bumpiness: 0.3, almostComplete: 80000, filledCells: 300 }
    };
    
    const w = weights[this.aiDifficulty] || weights.easy;
    
    const testBoard = board.board.map(row => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const boardY = piece.y + y;
          const boardX = piece.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            testBoard[boardY][boardX] = piece.color;
          }
        }
      });
    });
    
    let score = 0;
    
    let completeLines = 0;
    let almostCompleteLines = 0;
    let totalFilledCells = 0;
    
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      const filledCells = testBoard[y].filter(cell => cell !== 0).length;
      totalFilledCells += filledCells;
      
      if (filledCells === BOARD_WIDTH) {
        completeLines++;
      } else if (filledCells >= BOARD_WIDTH - 1) {
        almostCompleteLines += 2;
      } else if (filledCells >= BOARD_WIDTH - 2) {
        almostCompleteLines += 1;
      }
    }
    
    score += completeLines * w.lines;
    score += almostCompleteLines * w.almostComplete;
    score += totalFilledCells * w.filledCells;
    
    score += piece.y * w.height;
    
    let holes = 0;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let foundBlock = false;
      for (let y = 0; y < BOARD_HEIGHT; y++) {
        if (testBoard[y][x] !== 0) {
          foundBlock = true;
        } else if (foundBlock) {
          holes++;
        }
      }
    }
    score -= holes * w.holes;
    
    let totalHeight = 0;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      for (let y = 0; y < BOARD_HEIGHT; y++) {
        if (testBoard[y][x] !== 0) {
          totalHeight += (BOARD_HEIGHT - y);
          break;
        }
      }
    }
    score -= totalHeight * w.totalHeight;
    
    let bumpiness = 0;
    const columnHeights = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let height = 0;
      for (let y = 0; y < BOARD_HEIGHT; y++) {
        if (testBoard[y][x] !== 0) {
          height = BOARD_HEIGHT - y;
          break;
        }
      }
      columnHeights.push(height);
    }
    for (let x = 0; x < BOARD_WIDTH - 1; x++) {
      bumpiness += Math.abs(columnHeights[x] - columnHeights[x + 1]);
    }
    score -= bumpiness * w.bumpiness;
    
    return score;
  }
  
  updateGameTimer() {
    if (this.mode === 'practice') {
      const elapsed = Date.now() - this.gameStartTime;
      const remaining = Math.max(0, this.gameTimeLimit - elapsed);
      const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      document.getElementById('game-timer').textContent = `${minutes}:${seconds}`;
      
      if (remaining <= 0 && this.isRunning) {
        this.isRunning = false;
        
        let winnerId;
        if (this.player1Board.lives > this.player2Board.lives) {
          winnerId = 1;
        } else if (this.player2Board.lives > this.player1Board.lives) {
          winnerId = 2;
        } else {
          winnerId = this.player1Board.score >= this.player2Board.score ? 1 : 2;
        }
        
        this.endGame(winnerId);
      }
    } else if (this.mode === 'pvp') {
      const elapsed = Date.now() - this.gameStartTime;
      const remaining = Math.max(0, this.gameTimeLimit - elapsed);
      const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      document.getElementById('game-timer').textContent = `${minutes}:${seconds}`;
    }
  }
  
  updateGarbageIndicator() {
    if (!this.player1Board || !this.player2Board) return;
    
    const p1Pending = this.player1Board.pendingGarbage;
    const p2Pending = this.player2Board.pendingGarbage;
    const netGarbage = p2Pending - p1Pending;
    
    const indicator = document.getElementById('garbage-indicator');
    const arrow = document.getElementById('garbage-arrow');
    const count = document.getElementById('garbage-count');
    
    if (netGarbage === 0) {
      indicator.classList.add('hidden');
    } else {
      indicator.classList.remove('hidden');
      if (netGarbage > 0) {
        arrow.textContent = '→';
        count.textContent = Math.abs(netGarbage);
      } else {
        arrow.textContent = '←';
        count.textContent = Math.abs(netGarbage);
      }
    }
  }
  
  pauseGame() {
    if (this.player1Board && this.player2Board) {
      this.player1Board.isPaused = !this.player1Board.isPaused;
      this.player2Board.isPaused = !this.player2Board.isPaused;
    }
  }
  
  exitToMenu() {
    if (confirm('確定要離開遊戲嗎？')) {
      this.isRunning = false;
      this.showMenu();
    }
  }
  
  endGame(winnerId) {
    this.isRunning = false;
    
    setTimeout(() => {
      this.hideAllScreens();
      document.getElementById('gameover-screen').classList.add('active');
      
      const winner = winnerId === 1 ? this.player1Board : this.player2Board;
      const loser = winnerId === 1 ? this.player2Board : this.player1Board;
      const winnerName = winnerId === 1 ? '玩家 1' : (this.mode === 'practice' ? 'AI 對手' : '玩家 2');
      const loserName = winnerId === 1 ? (this.mode === 'practice' ? 'AI 對手' : '玩家 2') : '玩家 1';
      
      document.getElementById('gameover-result').textContent = `${winnerName} 獲勝！`;
      document.getElementById('winner-name').textContent = winnerName;
      document.getElementById('winner-score').textContent = winner.score;
      document.getElementById('winner-combo').textContent = winner.maxCombo;
      document.getElementById('loser-name').textContent = loserName;
      document.getElementById('loser-score').textContent = loser.score;
      document.getElementById('loser-combo').textContent = loser.maxCombo;
    }, 1000);
  }
  
  restartGame() {
    if (this.mode === 'pvp') {
      this.startPvPMode();
    } else {
      this.startPracticeMode();
    }
  }
  
  handleTouch(action) {
    if (!this.isRunning || !this.player1Board) return;
    
    this.touchAction = action;
    
    if (action === 'left') {
      this.player1Board.move('left');
    } else if (action === 'right') {
      this.player1Board.move('right');
    } else if (action === 'down') {
      this.player1Board.fastDrop = true;
    } else if (action === 'rotate') {
      this.player1Board.rotate();
    } else if (action === 'drop') {
      this.player1Board.hardDrop();
    }
  }
  
  handleTouchEnd() {
    if (this.touchAction === 'down' && this.player1Board) {
      this.player1Board.fastDrop = false;
    }
    this.touchAction = null;
  }
  
  hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
  }
}

const game = new Game();
game.showMenu();
