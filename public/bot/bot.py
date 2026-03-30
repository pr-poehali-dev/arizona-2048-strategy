"""
2048 Bot для Arizona RP
Захватывает экран, распознаёт сетку, запрашивает лучший ход у API и нажимает клавишу.

Запуск: python bot.py
"""

import time
import json
import urllib.request
import urllib.error
import sys

try:
    import numpy as np
    import cv2
    import pyautogui
    import mss
    from PIL import Image
except ImportError as e:
    print(f"[ОШИБКА] Не установлены зависимости: {e}")
    print("Запусти: pip install opencv-python pyautogui mss pillow numpy")
    sys.exit(1)

# ─── Настройки ────────────────────────────────────────────────────────────────

API_URL = "https://functions.poehali.dev/d390d2b7-394b-4cb7-b079-2edb715fa0b8"
ALGO = "expectimax"
DEPTH = 4
MOVE_DELAY = 0.3       # секунд между ходами
SCAN_DELAY = 0.15      # секунд после хода перед следующим скриншотом
AUTO_DETECT = True     # автоматически найти окно игры

# Ручные координаты (используются если AUTO_DETECT = False или автопоиск не сработал)
# Формат: (x, y, ширина, высота) — область с игровой сеткой 4x4
MANUAL_REGION = (100, 200, 500, 500)

# Цвета плиток 2048 (BGR для OpenCV) — для Arizona RP могут отличаться
TILE_COLORS = {
    (205, 193, 180): 0,
    (238, 228, 218): 2,
    (237, 224, 200): 4,
    (242, 177, 121): 8,
    (245, 149, 99):  16,
    (246, 124, 95):  32,
    (246, 94,  59):  64,
    (237, 207, 114): 128,
    (237, 204, 97):  256,
    (237, 200, 80):  512,
    (237, 197, 63):  1024,
    (237, 194, 46):  2048,
}

MOVE_KEYS = {
    "up":    "up",
    "down":  "down",
    "left":  "left",
    "right": "right",
}

# ─── Утилиты ──────────────────────────────────────────────────────────────────

def log(msg, level="INFO"):
    icons = {"INFO": "·", "OK": "✓", "WARN": "!", "ERR": "✗"}
    icon = icons.get(level, "·")
    print(f"[{icon}] {msg}")


def color_distance(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


def nearest_tile(color_bgr):
    best_val = 0
    best_dist = float("inf")
    for tile_color, val in TILE_COLORS.items():
        d = color_distance(color_bgr, tile_color)
        if d < best_dist:
            best_dist = d
            best_val = val
    return best_val if best_dist < 40 else 0


# ─── Захват экрана ────────────────────────────────────────────────────────────

def capture_region(region):
    """Делает скриншот указанной области экрана."""
    x, y, w, h = region
    with mss.mss() as sct:
        monitor = {"top": y, "left": x, "width": w, "height": h}
        screenshot = sct.grab(monitor)
        img = np.array(screenshot)
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)


def auto_detect_game_region():
    """
    Пытается найти игровую сетку на экране по характерному цвету фона 2048.
    Возвращает (x, y, w, h) или None если не нашёл.
    """
    log("Ищу игровую область на экране...")
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        screenshot = sct.grab(monitor)
        img = np.array(screenshot)
        img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    # Ищем характерный цвет фона сетки 2048 (коричневато-бежевый)
    lower = np.array([160, 170, 180], dtype=np.uint8)
    upper = np.array([220, 210, 220], dtype=np.uint8)
    mask = cv2.inRange(img_bgr, lower, upper)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    if area < 10000:
        return None

    x, y, w, h = cv2.boundingRect(largest)
    log(f"Найдена область: x={x}, y={y}, w={w}, h={h}", "OK")
    return (x, y, w, h)


# ─── Распознавание доски ──────────────────────────────────────────────────────

def read_board_from_image(img):
    """
    Читает состояние доски 4x4 из изображения игровой области.
    Делит изображение на 16 ячеек и определяет значение каждой по цвету.
    """
    h, w = img.shape[:2]
    cell_w = w // 4
    cell_h = h // 4
    board = []

    for row in range(4):
        board_row = []
        for col in range(4):
            x1 = col * cell_w + cell_w // 4
            y1 = row * cell_h + cell_h // 4
            x2 = x1 + cell_w // 2
            y2 = y1 + cell_h // 2
            cell = img[y1:y2, x1:x2]
            avg_color = tuple(int(c) for c in cv2.mean(cell)[:3])
            val = nearest_tile(avg_color)
            board_row.append(val)
        board.append(board_row)

    return board


def board_has_tiles(board):
    return any(v > 0 for row in board for v in row)


def boards_equal(b1, b2):
    return all(b1[r][c] == b2[r][c] for r in range(4) for c in range(4))


# ─── API ──────────────────────────────────────────────────────────────────────

def get_best_move(board, algo=ALGO, depth=DEPTH):
    """Запрашивает лучший ход у API."""
    payload = json.dumps({
        "board": board,
        "algo": algo,
        "depth": depth,
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, str):
                data = json.loads(data)
            return data
    except urllib.error.URLError as e:
        log(f"Ошибка API: {e}", "ERR")
        return None


# ─── Основной цикл ────────────────────────────────────────────────────────────

def print_board(board):
    print("  ┌────────────────────────┐")
    for row in board:
        cells = " ".join(f"{v:>5}" if v > 0 else "    ·" for v in row)
        print(f"  │ {cells} │")
    print("  └────────────────────────┘")


def run_bot(region):
    log(f"Бот запущен. Регион: {region}", "OK")
    log(f"Алгоритм: {ALGO}, глубина: {DEPTH}, задержка: {MOVE_DELAY}с")
    log("Нажми Ctrl+C для остановки\n")

    moves_count = 0
    prev_board = None
    stuck_count = 0
    game_num = 1

    try:
        while True:
            img = capture_region(region)
            board = read_board_from_image(img)

            if not board_has_tiles(board):
                log("Плитки не найдены. Проверь координаты региона.", "WARN")
                time.sleep(1)
                continue

            if prev_board and boards_equal(board, prev_board):
                stuck_count += 1
                if stuck_count > 5:
                    log("Доска не меняется — возможно игра завершена", "WARN")
                    stuck_count = 0
                    time.sleep(1)
                    continue
            else:
                stuck_count = 0

            max_tile = max(v for row in board for v in row)
            log(f"Партия #{game_num} | Ход #{moves_count} | Макс. плитка: {max_tile}")
            print_board(board)

            result = get_best_move(board)
            if not result:
                time.sleep(1)
                continue

            if result.get("game_over") or not result.get("move"):
                log(f"Игра окончена! Лучшая плитка: {max_tile}", "OK")
                game_num += 1
                moves_count = 0
                time.sleep(2)
                continue

            move = result["move"]
            score = result.get("score", 0)
            log(f"Ход: {move.upper()} | Оценка: {int(score):,}", "OK")

            key = MOVE_KEYS[move]
            pyautogui.press(key)
            moves_count += 1
            prev_board = board

            time.sleep(MOVE_DELAY)
            time.sleep(SCAN_DELAY)

    except KeyboardInterrupt:
        log(f"\nБот остановлен. Всего ходов: {moves_count}", "OK")


# ─── Запуск ───────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  2048 BOT — Arizona RP")
    print("=" * 50)
    print()

    region = None

    if AUTO_DETECT:
        region = auto_detect_game_region()

    if not region:
        log("Автопоиск не сработал, использую ручные координаты", "WARN")
        log("Отредактируй MANUAL_REGION в начале файла bot.py", "WARN")
        region = MANUAL_REGION

    log("Через 3 секунды бот начнёт работу. Переключись на окно игры!")
    for i in range(3, 0, -1):
        print(f"  {i}...")
        time.sleep(1)

    run_bot(region)


if __name__ == "__main__":
    main()
