import React, { useEffect, useMemo, useState } from "react";

/* ==================== CSV Utils ==================== */
function toCSV(rows, headers, delimiter = ";") {
  const escapeCell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const headerLine = headers.map((h) => h.header).join(delimiter);
  const lines = rows.map((row) =>
    headers.map((h) => escapeCell(h.accessor(row))).join(delimiter)
  );
  return "\uFEFF" + [headerLine, ...lines].join("\r\n"); // BOM p/ Excel PT-BR
}

function downloadCSV(filename, csvString) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ==================== CONFIG ==================== */
const STEPS = [
  { id: 1, label: "1 - Recebimento do Pedido" },
  { id: 2, label: "2 - Recebimento de Materiais" },
  { id: 3, label: "3 - Fila de produção" },
  { id: 4, label: "4 - Em Produção" },
  { id: 5, label: "5 - Faturado" },
  { id: 6, label: "6 - Entrega Realizada" },
];

// cor por etapa (1..6)
const STEP_COLOR = {
  1: "bg-slate-400",
  2: "bg-amber-500",
  3: "bg-sky-500",
  4: "bg-emerald-600",
  5: "bg-indigo-600",
  6: "bg-gray-700",
};

const statusTone = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("aguardando")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (s.includes("cancel")) return "bg-red-50 text-red-700 border-red-200";
  if (s.includes("entrega") || s.includes("faturado")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("linha")) return "bg-emerald-50 text-emerald-700 border-emerald-200"; // produção: verde
  return "bg-slate-50 text-slate-700 border-slate-200";
};

const etapaIndex = (etapa) => {
  if (!etapa) return 1;
  const m = String(etapa).match(/^(\d+)/);
  const idx = m ? parseInt(m[1], 10) : 1;
  return Math.min(Math.max(idx, 1), STEPS.length);
};

const formatDate = (d) => {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  try {
    return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return date.toLocaleDateString("pt-BR");
  }
};

const daysDiff = (a, b = new Date()) => {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.ceil((da - db) / (1000 * 60 * 60 * 24));
};

/* ===== Helpers de datas para a timeline ===== */
function getRange(items) {
  // menor dataEmissao e maior previsaoEntrega
  let min = null, max = null;
  for (const o of items) {
    const a = new Date(o.dataEmissao);
    const b = new Date(o.previsaoEntrega);
    if (!isNaN(a)) min = min ? Math.min(min, +a) : +a;
    if (!isNaN(b)) max = max ? Math.max(max, +b) : +b;
  }
  if (!min || !max) {
    const now = +new Date();
    return { min: now, max: now + 1000 * 60 * 60 * 24 * 30 };
  }
  return { min, max };
}

function dateToPct(d, min, max) {
  const x = +new Date(d);
  const clamped = Math.min(Math.max(x, min), max);
  return ((clamped - min) / (max - min)) * 100;
}

function monthTicks(min, max, limit = 24) {
  // gera ticks mensais do 1º dia do mês de min até o mês de max (com limite p/ não poluir)
  const start = new Date(min); start.setDate(1);
  const end = new Date(max); end.setDate(1);
  const ticks = [];
  let i = 0;
  while (start <= end && i < limit) {
    ticks.push(new Date(start));
    start.setMonth(start.getMonth() + 1);
    i++;
  }
  return ticks;
}

/* ============== DADOS EXEMPLO (troque pela sua origem) ============== */
const SAMPLE = [
  /* {
    industria: "KDU",
    dataEmissao: "2025-06-09",
    faturado: 31,
    pendente: 0,
    numeroERP: "180193",
    previsaoEntrega: "2025-06-16",
    etapa: "6 - Entrega Realizada",
    status: "Concluído",
    produtos: "Calça Jeans/Sarja",
  },
  {
    industria: "KDU",
    dataEmissao: "2025-06-09",
    faturado: 72,
    pendente: 0,
    numeroERP: "180194",
    previsaoEntrega: "2025-07-09",
    etapa: "6 - Entrega Realizada",
    status: "Concluído",
    produtos: "Terno",
  },
  {
    industria: "KDU",
    dataEmissao: "2025-07-16",
    faturado: 12,
    pendente: 0,
    numeroERP: "181838",
    previsaoEntrega: "2025-08-21",
    etapa: "6 - Entrega Realizada",
    status: "Concluído",
    produtos: "Terno",
  },*/
  {
    industria: "KDU",
    dataEmissao: "2025-09-05",
    faturado: 0,
    pendente: 70,
    numeroERP: "184709",
    previsaoEntrega: "2025-11-04",
    etapa: "4 - Em Produção",
    status: "Na linha de produção",
    produtos: "Terno",
  },
  {
    industria: "KDU",
    dataEmissao: "2025-09-05",
    faturado: 0,
    pendente: 107,
    numeroERP: "184708",
    previsaoEntrega: "2025-11-04",
    etapa: "4 - Em Produção",
    status: "Na linha de produção",
    produtos: "Calça Jeans/Sarja",
  },
  {
    industria: "Don Geuroth",
    dataEmissao: "2025-09-05",
    faturado: 0,
    pendente: 21,
    numeroERP: "3175",
    previsaoEntrega: "2025-10-30",
    etapa: "4 - Em Produção",
    status: "Na linha de produção",
    produtos: "Polo EP",
  },
  /*{
    industria: "Don Geuroth",
    dataEmissao: "2025-09-05",
    faturado: 36,
    pendente: 0,
    numeroERP: "3033",
    previsaoEntrega: "2025-10-01",
    etapa: "6 - Entrega Realizada",
    status: "Concluído",
    produtos: "Polo EP",
  },*/
  {
    industria: "Angelo Campana",
    dataEmissao: "2025-10-09",
    faturado: 0,
    pendente: 80,
    numeroERP: "3214",
    previsaoEntrega: "2025-12-15",
    etapa: "3 - Fila de produção",
    status: "Na fila de produção",
    produtos: "Terno",
  },
  {
    industria: "Angelo Campana",
    dataEmissao: "2025-10-09",
    faturado: 0,
    pendente: 126,
    numeroERP: "3213",
    previsaoEntrega: "2026-01-30",
    etapa: "3 - Fila de produção",
    status: "Na fila de produção",
    produtos: "Terno",
  },
  {
    industria: "Angelo Campana",
    dataEmissao: "2025-10-10",
    faturado: 0,
    pendente: 31,
    numeroERP: "3216",
    previsaoEntrega: "2025-12-15",
    etapa: "3 - Fila de produção",
    status: "Na fila de produção",
    produtos: "Terno",
  },
];

/* ==================== COMPONENTES ==================== */
function ProgressStepper({ etapa }) {
  const idx = etapaIndex(etapa); // 1..6
  return (
    <div className="w-full">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-slate-200" />
        {STEPS.map((s, i) => {
          const stepNo = i + 1;
          const isDone = stepNo < idx;
          const isCurrent = stepNo === idx;
          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center w-full">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full border text-xs font-semibold 
                 ${isDone ? "bg-emerald-500 border-emerald-500 text-white" : ""}
                 ${isCurrent && !isDone ? "bg-sky-600 border-sky-600 text-white" : ""}
                 ${!isDone && !isCurrent ? "bg-white border-slate-300 text-slate-500" : ""}`}
              >
                {stepNo}
              </div>
              <span className="mt-2 text-[10px] sm:text-xs text-slate-600 text-center leading-tight min-h-[32px] flex items-start justify-center text-balance">
                {s.label.replace(/^\d+\s-\s/, "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ o }) {
  const idx = etapaIndex(o.etapa || "1 - Recebimento do Pedido");
  const pct = Math.round(((idx - 1) / (STEPS.length - 1)) * 100);
  const etaDays = daysDiff(o.previsaoEntrega);
  const tone = statusTone(o.status);

  return (
    <div className="rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm bg-white hover:shadow-md transition">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-slate-900 font-semibold text-lg">{o.industria}</div>
          <div className="text-slate-500 text-sm flex flex-wrap items-center gap-1">
            <span>
              Nº ERP <span className="font-medium text-slate-700">{o.numeroERP}</span> • Emissão {formatDate(o.dataEmissao)}
            </span>
            {o.produtos && (
              <>
                <span>•</span>
                <span className="font-medium text-slate-700">{o.produtos}</span>
              </>
            )}
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs border ${tone}`}>{o.status}</div>
      </div>

      <div className="mt-4">
        <ProgressStepper etapa={o.etapa} />
      </div>

      <div className="mt-4">
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-sky-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
          <span>Etapa atual: <span className="font-medium text-slate-800">{o.etapa}</span></span>
          <span>Progresso: <span className="font-medium text-slate-800">{pct}%</span></span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">Faturado</div>
          <div className="text-slate-900 font-semibold">{o.faturado} peças</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">Pendente</div>
          <div className="text-slate-900 font-semibold">{o.pendente} peças</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">Previsão de Entrega</div>
          <div className="text-slate-900 font-semibold">{formatDate(o.previsaoEntrega)}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">Previsão de entrega (em dias)</div>
          <div
            className={`font-semibold ${
              etaDays === null ? "text-slate-900" : etaDays < 0 ? "text-emerald-700" : etaDays <= 15 ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {etaDays === null ? "-" : etaDays < 0 ? "Entregue / vencido" : `${etaDays} dias`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== TIMELINE POR PEDIDO (GANTT) ==================== */
function OrderTimeline({ items }) {
  // ordena por início para visual ficar “cronológico de cima p/ baixo”
  const rows = useMemo(
    () => [...items].sort((a, b) => new Date(a.dataEmissao) - new Date(b.dataEmissao)),
    [items]
  );

  const { min, max } = useMemo(() => getRange(rows), [rows]);
  const ticks = useMemo(() => monthTicks(min, max), [min, max]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-900 font-semibold">Linha do tempo dos pedidos</h2>
        {/* legenda de etapas */}
        <div className="hidden sm:flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const idx = i + 1;
            return (
              <span key={s.id} className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span className={`inline-block w-3 h-3 rounded ${STEP_COLOR[idx]}`} />
                {s.label.replace(/^\d+\s-\s/, "")}
              </span>
            );
          })}
        </div>
      </div>

      {/* eixo X + barras — com scroll horizontal quando necessário */}
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[720px]">
          {/* eixo X (meses) */}
          <div className="relative h-8">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-slate-200" />
            {ticks.map((t) => {
              const p = dateToPct(t, min, max);
              return (
                <div key={t.toISOString()} className="absolute -translate-x-1/2" style={{ left: `${p}%` }}>
                  <div className="w-px h-3 bg-slate-300 mx-auto" />
                  <div className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">
                    {t.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* linhas dos pedidos */}
          <div className="mt-2 space-y-3">
            {rows.map((o) => {
              const left = dateToPct(o.dataEmissao, min, max);
              const right = dateToPct(o.previsaoEntrega, min, max);
              const width = Math.max(1.5, right - left); // evita barra invisível
              const idx = etapaIndex(o.etapa);
              const color = STEP_COLOR[idx] || "bg-slate-400";

              return (
                <div key={o.numeroERP + o.industria} className="relative">
                  {/* rótulo à esquerda */}
                  <div className="mb-1 text-[11px] text-slate-600">
                    <span className="font-medium text-slate-800">{o.numeroERP}</span> • {o.industria} — {o.produtos}
                  </div>

                  {/* trilho + barra */}
                  <div className="relative h-6 rounded-full bg-slate-100">
                    <div
                      className={`absolute top-0 bottom-0 rounded-full ${color} text-white/90 text-[10px] flex items-center px-2`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`De ${formatDate(o.dataEmissao)} até ${formatDate(o.previsaoEntrega)} • ${o.etapa}`}
                    >
                      <span className="truncate">{o.etapa}</span>
                    </div>
                  </div>

                  {/* datas nos extremos (opcional) */}
                  <div className="flex text-[10px] text-slate-500 justify-between mt-1">
                    <span>{formatDate(o.dataEmissao)}</span>
                    <span>{formatDate(o.previsaoEntrega)}</span>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="text-slate-500 text-sm">Nenhum pedido para exibir na timeline.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==================== DASHBOARD ==================== */
function Dashboard({ onLogout }) {
  const [q, setQ] = useState("");
  const data = SAMPLE;

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return data;
    return data.filter((o) =>
      [o.industria, o.numeroERP, o.status, o.etapa, o.produtos].join(" ").toLowerCase().includes(k)
    );
  }, [q, data]);

  const handleExport = () => {
    const headers = [
      { header: "Indústria", accessor: (r) => r.industria },
      { header: "Nº ERP", accessor: (r) => r.numeroERP },
      { header: "Produtos", accessor: (r) => r.produtos ?? "" },
      { header: "Data de Emissão", accessor: (r) => formatDate(r.dataEmissao) },
      { header: "Previsão de Entrega", accessor: (r) => formatDate(r.previsaoEntrega) },
      { header: "Etapa", accessor: (r) => r.etapa },
      { header: "Status", accessor: (r) => r.status },
      { header: "Faturado (peças)", accessor: (r) => r.faturado },
      { header: "Pendente (peças)", accessor: (r) => r.pendente },
      {
        header: "ETA (dias)",
        accessor: (r) => {
          const d = daysDiff(r.previsaoEntrega);
          return d === null ? "" : d;
        },
      },
    ];
    const csv = toCSV(filtered, headers, ";");
    const nome = `pedidos_estilo_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(nome, csv);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur sticky top-0 z-20 border-b border-slate-200">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/cristal10.svg" alt="Estilo Próprio" className="h-6 sm:h-8" />
          </div>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-base sm:text-xl font-semibold text-slate-900 whitespace-nowrap">
            Rastreamento de Pedidos
          </h1>
          <div className="flex items-center">
            <img src="/cristal10-dark.png" alt="Cristal 10 Representações" className="h-6 sm:h-8 opacity-90" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-3 flex justify-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por indústria, nº ERP, status..."
            className="w-full sm:w-80 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </header>

      {/* Conteúdo */}
      <main className="p-4 sm:p-8 max-w-6xl mx-auto">
        {/* ✅ timeline por pedido (Gantt) */}
        <div className="mb-4 sm:mb-6">
          <OrderTimeline items={filtered} /> {/* troque por 'data' para visão geral */}
        </div>

        {/* Cards detalhados */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1">
          {filtered.map((o) => (
            <OrderCard key={o.numeroERP + o.industria} o={o} />
          ))}
          {filtered.length === 0 && <div className="text-slate-500 text-sm">Nenhum pedido encontrado com esse filtro.</div>}
        </div>

        {/* Footer */}
        <footer className="mt-10 border-t border-slate-200 pt-4">
          <div className="flex flex-col-reverse sm:flex-row items-center sm:justify-between gap-3">
            <div className="text-[11px] text-slate-500 text-center sm:text-left mt-3 sm:mt-0">
              <p>
                Desenvolvido por{" "}
                <span className="font-semibold text-slate-700">Cristal10 Representações</span> • 2025
              </p>
              <p>Atualizado em: 10/10/2025</p>
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <a
                href="https://chat.whatsapp.com/FhNZfiuOksvEaKwcr5avFF"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#25D366] text-white px-4 py-2 text-sm shadow hover:bg-[#1EBE5D] transition whitespace-nowrap"
              >
                Fale com a Cristal10
              </a>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-xl bg-sky-600 text-white px-4 py-2 text-sm shadow hover:bg-sky-700 transition whitespace-nowrap"
              >
                Exportar CSV
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ==================== APP (LOGIN + SESSÃO) ==================== */
export default function App() {
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [autenticado, setAutenticado] = useState(false);

  const senhaCorreta = "Estil@2025"; // troque aqui

  useEffect(() => {
    const ok = localStorage.getItem("authOK") === "1";
    if (ok) setAutenticado(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (senha === senhaCorreta) {
      setAutenticado(true);
      if (lembrar) localStorage.setItem("authOK", "1");
    } else {
      alert("Senha incorreta. Tente novamente.");
    }
  };

  const handleLogout = () => {
    setAutenticado(false);
    localStorage.removeItem("authOK");
    setSenha("");
  };

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-6">
            <img src="/cristal10-dark.png" alt="Cristal 10" className="h-10" />
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8">
            <h1 className="text-2xl font-semibold text-slate-900 text-center">Área Restrita</h1>
            <p className="mt-1 text-center text-slate-500 text-sm">
              Acesse o rastreamento de pedidos Estilo Próprio
            </p>

            <div className="mt-6">
              <label className="text-xs text-slate-600 mb-1 block">Senha</label>
              <div className="relative">
                <input
                  autoComplete="current-password"
                  type={mostrar ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite a senha"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrar((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs px-2 py-1 rounded hover:bg-slate-100"
                >
                  {mostrar ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Manter conectado
              </label>
            </div>

            <button type="submit" className="mt-5 w-full bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700 transition shadow-sm">
              Entrar
            </button>

            <div className="mt-6 flex items-center justify-center">
              <img src="/cristal10.svg" alt="Cristal 10" className="h-6 opacity-70" />
            </div>
          </form>
        </div>
      </div>
    );
  }

  return <Dashboard onLogout={handleLogout} />;
}
