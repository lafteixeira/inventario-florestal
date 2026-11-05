import * as db from '../db.js';
import { estatisticasAgregadas, areaBasalPorHa, suficienciaAmostral } from '../stats.js';

function fmt(valor, casas = 1) {
  return valor == null || Number.isNaN(valor) ? '—' : valor.toFixed(casas);
}

function converter(valor, fator) {
  return valor == null ? null : valor * fator;
}

function rotuloTalhao(talhao) {
  return talhao.nome || `Talhão ${talhao.numero}`;
}

export async function initTalhoes(container, fazenda) {
  const ctx = { container, fazenda, expandidos: new Set(), unidade: 'dap', erroAdmissivel: 10 };
  await render(ctx);
}

// Suficiência amostral do projeto inteiro (não por talhão): usa só parcelas
// concluídas, para uma parcela em andamento não puxar a área basal para baixo.
function calcularSuficiencia(dadosPorTalhao, erroAdmissivel) {
  const concluidas = [];
  for (const { parcelas, medicoes } of dadosPorTalhao) {
    for (const p of parcelas) {
      if (p.status !== 'concluida') continue;
      const g = areaBasalPorHa(
        medicoes.filter((m) => m.parcelaId === p.id),
        p.area
      );
      if (g != null) concluidas.push({ g, area: p.area });
    }
  }
  const talhoes = dadosPorTalhao.map((d) => d.talhao);
  const todosComArea = talhoes.length > 0 && talhoes.every((t) => t.area > 0);
  const areaParcelaMedia = concluidas.length
    ? concluidas.reduce((acc, c) => acc + c.area, 0) / concluidas.length
    : null;
  const areaTotalHa = todosComArea ? talhoes.reduce((acc, t) => acc + t.area, 0) : null;
  const populacao =
    areaTotalHa && areaParcelaMedia ? (areaTotalHa * 10000) / areaParcelaMedia : null;
  const resultado = suficienciaAmostral(
    concluidas.map((c) => c.g),
    populacao,
    erroAdmissivel
  );
  return { ...resultado, semArea: !todosComArea, areaTotalHa };
}

function renderSuficiencia(s) {
  if (s.n < 2) {
    return `<p>Conclua pelo menos 2 parcelas (com dimensões preenchidas) para calcular a suficiência amostral. Parcelas concluídas até agora: <strong>${s.n}</strong>.</p>`;
  }
  const situacao =
    s.faltam === 0
      ? '<strong>Suficiente</strong> — o número de parcelas atende ao erro admissível.'
      : `Faltam <strong>${s.faltam}</strong> parcela(s).`;
  return `
    <table class="tabela-stat">
      <tr><td>Parcelas concluídas (n)</td><td>${s.n}</td></tr>
      <tr><td>G médio (m²/ha)</td><td>${fmt(s.media, 2)}</td></tr>
      <tr><td>Desvio padrão de G</td><td>${fmt(s.desvio, 2)}</td></tr>
      <tr><td>CV% de G</td><td>${fmt(s.cv, 1)}</td></tr>
      <tr><td>Erro amostral atual (E%)</td><td>${fmt(s.erroAtual, 1)}</td></tr>
      <tr><td>Parcelas necessárias</td><td>${s.nNecessario ?? '—'}</td></tr>
    </table>
    <p>${s.nNecessario != null ? situacao : ''}</p>
    ${
      s.semArea
        ? '<p class="nota-minimo-inclusao">Há talhão sem área cadastrada: o cálculo foi feito sem correção de população finita (resultado mais conservador).</p>'
        : `<p class="nota-minimo-inclusao">População: ${fmt(s.populacao, 0)} parcelas possíveis (${fmt(s.areaTotalHa, 1)} ha no total).</p>`
    }
  `;
}

async function coletarDadosTalhao(talhao) {
  const parcelas = await db.getParcelasDoTalhao(talhao.id);
  const medicoes = await db.getMedicoesDoTalhao(talhao.id);
  return { talhao, parcelas, medicoes, stats: estatisticasAgregadas(medicoes) };
}

async function render(ctx) {
  const talhoes = await db.getTalhoesDaFazenda(ctx.fazenda.id);
  const dadosPorTalhao = await Promise.all(talhoes.map(coletarDadosTalhao));

  const medicoesGerais = dadosPorTalhao.flatMap((d) => d.medicoes);
  const statsGerais = estatisticasAgregadas(medicoesGerais);
  const totalParcelas = dadosPorTalhao.reduce((acc, d) => acc + d.parcelas.length, 0);

  const linhas = await Promise.all(dadosPorTalhao.map((d) => linhaTalhao(ctx, d)));
  const fator = ctx.unidade === 'cap' ? Math.PI : 1;
  const rotulo = ctx.unidade === 'cap' ? 'CAP' : 'DAP';

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>Talhões · ${ctx.fazenda.nome}</h2>

      <label>Unidade das estatísticas
        <div class="toggle-unidade">
          <button type="button" class="btn-unidade ${ctx.unidade === 'dap' ? 'ativa' : ''}" data-unidade="dap">DAP</button>
          <button type="button" class="btn-unidade ${ctx.unidade === 'cap' ? 'ativa' : ''}" data-unidade="cap">CAP</button>
        </div>
      </label>

      <h3>Resumo geral</h3>
      <table class="tabela-stat">
        <tr><td>Talhões</td><td>${talhoes.length}</td></tr>
        <tr><td>Parcelas</td><td>${totalParcelas}</td></tr>
        <tr><td>Árvores válidas</td><td>${statsGerais.n}</td></tr>
        <tr><td>Falhas</td><td>${statsGerais.falhas}</td></tr>
        <tr><td>${rotulo} médio (cm)</td><td>${fmt(converter(statsGerais.dap.media, fator), 1)}</td></tr>
        <tr><td>Altura média (m)</td><td>${fmt(statsGerais.altura.media, 2)}</td></tr>
        <tr><td>CV% (${rotulo})</td><td>${fmt(statsGerais.dap.cv, 1)}</td></tr>
        <tr><td>Erro amostral E% (${rotulo})</td><td>${fmt(statsGerais.dap.erro, 1)}</td></tr>
      </table>

      <h3>Suficiência amostral (área basal)</h3>
      <label>Erro admissível (%) — 95% de confiança
        <input id="erro-admissivel" type="text" inputmode="numeric" value="${ctx.erroAdmissivel}">
      </label>
      ${renderSuficiencia(calcularSuficiencia(dadosPorTalhao, ctx.erroAdmissivel))}

      <h3>Talhões</h3>
      <div class="tabela-scroll">
        <table id="tabela-talhoes">
          <thead>
            <tr>
              <th></th><th>Talhão</th><th>Status</th><th>Parcelas</th><th>Árvores</th>
              <th>${rotulo} médio</th><th>Altura média</th><th>CV%</th><th>Erro%</th>
            </tr>
          </thead>
          <tbody>${linhas.join('')}</tbody>
        </table>
      </div>
    </section>
  `;

  ctx.container.querySelectorAll('.btn-unidade').forEach((btn) => {
    btn.addEventListener('click', () => {
      ctx.unidade = btn.dataset.unidade;
      render(ctx);
    });
  });

  ctx.container.querySelector('#erro-admissivel').addEventListener('change', (e) => {
    const valor = Number(e.target.value);
    ctx.erroAdmissivel = valor >= 1 && valor <= 50 ? valor : 10;
    render(ctx);
  });

  ligarEventos(ctx, dadosPorTalhao);
}

async function linhaTalhao(ctx, { talhao, parcelas, stats }) {
  const expandido = ctx.expandidos.has(talhao.id);
  const fator = ctx.unidade === 'cap' ? Math.PI : 1;
  const linhaPrincipal = `
    <tr class="linha-talhao" data-talhao-id="${talhao.id}">
      <td class="expandir">${expandido ? '▾' : '▸'}</td>
      <td>${rotuloTalhao(talhao)}</td>
      <td>${talhao.status === 'concluido' ? 'Concluído' : 'Em andamento'}</td>
      <td>${parcelas.length}</td>
      <td>${stats.n}</td>
      <td>${fmt(converter(stats.dap.media, fator), 1)}</td>
      <td>${fmt(stats.altura.media, 2)}</td>
      <td>${fmt(stats.dap.cv, 1)}</td>
      <td>${fmt(stats.dap.erro, 1)}</td>
    </tr>
  `;

  if (!expandido) return linhaPrincipal;

  const dadosParcelas = await Promise.all(
    parcelas.map(async (p) => {
      const medicoes = await db.getMedicoesDaParcela(p.id);
      return { parcela: p, stats: estatisticasAgregadas(medicoes) };
    })
  );

  const linhasParcelas = dadosParcelas
    .map(
      ({ parcela, stats: s }) => `
        <tr class="linha-parcela">
          <td></td>
          <td>Parcela ${parcela.numero}</td>
          <td>${parcela.area ? fmt(parcela.area, 1) + ' m²' : '—'}</td>
          <td>—</td>
          <td>${s.n}</td>
          <td>${fmt(converter(s.dap.media, fator), 1)}</td>
          <td>${fmt(s.altura.media, 2)}</td>
          <td>${fmt(s.dap.cv, 1)}</td>
          <td>${fmt(s.dap.erro, 1)}</td>
        </tr>
      `
    )
    .join('');

  return linhaPrincipal + linhasParcelas;
}

function ligarEventos(ctx, dadosPorTalhao) {
  ctx.container.querySelectorAll('.linha-talhao').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.talhaoId;
      if (ctx.expandidos.has(id)) ctx.expandidos.delete(id);
      else ctx.expandidos.add(id);
      render(ctx);
    });
  });

}
