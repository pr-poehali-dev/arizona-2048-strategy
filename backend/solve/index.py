"""
Бэкенд-функция для вычисления оптимального хода в игре 2048.
Использует алгоритм Expectimax с эвристической оценкой позиции.
"""

import json
import math
from typing import Optional


MOVES = ["up", "down", "left", "right"]


def transpose(board):
    return [[board[r][c] for r in range(4)] for c in range(4)]


def reverse_rows(board):
    return [row[::-1] for row in board]


def merge_left(board):
    score = 0
    new_board = []
    moved = False
    for row in board:
        tiles = [x for x in row if x != 0]
        merged = []
        skip = False
        for i in range(len(tiles)):
            if skip:
                skip = False
                continue
            if i + 1 < len(tiles) and tiles[i] == tiles[i + 1]:
                val = tiles[i] * 2
                merged.append(val)
                score += val
                skip = True
            else:
                merged.append(tiles[i])
        merged += [0] * (4 - len(merged))
        if merged != row:
            moved = True
        new_board.append(merged)
    return new_board, score, moved


def apply_move(board, move):
    if move == "left":
        new_board, score, moved = merge_left(board)
    elif move == "right":
        b, score, moved = merge_left(reverse_rows(board))
        new_board = reverse_rows(b)
    elif move == "up":
        b, score, moved = merge_left(transpose(board))
        new_board = transpose(b)
    elif move == "down":
        b, score, moved = merge_left(reverse_rows(transpose(board)))
        new_board = transpose(reverse_rows(b))
    else:
        return board, 0, False
    return new_board, score, moved


def get_empty_cells(board):
    return [(r, c) for r in range(4) for c in range(4) if board[r][c] == 0]


def heuristic(board):
    empty = len(get_empty_cells(board))
    flat = [board[r][c] for r in range(4) for c in range(4)]
    max_tile = max(flat)

    # Монотонность — предпочитаем убывающий порядок
    mono_score = 0
    for row in board:
        for i in range(3):
            if row[i] >= row[i + 1]:
                mono_score += row[i] - row[i + 1]
            else:
                mono_score -= row[i + 1] - row[i]
    for col in range(4):
        column = [board[r][col] for r in range(4)]
        for i in range(3):
            if column[i] >= column[i + 1]:
                mono_score += column[i] - column[i + 1]
            else:
                mono_score -= column[i + 1] - column[i]

    # Угловой бонус — большая плитка в углу
    corner_bonus = 0
    corners = [board[0][0], board[0][3], board[3][0], board[3][3]]
    if max_tile in corners:
        corner_bonus = max_tile * 2

    # Сглаженность — штраф за большие перепады соседних плиток
    smoothness = 0
    for r in range(4):
        for c in range(4):
            if board[r][c] != 0:
                if c + 1 < 4 and board[r][c + 1] != 0:
                    smoothness -= abs(math.log2(board[r][c]) - math.log2(board[r][c + 1]))
                if r + 1 < 4 and board[r + 1][c] != 0:
                    smoothness -= abs(math.log2(board[r][c]) - math.log2(board[r + 1][c]))

    return (
        empty * 270
        + corner_bonus
        + mono_score * 1.5
        + smoothness * 30
        + math.log2(max_tile) * 100 if max_tile > 0 else 0
    )


def expectimax(board, depth, is_max_node):
    empty = get_empty_cells(board)
    if depth == 0 or (not is_max_node and len(empty) == 0):
        return heuristic(board)

    if is_max_node:
        best = -float("inf")
        for move in MOVES:
            new_board, _, moved = apply_move(board, move)
            if not moved:
                continue
            val = expectimax(new_board, depth - 1, False)
            if val > best:
                best = val
        return best if best != -float("inf") else heuristic(board)
    else:
        if not empty:
            return heuristic(board)
        # Оцениваем случайные тайлы (2 с вероятностью 0.9, 4 с вероятностью 0.1)
        total = 0.0
        sample = empty if len(empty) <= 6 else empty[:6]
        for (r, c) in sample:
            for tile, prob in [(2, 0.9), (4, 0.1)]:
                new_board = [row[:] for row in board]
                new_board[r][c] = tile
                total += prob * expectimax(new_board, depth - 1, True)
        return total / len(sample)


def best_move(board, depth=4):
    best = -float("inf")
    chosen = None
    for move in MOVES:
        new_board, merge_score, moved = apply_move(board, move)
        if not moved:
            continue
        val = expectimax(new_board, depth - 1, False) + merge_score * 10
        if val > best:
            best = val
            chosen = move
    return chosen, best


def handler(event: dict, context) -> dict:
    """
    Вычисляет оптимальный ход для игры 2048 на основе алгоритма Expectimax.
    Принимает: board (4x4 список), algo (строка), depth (int, 1-6).
    Возвращает: move (строка), score (float), all_moves (dict).
    """
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": cors, "body": {"error": "Invalid JSON"}}

    board = body.get("board")
    depth = min(int(body.get("depth", 4)), 6)
    algo = body.get("algo", "expectimax")

    # Валидация доски
    if not board or len(board) != 4 or any(len(row) != 4 for row in board):
        return {
            "statusCode": 400,
            "headers": cors,
            "body": {"error": "board must be 4x4 array"},
        }

    # Для простых алгоритмов уменьшаем глубину
    if algo == "greedy":
        depth = 1
    elif algo == "minimax":
        depth = min(depth, 4)

    move, score = best_move(board, depth)

    if not move:
        return {
            "statusCode": 200,
            "headers": cors,
            "body": {"move": None, "score": 0, "game_over": True},
        }

    # Считаем оценки для всех ходов
    all_scores = {}
    for m in MOVES:
        new_board, _, moved = apply_move(board, m)
        if moved:
            all_scores[m] = round(expectimax(new_board, max(depth - 2, 1), False), 1)
        else:
            all_scores[m] = None

    return {
        "statusCode": 200,
        "headers": cors,
        "body": {
            "move": move,
            "score": round(score, 1),
            "game_over": False,
            "all_moves": all_scores,
            "depth_used": depth,
            "algo": algo,
        },
    }