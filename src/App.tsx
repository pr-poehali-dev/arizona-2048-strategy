import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

const SOLVE_URL = "https://functions.poehali.dev/d390d2b7-394b-4cb7-b079-2edb715fa0b8";

async function fetchBestMove(board: number[][], algo: string, depth: number): Promise<{
  move: string | null;
  score: number;
  game_over: boolean;
  all_moves: Record<string, number | null>;
} | null> {
  try {
    const res = await fetch(SOLVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, algo, depth }),
    });
    const data = await res.json();
    if (typeof data === "string") return JSON.parse(data);
    return data;
  } catch {
    return null;
  }
}

function applyMove(board: number[][], move: string): { board: number[][]; score: number; moved: boolean } {
  const rotate = (b: number[][]) => b[0].map((_, i) => b.map((row) => row[i]).reverse());
  const mergeLeft = (b: number[][]) => {
    let score = 0;
    let moved = false;
    const nb = b.map((row) => {
      const tiles = row.filter((x) => x !== 0);
      const merged: number[] = [];
      let skip = false;
      for (let i = 0; i < tiles.length; i++) {
        if (skip) { skip = false; continue; }
        if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
          const v = tiles[i] * 2;
          merged.push(v);
          score += v;
          skip = true;
        } else merged.push(tiles[i]);
      }
      while (merged.length < 4) merged.push(0);
      if (merged.join() !== row.join()) moved = true;
      return merged;
    });
    return { board: nb, score, moved };
  };
  if (move === "left") return mergeLeft(board);
  if (move === "right") {
    const rev = board.map((r) => [...r].reverse());
    const { board: nb, score, moved } = mergeLeft(rev);
    return { board: nb.map((r) => [...r].reverse()), score, moved };
  }
  if (move === "up") {
    const tr = rotate(rotate(rotate(board)));
    const { board: nb, score, moved } = mergeLeft(tr);
    return { board: rotate(nb), score, moved };
  }
  if (move === "down") {
    const tr = rotate(board);
    const { board: nb, score, moved } = mergeLeft(tr);
    return { board: rotate(rotate(rotate(nb))), score, moved };
  }
  return { board, score: 0, moved: false };
}

function addRandomTile(board: number[][]): number[][] {
  const empty: [number, number][] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (board[r][c] === 0) empty.push([r, c]);
  if (!empty.length) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const nb = board.map((row) => [...row]);
  nb[r][c] = Math.random() < 0.9 ? 2 : 4;
  return nb;
}

function initBoard(): number[][] {
  let b = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  b = addRandomTile(b);
  b = addRandomTile(b);
  return b;
}

const MOVE_LABELS: Record<string, string> = {
  left: "← Влево",
  right: "→ Вправо",
  up: "↑ Вверх",
  down: "↓ Вниз",
};

type BotStatus = "idle" | "running" | "paused" | "stopped";

interface LogEntry {
  id: number;
  time: string;
  type: "info" | "success" | "warn" | "error";
  message: string;
}

interface GameStats {
  gamesPlayed: number;
  bestScore: number;
  avgScore: number;
  bestTile: number;
  winRate: number;
  totalMoves: number;
  sessionTime: number;
}

const ALGO_OPTIONS = [
  { id: "expectimax", label: "Expectimax", desc: "Лучший результат, медленнее" },
  { id: "minimax", label: "Minimax", desc: "Сбалансированный" },
  { id: "greedy", label: "Жадный алгоритм", desc: "Быстрый, менее точный" },
  { id: "mcts", label: "Monte Carlo", desc: "Вероятностный поиск" },
];

const INITIAL_LOGS: LogEntry[] = [
  { id: 1, time: "12:04:01", type: "info", message: "Система инициализирована" },
  { id: 2, time: "12:04:01", type: "info", message: "Алгоритм: Expectimax (глубина 4)" },
  { id: 3, time: "12:04:02", type: "success", message: "Готов к запуску" },
];

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusDot({ status }: { status: BotStatus }) {
  const colors: Record<BotStatus, string> = {
    idle: "bg-muted-foreground",
    running: "bg-green-400",
    paused: "bg-yellow-400",
    stopped: "bg-red-400",
  };
  const labels: Record<BotStatus, string> = {
    idle: "Ожидание",
    running: "Работает",
    paused: "Пауза",
    stopped: "Остановлен",
  };
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full ${colors[status]} ${status === "running" ? "animate-pulse-dot" : ""}`}
      />
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
        {labels[status]}
      </span>
    </div>
  );
}

type Tab = "dashboard" | "stats" | "settings" | "logs" | "setup";

function Sidebar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; icon: string; label: string }[] = [
    { id: "dashboard", icon: "LayoutDashboard", label: "Главная" },
    { id: "stats", icon: "BarChart2", label: "Статистика" },
    { id: "settings", icon: "SlidersHorizontal", label: "Настройки" },
    { id: "logs", icon: "Terminal", label: "Логи" },
    { id: "setup", icon: "MonitorDown", label: "Установка" },
  ];

  return (
    <aside className="w-56 bg-sidebar flex flex-col border-r border-border h-screen shrink-0">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-0.5">
          <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-mono font-bold">2K</span>
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">2048 BOT</span>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-1">Arizona RP</p>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150 text-left w-full
              ${active === item.id
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
          >
            <Icon name={item.icon} size={15} fallback="Circle" />
            <span className="font-mono">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground font-mono">v1.0.0</p>
      </div>
    </aside>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-card border rounded p-4 ${accent ? "border-accent-dim glow-accent" : "border-border"}`}>
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-2xl font-mono font-semibold ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground font-mono mt-1">{sub}</p>}
    </div>
  );
}

function tileColor(val: number) {
  if (val === 0) return "bg-muted text-transparent";
  if (val === 2) return "bg-stone-700 text-stone-300";
  if (val === 4) return "bg-stone-600 text-stone-200";
  if (val === 8) return "bg-orange-900 text-orange-300";
  if (val === 16) return "bg-orange-800 text-orange-200";
  if (val === 32) return "bg-orange-700 text-orange-100";
  if (val === 64) return "bg-amber-700 text-amber-100";
  if (val === 128) return "bg-amber-600 text-amber-50";
  if (val === 256) return "bg-amber-500 text-white";
  if (val === 512) return "bg-yellow-500 text-white";
  if (val === 1024) return "bg-yellow-400 text-black";
  if (val === 2048) return "bg-primary text-primary-foreground glow-accent";
  return "bg-primary text-primary-foreground glow-accent";
}

function Dashboard({
  status,
  stats,
  onStart,
  onPause,
  onStop,
  elapsed,
  board,
  lastMove,
  thinking,
}: {
  status: BotStatus;
  stats: GameStats;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  elapsed: number;
  board: number[][];
  lastMove: string | null;
  thinking: boolean;
}) {
  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-mono font-semibold">Панель управления</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">Бот для игры 2048 — Arizona RP</p>
        </div>
        <StatusDot status={status} />
      </div>

      <div className="bg-card border border-border rounded p-5 mb-5">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Управление ботом</p>
        <div className="flex items-center gap-3">
          {status === "idle" || status === "stopped" ? (
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded font-mono text-sm font-medium hover:opacity-90 transition-opacity glow-accent"
            >
              <Icon name="Play" size={14} />
              Запустить бота
            </button>
          ) : status === "running" ? (
            <button
              onClick={onPause}
              className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-black rounded font-mono text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Icon name="Pause" size={14} />
              Пауза
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded font-mono text-sm font-medium hover:opacity-90 transition-opacity glow-accent"
            >
              <Icon name="Play" size={14} />
              Продолжить
            </button>
          )}
          {(status === "running" || status === "paused") && (
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground border border-border rounded font-mono text-sm hover:bg-muted transition-colors"
            >
              <Icon name="Square" size={14} />
              Стоп
            </button>
          )}
        </div>

        {(status === "running" || status === "paused") && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Icon name="Clock" size={13} className="text-muted-foreground" />
              <span className="font-mono text-sm text-muted-foreground">Время:</span>
              <span className="font-mono text-sm text-foreground">{formatTime(elapsed)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="Gamepad2" size={13} className="text-muted-foreground" />
              <span className="font-mono text-sm text-muted-foreground">Партий:</span>
              <span className="font-mono text-sm text-foreground">{stats.gamesPlayed}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <MetricCard label="Лучший счёт" value={stats.bestScore.toLocaleString()} sub="за всё время" accent />
        <MetricCard label="Лучшая плитка" value={stats.bestTile} sub="максимум" />
        <MetricCard label="Партий сыграно" value={stats.gamesPlayed} sub="всего" />
        <MetricCard label="Процент побед" value={`${stats.winRate}%`} sub="до плитки 2048" />
      </div>

      <div className="bg-card border border-border rounded p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Игровая сетка</p>
          {lastMove && (
            <span className="font-mono text-xs text-accent bg-primary/10 px-2 py-0.5 rounded">
              {MOVE_LABELS[lastMove] ?? lastMove}
            </span>
          )}
          {thinking && (
            <span className="font-mono text-xs text-yellow-400 animate-pulse-dot">⏳ Вычисляю...</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 max-w-[240px]">
          {board.flat().map((val, i) => (
            <div
              key={i}
              className={`h-14 rounded flex items-center justify-center font-mono text-sm font-semibold transition-colors duration-200 ${tileColor(val)}`}
            >
              {val > 0 ? val : ""}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-3">
          {status === "running" ? "▶ Бот активен — алгоритм работает" : status === "paused" ? "⏸ Пауза" : "⬜ Бот не запущен"}
        </p>
      </div>
    </div>
  );
}

function Stats({ stats }: { stats: GameStats }) {
  const data = [
    { label: "Пн", score: 18400 },
    { label: "Вт", score: 14200 },
    { label: "Ср", score: 22800 },
    { label: "Чт", score: 17600 },
    { label: "Пт", score: 28000 },
    { label: "Сб", score: 31200 },
    { label: "Вс", score: 12400 },
  ];
  const maxScore = Math.max(...data.map((d) => d.score));

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-lg font-mono font-semibold">Статистика</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">История игр и результатов</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Всего партий" value={stats.gamesPlayed} accent />
        <MetricCard label="Средний счёт" value={stats.avgScore.toLocaleString()} />
        <MetricCard label="Всего ходов" value={stats.totalMoves.toLocaleString()} />
        <MetricCard label="Лучший счёт" value={stats.bestScore.toLocaleString()} accent />
        <MetricCard label="Лучшая плитка" value={stats.bestTile} />
        <MetricCard label="Время сессии" value={formatTime(stats.sessionTime)} />
      </div>

      <div className="bg-card border border-border rounded p-5">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-5">Счёт по дням</p>
        <div className="flex items-end gap-3 h-32">
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-full relative" style={{ height: "96px" }}>
                <div
                  className="absolute bottom-0 w-full bg-primary rounded-sm opacity-80 transition-all duration-500"
                  style={{ height: `${(d.score / maxScore) * 96}px` }}
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-3 border-t border-border pt-3">
          <span className="text-xs font-mono text-muted-foreground">Неделя</span>
          <span className="text-xs font-mono text-accent">Лучший день: Сб (31 200)</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded p-5 mt-3">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Распределение плиток</p>
        {[2048, 1024, 512, 256].map((tile, i) => {
          const pct = [42, 61, 78, 95][i];
          return (
            <div key={tile} className="flex items-center gap-4 mb-3">
              <span className="font-mono text-sm w-12 text-right text-foreground">{tile}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-muted-foreground w-8">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings({
  algo, setAlgo, depth, setDepth, speed, setSpeed,
  captureRegion, setCaptureRegion, autoRestart, setAutoRestart,
}: {
  algo: string; setAlgo: (v: string) => void;
  depth: number; setDepth: (v: number) => void;
  speed: number; setSpeed: (v: number) => void;
  captureRegion: string; setCaptureRegion: (v: string) => void;
  autoRestart: boolean; setAutoRestart: (v: boolean) => void;
}) {
  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-lg font-mono font-semibold">Настройки</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">Алгоритм и параметры бота</p>
      </div>

      <div className="bg-card border border-border rounded p-5 mb-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Алгоритм</p>
        <div className="grid grid-cols-2 gap-2">
          {ALGO_OPTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAlgo(a.id)}
              className={`text-left p-3 rounded border transition-all duration-150
                ${algo === a.id
                  ? "border-primary bg-primary/10 text-foreground glow-accent"
                  : "border-border bg-muted hover:border-muted-foreground text-muted-foreground"
                }`}
            >
              <p className="font-mono text-sm font-medium">{a.label}</p>
              <p className="font-mono text-xs mt-0.5 opacity-70">{a.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded p-5 mb-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-5">Параметры</p>
        <div className="mb-5">
          <div className="flex justify-between mb-2">
            <label className="font-mono text-sm text-foreground">Глубина поиска</label>
            <span className="font-mono text-sm text-accent">{depth}</span>
          </div>
          <input
            type="range" min={1} max={8} value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full accent-yellow-400 cursor-pointer"
          />
          <div className="flex justify-between mt-1">
            <span className="font-mono text-xs text-muted-foreground">1 — быстро</span>
            <span className="font-mono text-xs text-muted-foreground">8 — точно</span>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-2">
            <label className="font-mono text-sm text-foreground">Скорость ходов</label>
            <span className="font-mono text-sm text-accent">{speed} мс</span>
          </div>
          <input
            type="range" min={50} max={1000} step={50} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-yellow-400 cursor-pointer"
          />
          <div className="flex justify-between mt-1">
            <span className="font-mono text-xs text-muted-foreground">50мс — максимум</span>
            <span className="font-mono text-xs text-muted-foreground">1000мс — медленно</span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded p-5 mb-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Захват экрана</p>
        <div className="mb-4">
          <label className="font-mono text-xs text-muted-foreground block mb-1.5">Регион захвата (x, y, w, h)</label>
          <input
            type="text" value={captureRegion}
            onChange={(e) => setCaptureRegion(e.target.value)}
            placeholder="100, 200, 600, 600"
            className="w-full bg-muted border border-border rounded px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-sm text-foreground">Авто-перезапуск</p>
            <p className="font-mono text-xs text-muted-foreground">Начинать новую партию автоматически</p>
          </div>
          <button
            onClick={() => setAutoRestart(!autoRestart)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${autoRestart ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${autoRestart ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      <button className="w-full py-2.5 bg-primary text-primary-foreground font-mono text-sm rounded font-medium hover:opacity-90 transition-opacity glow-accent">
        Сохранить настройки
      </button>
    </div>
  );
}

function Logs({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const typeStyle: Record<string, string> = {
    info: "text-blue-400",
    success: "text-green-400",
    warn: "text-yellow-400",
    error: "text-red-400",
  };
  const typePrefix: Record<string, string> = {
    info: "INFO ",
    success: "OK   ",
    warn: "WARN ",
    error: "ERR  ",
  };

  return (
    <div className="p-6 animate-fade-in flex flex-col" style={{ height: "100vh" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-mono font-semibold">Логи</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">История действий бота</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot" />
          <span className="font-mono text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="font-mono text-xs text-muted-foreground ml-2">bot.log</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 scanline">
          {logs.map((log) => (
            <div key={log.id} className="log-item flex gap-3">
              <span className="text-muted-foreground shrink-0">{log.time}</span>
              <span className={`shrink-0 ${typeStyle[log.type]}`}>{typePrefix[log.type]}</span>
              <span className="text-foreground">{log.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="flex-1 bg-muted border border-border rounded px-3 py-2 font-mono text-xs text-muted-foreground flex items-center gap-2">
          <span className="text-accent animate-blink">▌</span>
          <span>Ожидание команды...</span>
        </div>
        <button className="px-4 py-2 bg-secondary border border-border rounded font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">
          Очистить
        </button>
      </div>
    </div>
  );
}

function Setup() {
  const steps = [
    {
      num: "01",
      title: "Скачай файлы бота",
      desc: "Открой сайт → Скачать → Скачать код. В папке public/bot/ находятся все нужные файлы.",
      code: null,
    },
    {
      num: "02",
      title: "Установи Python",
      desc: 'Скачай Python 3.x с python.org. При установке обязательно отметь "Add Python to PATH".',
      code: null,
    },
    {
      num: "03",
      title: "Установи зависимости",
      desc: "Запусти setup.bat двойным кликом — он автоматически установит все библиотеки.",
      code: "pip install opencv-python pyautogui mss pillow numpy",
    },
    {
      num: "04",
      title: "Настрой координаты",
      desc: "Открой bot.py в блокноте. Найди MANUAL_REGION и укажи координаты окна с игрой (x, y, ширина, высота).",
      code: "MANUAL_REGION = (100, 200, 500, 500)",
    },
    {
      num: "05",
      title: "Запусти бота",
      desc: "Открой игру 2048 в Arizona RP. Запусти run.bat. Бот начнёт через 3 секунды — переключись на игру.",
      code: "python bot.py",
    },
  ];

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-lg font-mono font-semibold">Установка бота</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">Инструкция по запуску на компьютере</p>
      </div>

      <div className="bg-card border border-primary/30 rounded p-4 mb-6 glow-accent">
        <div className="flex items-start gap-3">
          <Icon name="Download" size={16} className="text-accent mt-0.5 shrink-0" />
          <div>
            <p className="font-mono text-sm text-foreground font-medium">Скачай файлы бота</p>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              Нажми <span className="text-accent">Скачать → Скачать код</span> на этом сайте.
              Файлы бота находятся в папке <span className="text-accent font-mono">public/bot/</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {steps.map((step) => (
          <div key={step.num} className="bg-card border border-border rounded p-4">
            <div className="flex items-start gap-4">
              <span className="font-mono text-2xl font-bold text-primary/40 shrink-0 leading-none">{step.num}</span>
              <div className="flex-1">
                <p className="font-mono text-sm font-medium text-foreground mb-1">{step.title}</p>
                <p className="font-mono text-xs text-muted-foreground">{step.desc}</p>
                {step.code && (
                  <div className="mt-2 bg-muted rounded px-3 py-2 font-mono text-xs text-accent border border-border">
                    {step.code}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded p-5">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Частые проблемы</p>
        <div className="space-y-3">
          {[
            { q: "Бот не видит плитки", a: "Настрой MANUAL_REGION — укажи точные координаты сетки 4×4 в игре" },
            { q: "Python не найден", a: 'При установке Python отметь галочку "Add Python to PATH"' },
            { q: "Бот нажимает не туда", a: "Переключись на окно игры до запуска бота. Фокус должен быть на игре" },
            { q: "Ошибка pip install", a: "Запусти cmd от имени администратора и повтори команду" },
          ].map((item) => (
            <div key={item.q} className="flex gap-3">
              <Icon name="AlertCircle" size={14} className="text-yellow-400 shrink-0 mt-0.5" fallback="CircleAlert" />
              <div>
                <p className="font-mono text-xs font-medium text-foreground">{item.q}</p>
                <p className="font-mono text-xs text-muted-foreground">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<BotStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [nextLogId, setNextLogId] = useState(10);
  const [board, setBoard] = useState<number[][]>(initBoard);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);

  const [algo, setAlgo] = useState("expectimax");
  const [depth, setDepth] = useState(4);
  const [speed, setSpeed] = useState(300);
  const [captureRegion, setCaptureRegion] = useState("100, 200, 600, 600");
  const [autoRestart, setAutoRestart] = useState(true);

  const [stats, setStats] = useState<GameStats>({
    gamesPlayed: 0,
    bestScore: 0,
    avgScore: 0,
    bestTile: 0,
    winRate: 0,
    totalMoves: 0,
    sessionTime: 0,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const logIdRef = useRef(nextLogId);
  const boardRef = useRef(board);
  const scoreRef = useRef(currentScore);
  const statsRef = useRef(stats);
  logIdRef.current = nextLogId;
  boardRef.current = board;
  scoreRef.current = currentScore;
  statsRef.current = stats;

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const id = logIdRef.current;
    setLogs((prev) => [...prev.slice(-299), { id, time, type, message }]);
    setNextLogId((n) => n + 1);
  }, []);

  const runGameLoop = useCallback(async () => {
    const currentBoard = boardRef.current;
    setThinking(true);
    const result = await fetchBestMove(currentBoard, algo, depth);
    setThinking(false);

    if (!result || result.game_over || !result.move) {
      const finalScore = scoreRef.current;
      const maxTile = Math.max(...boardRef.current.flat());
      addLog("warn", `Игра окончена. Счёт: ${finalScore.toLocaleString()} | Плитка: ${maxTile}`);
      setStats((s) => {
        const games = s.gamesPlayed + 1;
        const best = Math.max(s.bestScore, finalScore);
        const bestT = Math.max(s.bestTile, maxTile);
        const avgS = Math.round((s.avgScore * s.gamesPlayed + finalScore) / games);
        const wins = maxTile >= 2048 ? s.winRate + 1 : s.winRate;
        return { ...s, gamesPlayed: games, bestScore: best, bestTile: bestT, avgScore: avgS, winRate: wins };
      });
      if (autoRestart && runningRef.current) {
        const newBoard = initBoard();
        setBoard(newBoard);
        setCurrentScore(0);
        addLog("info", "Новая партия началась");
      } else {
        runningRef.current = false;
        setStatus("stopped");
      }
      return;
    }

    const { board: newBoard, score: moveScore, moved } = applyMove(currentBoard, result.move);
    if (!moved) return;

    const withTile = addRandomTile(newBoard);
    setBoard(withTile);
    setLastMove(result.move);
    setCurrentScore((s) => s + moveScore);
    setStats((s) => ({ ...s, totalMoves: s.totalMoves + 1 }));
    addLog("info", `${MOVE_LABELS[result.move]} | +${moveScore} | Оценка: ${Math.round(result.score).toLocaleString()}`);
  }, [algo, depth, autoRestart, addLog]);

  useEffect(() => {
    if (status !== "running") return;
    const tick = async () => {
      if (!runningRef.current) return;
      await runGameLoop();
      if (runningRef.current) {
        timerRef.current = setTimeout(tick, speed) as unknown as ReturnType<typeof setInterval>;
      }
    };
    timerRef.current = setTimeout(tick, speed) as unknown as ReturnType<typeof setInterval>;
    return () => { if (timerRef.current) clearTimeout(timerRef.current as unknown as ReturnType<typeof setTimeout>); };
  }, [status, speed, runGameLoop]);

  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => {
      setElapsed((e) => e + 1);
      setStats((s) => ({ ...s, sessionTime: s.sessionTime + 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleStart = () => {
    runningRef.current = true;
    if (status === "idle" || status === "stopped") {
      setBoard(initBoard());
      setCurrentScore(0);
      setElapsed(0);
    }
    setStatus("running");
    const algoLabel = ALGO_OPTIONS.find((a) => a.id === algo)?.label ?? algo;
    addLog("success", `Бот запущен. Алгоритм: ${algoLabel}, глубина: ${depth}, скорость: ${speed}мс`);
  };

  const handlePause = () => {
    runningRef.current = false;
    setStatus("paused");
    addLog("warn", "Бот приостановлен");
  };

  const handleStop = () => {
    runningRef.current = false;
    setStatus("stopped");
    addLog("error", "Бот остановлен пользователем");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar active={tab} onChange={setTab} />
      <main className="flex-1 overflow-y-auto">
        {tab === "dashboard" && (
          <Dashboard
            status={status}
            stats={stats}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            elapsed={elapsed}
            board={board}
            lastMove={lastMove}
            thinking={thinking}
          />
        )}
        {tab === "stats" && <Stats stats={stats} />}
        {tab === "settings" && (
          <Settings
            algo={algo} setAlgo={setAlgo}
            depth={depth} setDepth={setDepth}
            speed={speed} setSpeed={setSpeed}
            captureRegion={captureRegion} setCaptureRegion={setCaptureRegion}
            autoRestart={autoRestart} setAutoRestart={setAutoRestart}
          />
        )}
        {tab === "logs" && <Logs logs={logs} />}
        {tab === "setup" && <Setup />}
      </main>
    </div>
  );
}