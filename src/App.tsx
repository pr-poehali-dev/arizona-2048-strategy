import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

type Tab = "dashboard" | "stats" | "settings" | "logs";
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

function Sidebar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; icon: string; label: string }[] = [
    { id: "dashboard", icon: "LayoutDashboard", label: "Главная" },
    { id: "stats", icon: "BarChart2", label: "Статистика" },
    { id: "settings", icon: "SlidersHorizontal", label: "Настройки" },
    { id: "logs", icon: "Terminal", label: "Логи" },
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

function Dashboard({
  status,
  stats,
  onStart,
  onPause,
  onStop,
  elapsed,
}: {
  status: BotStatus;
  stats: GameStats;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  elapsed: number;
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
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Текущая игровая сетка</p>
        <div className="grid grid-cols-4 gap-2 max-w-[240px]">
          {[2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 0, 0, 0, 0, 0].map((val, i) => (
            <div
              key={i}
              className={`h-14 rounded flex items-center justify-center font-mono text-sm font-semibold
                ${val === 0 ? "bg-muted text-transparent" : ""}
                ${val === 2 ? "bg-stone-700 text-stone-300" : ""}
                ${val === 4 ? "bg-stone-600 text-stone-200" : ""}
                ${val === 8 ? "bg-orange-900 text-orange-300" : ""}
                ${val === 16 ? "bg-orange-800 text-orange-200" : ""}
                ${val === 32 ? "bg-orange-700 text-orange-100" : ""}
                ${val === 64 ? "bg-amber-700 text-amber-100" : ""}
                ${val === 128 ? "bg-amber-600 text-amber-50" : ""}
                ${val === 256 ? "bg-amber-500 text-white" : ""}
                ${val === 512 ? "bg-yellow-500 text-white" : ""}
                ${val === 1024 ? "bg-yellow-400 text-black" : ""}
                ${val === 2048 ? "bg-primary text-primary-foreground glow-accent" : ""}
              `}
            >
              {val > 0 ? val : ""}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-3">
          {status === "running" ? "▶ Бот активен — захват экрана включён" : "⬜ Захват экрана отключён"}
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

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<BotStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [nextLogId, setNextLogId] = useState(10);

  const [algo, setAlgo] = useState("expectimax");
  const [depth, setDepth] = useState(4);
  const [speed, setSpeed] = useState(200);
  const [captureRegion, setCaptureRegion] = useState("100, 200, 600, 600");
  const [autoRestart, setAutoRestart] = useState(true);

  const [stats, setStats] = useState<GameStats>({
    gamesPlayed: 47,
    bestScore: 89420,
    avgScore: 31240,
    bestTile: 2048,
    winRate: 42,
    totalMoves: 18640,
    sessionTime: 7200,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIdRef = useRef(nextLogId);
  logIdRef.current = nextLogId;

  const addLog = (type: LogEntry["type"], message: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const id = logIdRef.current;
    setLogs((prev) => [...prev.slice(-199), { id, time, type, message }]);
    setNextLogId((n) => n + 1);
  };

  const handleStart = () => {
    setStatus("running");
    const algoLabel = ALGO_OPTIONS.find((a) => a.id === algo)?.label ?? algo;
    addLog("success", `Бот запущен. Алгоритм: ${algoLabel}, глубина: ${depth}`);
    addLog("info", `Скорость ходов: ${speed}мс. Захват: ${captureRegion}`);
  };

  const handlePause = () => {
    setStatus("paused");
    addLog("warn", "Бот приостановлен");
  };

  const handleStop = () => {
    setStatus("stopped");
    addLog("error", "Бот остановлен пользователем");
  };

  useEffect(() => {
    if (status === "running") {
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
        if (Math.random() < 0.3) {
          const moves = ["← Влево", "→ Вправо", "↑ Вверх", "↓ Вниз"];
          const move = moves[Math.floor(Math.random() * 4)];
          addLog("info", `Ход: ${move} | Оценка позиции: ${Math.floor(Math.random() * 9999 + 1000)}`);
        }
        if (Math.random() < 0.05) {
          const score = Math.floor(Math.random() * 50000 + 10000);
          addLog("success", `Партия завершена. Счёт: ${score.toLocaleString()}`);
          setStats((s) => ({
            ...s,
            gamesPlayed: s.gamesPlayed + 1,
            bestScore: Math.max(s.bestScore, score),
            totalMoves: s.totalMoves + Math.floor(Math.random() * 300 + 100),
          }));
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

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
      </main>
    </div>
  );
}
