const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"]
  }
});

const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const COMBO_MULTIPLIER = 1.2;

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
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

class ServerTetrisBoard {
  constructor(playerId) {
    this.playerId = playerId;
    this.board = this.createEmptyBoard();
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentPiece = null;
    this.nextPiece = null;
    this.gameOver = false;
    this.pendingGarbage = 0;
    this.dropInterval = 1000;
    this.lastDropTime = 0;
  }

  createEmptyBoard() {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
  }

  initNewPiece(pieceType) {
    if (!this.nextPiece) {
      this.nextPiece = this.createPiece(pieceType);
    }
    this.currentPiece = this.nextPiece;
    this.currentPiece.x = Math.floor((BOARD_WIDTH - this.currentPiece.shape[0].length) / 2);
    this.currentPiece.y = 0;
    
    this.nextPiece = null;
    
    return !this.checkCollision(this.currentPiece, 0, 0);
  }

  setNextPiece(pieceType) {
    this.nextPiece = this.createPiece(pieceType);
  }

  createPiece(type) {
    return {
      type: type,
      shape: JSON.parse(JSON.stringify(SHAPES[type])),
      color: COLORS[type],
      x: 0,
      y: 0
    };
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
    if (!this.currentPiece) return false;
    
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
    if (!this.currentPiece) return false;
    
    const offset = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    if (!this.checkCollision(this.currentPiece, offset, 0)) {
      this.currentPiece.x += offset;
      return true;
    }
    return false;
  }

  drop() {
    if (!this.currentPiece) return false;
    
    if (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
      return true;
    }
    return false;
  }

  hardDrop() {
    if (!this.currentPiece) return false;
    
    while (!this.checkCollision(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
    }
    return true;
  }

  lockPiece() {
    if (!this.currentPiece) return { topout: false, linesCleared: 0 };
    
    this.currentPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const boardY = this.currentPiece.y + y;
          const boardX = this.currentPiece.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            this.board[boardY][boardX] = this.currentPiece.color;
          }
        }
      });
    });
    
    const linesCleared = this.clearLines();
    this.applyPendingGarbage();
    
    return { topout: false, linesCleared };
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
    } else {
      this.combo = 0;
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

  calculateGarbageLines(linesCleared) {
    const baseGarbage = Math.floor(linesCleared / 2);
    
    if (baseGarbage === 0) {
      return 0;
    }
    
    if (this.combo >= 2) {
      const multiplier = Math.pow(COMBO_MULTIPLIER, this.combo - 1);
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
      this.receiveGarbage(this.pendingGarbage);
      this.pendingGarbage = 0;
    }
  }

  handleTopOut() {
    this.lives--;
    this.combo = 0;
    this.pendingGarbage = 0;
    this.board = this.createEmptyBoard();
    this.gameOver = this.lives <= 0;
  }

  getState() {
    return {
      board: this.board,
      currentPiece: this.currentPiece,
      nextPiece: this.nextPiece,
      score: this.score,
      lives: this.lives,
      combo: this.combo,
      pendingGarbage: this.pendingGarbage,
      gameOver: this.gameOver
    };
  }
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function handlePieceLock(room, board, opponentBoard, playerIndex) {
  const result = board.lockPiece();
  
  if (result.linesCleared > 0) {
    const garbageLines = board.calculateGarbageLines(result.linesCleared);
    if (garbageLines > 0) {
      if (board.pendingGarbage > 0 && opponentBoard.pendingGarbage > 0) {
        const netGarbage = board.pendingGarbage - opponentBoard.pendingGarbage;
        if (netGarbage > 0) {
          board.pendingGarbage = netGarbage;
          opponentBoard.pendingGarbage = 0;
        } else if (netGarbage < 0) {
          board.pendingGarbage = 0;
          opponentBoard.pendingGarbage = Math.abs(netGarbage);
        } else {
          board.pendingGarbage = 0;
          opponentBoard.pendingGarbage = 0;
        }
      }
      
      opponentBoard.pendingGarbage += garbageLines;
    }
  }
  
  if (room.pieceIndex < room.pieceSequence.length) {
    const nextType = room.pieceSequence[room.pieceIndex++];
    const canPlace = board.initNewPiece(nextType);
    
    if (!canPlace) {
      board.handleTopOut();
      
      if (board.gameOver) {
        return { gameEnded: true, reason: 'lives' };
      } else {
        if (room.pieceIndex < room.pieceSequence.length) {
          board.initNewPiece(room.pieceSequence[room.pieceIndex++]);
        }
      }
    }
    
    if (room.pieceIndex < room.pieceSequence.length) {
      board.setNextPiece(room.pieceSequence[room.pieceIndex++]);
    }
  }
  
  return { gameEnded: false };
}

function broadcastGameState(io, roomId, room, players) {
  const state1 = room.board1.getState();
  const state2 = room.board2.getState();
  
  io.to(players[0].id).emit('gameState', {
    myBoard: state1,
    opponentBoard: state2
  });
  
  io.to(players[1].id).emit('gameState', {
    myBoard: state2,
    opponentBoard: state1
  });
}

function handleGameEnd(io, roomId, room, players, reason) {
  const board1 = room.board1;
  const board2 = room.board2;
  
  let winnerId;
  if (reason === 'lives') {
    winnerId = board1.gameOver ? players[1].id : players[0].id;
  } else if (reason === 'time') {
    if (board1.lives > board2.lives) {
      winnerId = players[0].id;
    } else if (board2.lives > board1.lives) {
      winnerId = players[1].id;
    } else {
      winnerId = board1.score >= board2.score ? players[0].id : players[1].id;
    }
  }
  
  io.to(roomId).emit('gameEnded', { winnerId, reason });
  
  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', (playerName) => {
    const roomId = generateRoomId();
    const rng = new SeededRandom(Date.now());
    
    rooms.set(roomId, {
      id: roomId,
      players: new Map([[socket.id, { id: socket.id, name: playerName, isCreator: true }]]),
      gameStarted: false,
      rng: rng,
      pieceSequence: [],
      player1Lives: 3,
      player2Lives: 3
    });
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId: socket.id });
    console.log(`Room ${roomId} created by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('joinError', '房間不存在');
      return;
    }
    
    if (room.players.size >= 2) {
      socket.emit('joinError', '房間已滿');
      return;
    }
    
    if (room.gameStarted) {
      socket.emit('joinError', '遊戲已開始');
      return;
    }
    
    room.players.set(socket.id, { id: socket.id, name: playerName, isCreator: false });
    socket.join(roomId);
    
    const players = Array.from(room.players.values());
    io.to(roomId).emit('playerJoined', { players });
    
    console.log(`${playerName} joined room ${roomId}`);
  });

  socket.on('startGame', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.players.size === 2) {
      room.gameStarted = true;
      room.gameStartTime = Date.now();
      room.pieceIndex = 0;
      
      room.pieceSequence = [];
      for (let i = 0; i < 1500; i++) {
        const type = PIECE_TYPES[Math.floor(room.rng.next() * PIECE_TYPES.length)];
        room.pieceSequence.push(type);
      }
      
      room.board1 = new ServerTetrisBoard(1);
      room.board2 = new ServerTetrisBoard(2);
      
      room.board1.initNewPiece(room.pieceSequence[room.pieceIndex++]);
      room.board1.setNextPiece(room.pieceSequence[room.pieceIndex++]);
      room.board2.initNewPiece(room.pieceSequence[room.pieceIndex++]);
      room.board2.setNextPiece(room.pieceSequence[room.pieceIndex++]);
      
      const players = Array.from(room.players.values());
      
      room.gameLoopInterval = setInterval(() => {
        const now = Date.now();
        const deltaTime = now - (room.lastTickTime || now);
        room.lastTickTime = now;
        
        room.board1.lastDropTime += deltaTime;
        room.board2.lastDropTime += deltaTime;
        
        if (room.board1.lastDropTime >= room.board1.dropInterval) {
          const dropped = room.board1.drop();
          if (!dropped) {
            const result = handlePieceLock(room, room.board1, room.board2, 1);
            if (result.gameEnded) {
              clearInterval(room.gameLoopInterval);
              handleGameEnd(io, roomId, room, players, result.reason);
            }
          }
          room.board1.lastDropTime = 0;
        }
        
        if (room.board2.lastDropTime >= room.board2.dropInterval) {
          const dropped = room.board2.drop();
          if (!dropped) {
            const result = handlePieceLock(room, room.board2, room.board1, 2);
            if (result.gameEnded) {
              clearInterval(room.gameLoopInterval);
              handleGameEnd(io, roomId, room, players, result.reason);
            }
          }
          room.board2.lastDropTime = 0;
        }
        
        broadcastGameState(io, roomId, room, players);
        
        const elapsed = now - room.gameStartTime;
        if (elapsed >= 180000) {
          clearInterval(room.gameLoopInterval);
          handleGameEnd(io, roomId, room, players, 'time');
        }
      }, 50);
      
      io.to(roomId).emit('gameStart', { 
        players,
        gameStartTime: room.gameStartTime
      });
      
      broadcastGameState(io, roomId, room, players);
    }
  });

  socket.on('playerInput', ({ roomId, action }) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameStarted) return;
    
    const players = Array.from(room.players.values());
    const playerIndex = players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const board = playerIndex === 0 ? room.board1 : room.board2;
    const opponentBoard = playerIndex === 0 ? room.board2 : room.board1;
    
    let executed = false;
    
    switch (action) {
      case 'left':
      case 'right':
        executed = board.move(action);
        break;
      case 'rotate':
        executed = board.rotate();
        break;
      case 'drop':
        executed = board.hardDrop();
        if (executed) {
          const result = handlePieceLock(room, board, opponentBoard, playerIndex + 1);
          if (result.gameEnded) {
            clearInterval(room.gameLoopInterval);
            handleGameEnd(io, roomId, room, players, result.reason);
          }
        }
        break;
      case 'down':
        board.dropInterval = 50;
        break;
      case 'down-release':
        board.dropInterval = 1000;
        break;
    }
  });
  
  socket.on('gameOver', ({ roomId, winnerId }) => {
    io.to(roomId).emit('gameEnded', { winnerId });
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        
        if (room.gameLoopInterval) {
          clearInterval(room.gameLoopInterval);
        }
        
        if (room.players.size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('opponentDisconnected');
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tetris Battle server running on port ${PORT}`);
});
