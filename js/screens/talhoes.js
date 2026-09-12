import * as db from '../db.js';
import { estatisticasAgregadas } from '../stats.js';
import {
  gerarCsvMedicoes,
  gerarCsvEstatisticasParcelas,
  gerarCsvEstatisticasTalhoes,
  baixarCsv,
} from '../reports.js';

function slug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function fmt(valor, casas = 1) {
  return valor == null || Number.isNaN(valor) ? '—' : valor.toFixed(casas);
}

export async function initTalhoes(container, fazenda) {
  const ctx = { container, fazenda, expandidos: new Set() };
  await render(ctx);
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

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>Talhões · ${ctx.fazenda.nome}</h2>

      <h3>Resumo geral</h3>
      <table class="tabela-stat">
        <tr><td>Talhões</td><td>${talhoes.length}</td></tr>
        <tr><td>Parcelas</td><td>${totalParcelas}</td></tr>
        <tr><td>Árvores válidas</td><td>${statsGerais.n}</td></tr>
        <tr><td>Falhas</td><td>${statsGerais.falhas}</td></tr>
        <tr><td>DAP médio (cm)</td><td>${fmt(statsGerais.dap.media, 1)}</td></tr>
        <tr><td>Altura média (m)</td><td>${fmt(statsGerais.altura.media, 2)}</td></tr>
        <tr><td>CV% (DAP)</td><td>${fmt(statsGerais.dap.cv, 1)}</td></tr>
        <tr><td>Erro amostral E% (DAP)</td><td>${fmt(statsGerais.dap.erro, 1)}</td></tr>
      </table>

      <h3>Talhões</h3>
      <div class="tabela-scroll">
        <table id="tabela-talhoes">
          <thead>
            <tr>
              <th></th><th>Talhão</th><th>Status</th><th>Parcelas</th><th>Árvores</th>
              <th>DAP médio</th><th>Altura média</th><th>CV%</th><th>Erro%</th>
            </tr>
          </thead>
          <tbody>${linhas.join('')}</tbody>
        </table>
      </div>

      <h3>Exportar relatórios</h3>
      <div class="acoes">
        <button type="button" id="btn-export-medicoes">Medições (CSV)</button>
        <button type="button" id="btn-export-parcelas">Estatísticas por parcela (CSV)</button>
        <button type="button" id="btn-export-talhoes">Estatísticas por talhão (CSV)</button>
      </div>
    </section>
  `;

  ligarEventos(ctx, dadosPorTalhao);
  ligarEventosExportacao(ctx);
}

function ligarEventosExportacao(ctx) {
  const base = slug(ctx.fazenda.nome) || 'fazenda';
  const hoje = new Date().toISOString().slice(0, 10);

  ctx.container.querySelector('#btn-export-medicoes').addEventListener('click', async () => {
    const csv = await gerarCsvMedicoes(ctx.fazenda);
    baixarCsv(`medicoes-${base}-${hoje}.csv`, csv);
  });

  ctx.container.querySelector('#btn-export-parcelas').addEventListener('click', async () => {
    const csv = await gerarCsvEstatisticasParcelas(ctx.fazenda);
    baixarCsv(`estatisticas-parcelas-${base}-${hoje}.csv`, csv);
  });

  ctx.container.querySelector('#btn-export-talhoes').addEventListener('click', async () => {
    const csv = await gerarCsvEstatisticasTalhoes(ctx.fazenda);
    baixarCsv(`estatisticas-talhoes-${base}-${hoje}.csv`, csv);
  });
}

async function linhaTalhao(ctx, { talhao, parcelas, stats }) {
  const expandido = ctx.expandidos.has(talhao.id);
  const linhaPrincipal = `
    <tr class="linha-talhao" data-talhao-id="${talhao.id}">
      <td class="expandir">${expandido ? '▾' : '▸'}</td>
      <td>${talhao.numero}</td>
      <td>${talhao.status === 'concluido' ? 'Concluído' : 'Em andamento'}</td>
      <td>${parcelas.length}</td>
      <td>${stats.n}</td>
      <td>${fmt(stats.dap.media, 1)}</td>
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
          <td>${fmt(s.dap.media, 1)}</td>
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
