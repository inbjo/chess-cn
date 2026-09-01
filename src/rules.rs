use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const ROWS: usize = 10;
pub const COLS: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Red,
    Black,
}

impl Color {
    pub fn opponent(self) -> Self {
        match self {
            Self::Red => Self::Black,
            Self::Black => Self::Red,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PieceKind {
    General,
    Advisor,
    Elephant,
    Horse,
    Chariot,
    Cannon,
    Soldier,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Piece {
    pub kind: PieceKind,
    pub color: Color,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Square {
    pub row: usize,
    pub col: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Move {
    pub from: Square,
    pub to: Square,
}

impl Move {
    pub fn from_uci(value: &str) -> Result<Self, RuleError> {
        let bytes = value.as_bytes();
        if bytes.len() != 4 {
            return Err(RuleError::InvalidNotation(value.to_owned()));
        }
        let square = |file: u8, rank: u8| -> Result<Square, RuleError> {
            if !(b'a'..=b'i').contains(&file) || !rank.is_ascii_digit() {
                return Err(RuleError::InvalidNotation(value.to_owned()));
            }
            Ok(Square {
                row: 9 - usize::from(rank - b'0'),
                col: usize::from(file - b'a'),
            })
        };
        Ok(Self {
            from: square(bytes[0], bytes[1])?,
            to: square(bytes[2], bytes[3])?,
        })
    }

    pub fn to_uci(self) -> String {
        let square = |s: Square| format!("{}{}", char::from(b'a' + s.col as u8), 9 - s.row);
        format!("{}{}", square(self.from), square(self.to))
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RuleError {
    #[error("无效走法记号: {0}")]
    InvalidNotation(String),
    #[error("起点没有棋子")]
    EmptyOrigin,
    #[error("尚未轮到该方行棋")]
    WrongTurn,
    #[error("不符合中国象棋规则")]
    IllegalMove,
    #[error("棋局已经结束")]
    GameOver,
}

#[derive(Clone)]
pub struct Board {
    squares: [Option<Piece>; ROWS * COLS],
    pub turn: Color,
    pub ply: usize,
}

impl Default for Board {
    fn default() -> Self {
        Self::initial()
    }
}

impl Board {
    pub fn initial() -> Self {
        let mut board = Self {
            squares: [None; ROWS * COLS],
            turn: Color::Red,
            ply: 0,
        };
        let back = [
            PieceKind::Chariot,
            PieceKind::Horse,
            PieceKind::Elephant,
            PieceKind::Advisor,
            PieceKind::General,
            PieceKind::Advisor,
            PieceKind::Elephant,
            PieceKind::Horse,
            PieceKind::Chariot,
        ];
        for (col, kind) in back.into_iter().enumerate() {
            board.set(
                Square { row: 0, col },
                Some(Piece {
                    kind,
                    color: Color::Black,
                }),
            );
            board.set(
                Square { row: 9, col },
                Some(Piece {
                    kind,
                    color: Color::Red,
                }),
            );
        }
        for (row, color) in [(2, Color::Black), (7, Color::Red)] {
            for col in [1, 7] {
                board.set(
                    Square { row, col },
                    Some(Piece {
                        kind: PieceKind::Cannon,
                        color,
                    }),
                );
            }
        }
        for (row, color) in [(3, Color::Black), (6, Color::Red)] {
            for col in [0, 2, 4, 6, 8] {
                board.set(
                    Square { row, col },
                    Some(Piece {
                        kind: PieceKind::Soldier,
                        color,
                    }),
                );
            }
        }
        board
    }

    pub fn replay(moves: &[String]) -> Result<Self, RuleError> {
        let mut board = Self::initial();
        for notation in moves {
            board.apply_move(Move::from_uci(notation)?)?;
        }
        Ok(board)
    }

    pub fn piece_at(&self, square: Square) -> Option<Piece> {
        self.squares[square.row * COLS + square.col]
    }

    fn set(&mut self, square: Square, piece: Option<Piece>) {
        self.squares[square.row * COLS + square.col] = piece;
    }

    pub fn legal_moves_from(&self, from: Square) -> Vec<Move> {
        let Some(piece) = self.piece_at(from) else {
            return Vec::new();
        };
        self.pseudo_moves(from, piece)
            .into_iter()
            .filter(|candidate| {
                let mut next = self.clone();
                next.apply_unchecked(*candidate);
                !next.is_in_check(piece.color)
            })
            .collect()
    }

    pub fn is_legal(&self, candidate: Move) -> bool {
        self.legal_moves_from(candidate.from).contains(&candidate)
    }

    pub fn apply_move(&mut self, candidate: Move) -> Result<Option<Piece>, RuleError> {
        if self.is_game_over() {
            return Err(RuleError::GameOver);
        }
        let piece = self
            .piece_at(candidate.from)
            .ok_or(RuleError::EmptyOrigin)?;
        if piece.color != self.turn {
            return Err(RuleError::WrongTurn);
        }
        if !self.is_legal(candidate) {
            return Err(RuleError::IllegalMove);
        }
        let captured = self.piece_at(candidate.to);
        self.apply_unchecked(candidate);
        self.turn = self.turn.opponent();
        self.ply += 1;
        Ok(captured)
    }

    fn apply_unchecked(&mut self, candidate: Move) {
        let piece = self.piece_at(candidate.from);
        self.set(candidate.from, None);
        self.set(candidate.to, piece);
    }

    pub fn is_in_check(&self, color: Color) -> bool {
        let general = (0..ROWS).find_map(|row| {
            (0..COLS).find_map(|col| {
                let square = Square { row, col };
                matches!(self.piece_at(square), Some(Piece { kind: PieceKind::General, color: c }) if c == color)
                    .then_some(square)
            })
        });
        let Some(general) = general else {
            return true;
        };
        for row in 0..ROWS {
            for col in 0..COLS {
                let from = Square { row, col };
                if let Some(piece) = self.piece_at(from)
                    && piece.color != color
                    && self
                        .pseudo_moves(from, piece)
                        .iter()
                        .any(|m| m.to == general)
                {
                    return true;
                }
            }
        }
        false
    }

    pub fn has_legal_moves(&self, color: Color) -> bool {
        (0..ROWS).any(|row| {
            (0..COLS).any(|col| {
                let square = Square { row, col };
                matches!(self.piece_at(square), Some(piece) if piece.color == color)
                    && !self.legal_moves_from(square).is_empty()
            })
        })
    }

    pub fn is_game_over(&self) -> bool {
        !self.has_legal_moves(self.turn)
    }

    pub fn fen(&self) -> String {
        let mut ranks = Vec::with_capacity(ROWS);
        for row in 0..ROWS {
            let mut rank = String::new();
            let mut empty = 0;
            for col in 0..COLS {
                if let Some(piece) = self.piece_at(Square { row, col }) {
                    if empty > 0 {
                        rank.push(
                            char::from_digit(empty, 10).expect("empty count is at most nine"),
                        );
                        empty = 0;
                    }
                    rank.push(piece.fen_char());
                } else {
                    empty += 1;
                }
            }
            if empty > 0 {
                rank.push(char::from_digit(empty, 10).expect("empty count is at most nine"));
            }
            ranks.push(rank);
        }
        let side = if self.turn == Color::Red { 'w' } else { 'b' };
        format!(
            "{} {side} - - {} {}",
            ranks.join("/"),
            self.ply,
            self.ply / 2 + 1
        )
    }

    fn pseudo_moves(&self, from: Square, piece: Piece) -> Vec<Move> {
        let mut moves = Vec::new();
        let mut push = |row: isize, col: isize| {
            if !(0..ROWS as isize).contains(&row) || !(0..COLS as isize).contains(&col) {
                return;
            }
            let to = Square {
                row: row as usize,
                col: col as usize,
            };
            if !matches!(self.piece_at(to), Some(target) if target.color == piece.color) {
                moves.push(Move { from, to });
            }
        };

        match piece.kind {
            PieceKind::General => {
                for (dr, dc) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                    let row = from.row as isize + dr;
                    let col = from.col as isize + dc;
                    if Self::in_palace(piece.color, row, col) {
                        push(row, col);
                    }
                }
                let direction = if piece.color == Color::Black { 1 } else { -1 };
                let mut row = from.row as isize + direction;
                while (0..ROWS as isize).contains(&row) {
                    let to = Square {
                        row: row as usize,
                        col: from.col,
                    };
                    if let Some(target) = self.piece_at(to) {
                        if target.color != piece.color && target.kind == PieceKind::General {
                            moves.push(Move { from, to });
                        }
                        break;
                    }
                    row += direction;
                }
            }
            PieceKind::Advisor => {
                for (dr, dc) in [(1, 1), (1, -1), (-1, 1), (-1, -1)] {
                    let row = from.row as isize + dr;
                    let col = from.col as isize + dc;
                    if Self::in_palace(piece.color, row, col) {
                        push(row, col);
                    }
                }
            }
            PieceKind::Elephant => {
                for (dr, dc) in [(2, 2), (2, -2), (-2, 2), (-2, -2)] {
                    let row = from.row as isize + dr;
                    let col = from.col as isize + dc;
                    if !(0..ROWS as isize).contains(&row) || !(0..COLS as isize).contains(&col) {
                        continue;
                    }
                    if (piece.color == Color::Red && row < 5)
                        || (piece.color == Color::Black && row > 4)
                        || self
                            .piece_at(Square {
                                row: (from.row as isize + dr / 2) as usize,
                                col: (from.col as isize + dc / 2) as usize,
                            })
                            .is_some()
                    {
                        continue;
                    }
                    push(row, col);
                }
            }
            PieceKind::Horse => {
                for (dr, dc, lr, lc) in [
                    (-2, -1, -1, 0),
                    (-2, 1, -1, 0),
                    (2, -1, 1, 0),
                    (2, 1, 1, 0),
                    (-1, -2, 0, -1),
                    (1, -2, 0, -1),
                    (-1, 2, 0, 1),
                    (1, 2, 0, 1),
                ] {
                    let leg_row = from.row as isize + lr;
                    let leg_col = from.col as isize + lc;
                    if (0..ROWS as isize).contains(&leg_row)
                        && (0..COLS as isize).contains(&leg_col)
                        && self
                            .piece_at(Square {
                                row: leg_row as usize,
                                col: leg_col as usize,
                            })
                            .is_some()
                    {
                        continue;
                    }
                    push(from.row as isize + dr, from.col as isize + dc);
                }
            }
            PieceKind::Chariot | PieceKind::Cannon => {
                for (dr, dc) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                    let mut row = from.row as isize + dr;
                    let mut col = from.col as isize + dc;
                    let mut screen = false;
                    while (0..ROWS as isize).contains(&row) && (0..COLS as isize).contains(&col) {
                        let to = Square {
                            row: row as usize,
                            col: col as usize,
                        };
                        let target = self.piece_at(to);
                        if piece.kind == PieceKind::Chariot {
                            if target.is_none() {
                                moves.push(Move { from, to });
                            } else {
                                if target.is_some_and(|p| p.color != piece.color) {
                                    moves.push(Move { from, to });
                                }
                                break;
                            }
                        } else if !screen {
                            if target.is_none() {
                                moves.push(Move { from, to });
                            } else {
                                screen = true;
                            }
                        } else if let Some(target) = target {
                            if target.color != piece.color {
                                moves.push(Move { from, to });
                            }
                            break;
                        }
                        row += dr;
                        col += dc;
                    }
                }
            }
            PieceKind::Soldier => {
                let forward = if piece.color == Color::Red { -1 } else { 1 };
                push(from.row as isize + forward, from.col as isize);
                let crossed = if piece.color == Color::Red {
                    from.row <= 4
                } else {
                    from.row >= 5
                };
                if crossed {
                    push(from.row as isize, from.col as isize - 1);
                    push(from.row as isize, from.col as isize + 1);
                }
            }
        }
        moves
    }

    fn in_palace(color: Color, row: isize, col: isize) -> bool {
        (3..=5).contains(&col)
            && match color {
                Color::Black => (0..=2).contains(&row),
                Color::Red => (7..=9).contains(&row),
            }
    }
}

impl Piece {
    fn fen_char(self) -> char {
        let ch = match self.kind {
            PieceKind::General => 'k',
            PieceKind::Advisor => 'a',
            PieceKind::Elephant => 'b',
            PieceKind::Horse => 'n',
            PieceKind::Chariot => 'r',
            PieceKind::Cannon => 'c',
            PieceKind::Soldier => 'p',
        };
        if self.color == Color::Red {
            ch.to_ascii_uppercase()
        } else {
            ch
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_position_and_fen_match_pikafish() {
        let board = Board::initial();
        assert_eq!(board.turn, Color::Red);
        assert_eq!(
            board.fen(),
            "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
        );
        let moves = (0..ROWS)
            .flat_map(|row| (0..COLS).map(move |col| Square { row, col }))
            .filter(|square| matches!(board.piece_at(*square), Some(p) if p.color == Color::Red))
            .map(|square| board.legal_moves_from(square).len())
            .sum::<usize>();
        assert_eq!(moves, 44);
    }

    #[test]
    fn uci_coordinates_match_frontend_rows() {
        let mv = Move::from_uci("b2e2").unwrap();
        assert_eq!(mv.from, Square { row: 7, col: 1 });
        assert_eq!(mv.to, Square { row: 7, col: 4 });
        assert_eq!(mv.to_uci(), "b2e2");
    }

    #[test]
    fn replay_rejects_illegal_history() {
        assert!(Board::replay(&["a0a9".to_owned()]).is_err());
        let board = Board::replay(&["b2e2".to_owned(), "b7e7".to_owned()]).unwrap();
        assert_eq!(board.turn, Color::Red);
        assert_eq!(board.ply, 2);
    }
}
