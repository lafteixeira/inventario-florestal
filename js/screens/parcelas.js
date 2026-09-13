import * as db from '../db.js';
import { QUALIDADES } from '../validation.js';
import {
  medicoesValidasComDap,
  distribuicaoPercentual,
  arvoresParaMedirAltura,
  estatisticasParcela,
} from '../stats.js';
import { confirmar } from '../confirmacao.js';

const LIMIAR_DEFICIT = 3;

function fmt(valor, casas = 1) {
  return valor == null || Number.isNaN(valor) ? '—' : valor.toFixed(casas);
}

function nomeQualidade(id) {
  return QUALIDADES.find((q) => q.id === id)?.nome ?? '—';
}

function rotuloTalhao(talhao) {
  return talhao.nome || `Talhão ${talhao.numero}`;
}

export async function initParcelas(container, fazenda) {
  const talhao =
    (await db.getTalhaoEmAndamento(fazenda.id)) || (await db.getTalhoesDaFazenda(fazenda.id)).at(-1);

  const ctx = { container, fazenda, talhao, parcelas: [], parcelaSelecionadaId: null, editandoId: null, unidade: 'dap' };

  if (!talhao) {
    container.innerHTML = '<section class="painel"><p>Nenhum talhão iniciado ainda.</p></section>';
    return;
  }

  ctx.parcelas = await db.getParcelasDoTalhao(talhao.id);
  const parcelaEmAndamento = await db.getParcelaEmAndamento(talhao.id);
  ctx.parcelaSelecionadaId = parcelaEmAndamento?.id || ctx.parcelas.at(-1)?.id || null;

  await render(ctx);
}

async function render(ctx) {
  const parcelaSelecionada = ctx.parcelas.find((p) => p.id === ctx.parcelaSelecionadaId);
  const medicoes = parcelaSelecionada ? await db.getMedicoesDaParcela(parcelaSelecionada.id) : [];

  const comDados = ctx.parcelas.filter((p) => p.numero != null);
  let totalValidas = 0;
  let totalFalhas = 0;
  for (const p of ctx.parcelas) {
    const m = await db.getMedicoesDaParcela(p.id);
    totalValidas += m.filter((x) => !x.falha).length;
    totalFalhas += m.filter((x) => x.falha).length;
  }

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>Parcelas · ${rotuloTalhao(ctx.talhao)}</h2>
      <p class="contador">
        Parcelas: <strong>${comDados.length}</strong>
        (${ctx.parcelas.filter((p) => p.status === 'concluida').length} concluídas) ·
        Árvores válidas: <strong>${totalValidas}</strong> · Falhas: <strong>${totalFalhas}</strong>
      </p>

      <div class="linha-campos">
        <label>Parcela
          <select id="seletor-parcela">
            ${ctx.parcelas
              .map(
                (p) =>
                  `<option value="${p.id}" ${p.id === ctx.parcelaSelecionadaId ? 'selected' : ''}>
                    Parcela ${p.numero} ${p.status === 'em_andamento' ? '(em andamento)' : ''}
                  </option>`
              )
              .join('')}
          </select>
        </label>
        <label>Unidade das estatísticas
          <div class="toggle-unidade">
            <button type="button" class="btn-unidade ${ctx.unidade === 'dap' ? 'ativa' : ''}" data-unidade="dap">DAP</button>
            <button type="button" class="btn-unidade ${ctx.unidade === 'cap' ? 'ativa' : ''}" data-unidade="cap">CAP</button>
          </div>
        </label>
      </div>

      ${
        parcelaSelecionada
          ? `<div class="acoes">
              <button type="button" id="btn-apagar-parcela" class="btn-perigo">Apagar Parcela ${parcelaSelecionada.numero}</button>
            </div>`
          : ''
      }

      ${parcelaSelecionada ? renderAnalise(parcelaSelecionada, medicoes, ctx.unidade) : '<p>Sem parcelas.</p>'}
    </section>
  `;

  ctx.container.querySelector('#seletor-parcela').addEventListener('change', (e) => {
    ctx.parcelaSelecionadaId = e.target.value;
    ctx.editandoId = null;
    render(ctx);
  });

  ctx.container.querySelectorAll('.btn-unidade').forEach((btn) => {
    btn.addEventListener('click', () => {
      ctx.unidade = btn.dataset.unidade;
      render(ctx);
    });
  });

  const btnApagarParcela = ctx.container.querySelector('#btn-apagar-parcela');
  if (btnApagarParcela) {
    btnApagarParcela.addEventListener('click', async () => {
      const ok = await confirmar(
        `Apagar Parcela ${parcelaSelecionada.numero}? As ${medicoes.length} medições dela serão perdidas. Essa ação não pode ser desfeita.`
      );
      if (!ok) return;
      await db.excluirParcela(parcelaSelecionada.id);
      ctx.parcelas = await db.getParcelasDoTalhao(ctx.talhao.id);
      const emAndamento = await db.getParcelaEmAndamento(ctx.talhao.id);
      ctx.parcelaSelecionadaId = emAndamento?.id || ctx.parcelas.at(-1)?.id || null;
      render(ctx);
    });
  }

  if (parcelaSelecionada) {
    ligarEventosTabela(ctx, medicoes);
  }
}

function renderAnalise(parcela, medicoes, unidade) {
  const stats = estatisticasParcela(medicoes);
  const validas = medicoesValidasComDap(medicoes);
  const comAltura = validas.filter((m) => m.altura != null);
  const distSoDap = distribuicaoPercentual(validas);
  const distComAltura = distribuicaoPercentual(comAltura);
  const grupos = arvoresParaMedirAltura(validas, LIMIAR_DEFICIT);
  const fator = unidade === 'cap' ? Math.PI : 1;
  const rotulo = unidade === 'cap' ? 'CAP' : 'DAP';

  return `
    <p>Área: <strong>${fmt(parcela.area, 1)} m²</strong></p>

    <div class="grid-stats">
      <div class="cartao-stat">
        <h3>Só CAP (sem altura)</h3>
        ${tabelaStat(stats.soCap, `${rotulo} médio (cm)`, fator)}
      </div>
      <div class="cartao-stat">
        <h3>CAP + altura</h3>
        ${tabelaStat(stats.comAltura, `${rotulo} médio (cm)`, fator)}
      </div>
      <div class="cartao-stat">
        <h3>Altura média</h3>
        ${tabelaStat(stats.alturaMedia, 'Altura média (m)', 1)}
      </div>
    </div>

    ${renderHistograma(distSoDap, distComAltura, unidade)}

    ${
      grupos.length > 0
        ? `<div class="alerta-deficit">
            <strong>Priorize altura nas classes de CAP:</strong>
            ${grupos.map((g) => `<span class="chip">${g.labelCap} cm (${g.diferenca.toFixed(1)} pp)</span>`).join(' ')}
            <p class="titulo-arvores-eligiveis">Árvores elegíveis para medir altura:</p>
            <ul class="lista-arvores-eligiveis">
              ${grupos
                .map(
                  (g) =>
                    `<li><strong>${g.labelCap} cm:</strong> ${g.arvores
                      .map((a) => `L${a.linha}/A${a.arvore} (CAP ${a.cap})`)
                      .join(' · ')}</li>`
                )
                .join('')}
            </ul>
          </div>`
        : ''
    }

    <h3>Medições (${medicoes.length})</h3>
    <div class="tabela-scroll">
      <table id="tabela-medicoes">
        <thead>
          <tr><th>Linha</th><th>Árvore</th><th>CAP</th><th>DAP</th><th>Altura</th><th>Qualidade</th><th></th></tr>
        </thead>
        <tbody>
          ${medicoes
            .sort((a, b) => a.id - b.id)
            .map((m) => linhaTabela(m))
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function tabelaStat(s, labelMedia, fator = 1) {
  return `
    <table class="tabela-stat">
      <tr><td>n</td><td>${s.n}</td></tr>
      <tr><td>${labelMedia}</td><td>${fmt(s.media != null ? s.media * fator : null, 1)}</td></tr>
      <tr><td>Desvio padrão</td><td>${fmt(s.desvio != null ? s.desvio * fator : null, 2)}</td></tr>
      <tr><td>CV%</td><td>${fmt(s.cv, 1)}</td></tr>
      <tr><td>Erro amostral (E%)</td><td>${fmt(s.erro, 1)}</td></tr>
    </table>
  `;
}

function renderHistograma(distSoDap, distComAltura, unidade) {
  const classes = [...new Set([...distSoDap.map((c) => c.classe), ...distComAltura.map((c) => c.classe)])].sort(
    (a, b) => a - b
  );
  if (classes.length === 0) return '<p>Sem dados para o histograma ainda.</p>';

  const maxPct = Math.max(1, ...distSoDap.map((c) => c.percentual), ...distComAltura.map((c) => c.percentual));
  const escalaMax = Math.max(10, Math.ceil(maxPct / 10) * 10);
  const alturaGrafico = 120;
  const larguraSlot = 56;
  const larguraBarra = 20;
  const largura = classes.length * larguraSlot + 20;
  const rotulo = unidade === 'cap' ? 'CAP' : 'DAP';

  const barras = classes
    .map((classe, i) => {
      const entradaSoDap = distSoDap.find((c) => c.classe === classe);
      const entradaComAltura = distComAltura.find((c) => c.classe === classe);
      const pct1 = entradaSoDap?.percentual ?? 0;
      const pct2 = entradaComAltura?.percentual ?? 0;
      const x = 10 + i * larguraSlot;
      const h1 = (pct1 / escalaMax) * alturaGrafico;
      const h2 = (pct2 / escalaMax) * alturaGrafico;
      const label = unidade === 'cap' ? entradaSoDap?.labelCap ?? entradaComAltura?.labelCap : classe + '-' + (classe + 2);
      return `
        <rect x="${x}" y="${alturaGrafico - h1}" width="${larguraBarra}" height="${h1}" fill="var(--verde)" fill-opacity="0.55"></rect>
        <rect x="${x}" y="${alturaGrafico - h2}" width="${larguraBarra}" height="${h2}" fill="none" stroke="var(--verde)" stroke-width="2"></rect>
        <text x="${x + larguraBarra / 2}" y="${alturaGrafico + 16}" text-anchor="middle" font-size="10">${label}</text>
      `;
    })
    .join('');

  return `
    <h3>Distribuição diamétrica relativa (%)</h3>
    <p class="legenda-histograma">
      <span class="chip-legenda solido"></span> Só ${rotulo} (toda a parcela)
      <span class="chip-legenda contorno"></span> ${rotulo} + altura
    </p>
    <svg viewBox="0 0 ${largura} ${alturaGrafico + 28}" class="histograma">${barras}</svg>
  `;
}

function linhaTabela(m) {
  const dap = m.falha ? null : m.cap / Math.PI;
  return `
    <tr data-id="${m.id}">
      <td>${m.linha}</td>
      <td>${m.arvore}</td>
      <td>${m.falha ? 'Falha' : m.cap}</td>
      <td>${dap != null ? dap.toFixed(1) : '—'}</td>
      <td>${m.altura != null ? m.altura.toFixed(2) : '—'}</td>
      <td>${nomeQualidade(m.qualidade)}</td>
      <td class="acoes-tabela">
        <button type="button" class="btn-editar" data-id="${m.id}">Editar</button>
        <button type="button" class="btn-excluir" data-id="${m.id}">Excluir</button>
      </td>
    </tr>
  `;
}

function linhaEdicao(m) {
  return `
    <tr data-id="${m.id}">
      <td><input type="number" min="1" step="1" class="ed-linha" value="${m.linha}"></td>
      <td><input type="number" min="1" step="1" class="ed-arvore" value="${m.arvore}"></td>
      <td><input type="text" inputmode="decimal" class="ed-cap" value="${m.falha ? 0 : m.cap}"></td>
      <td>—</td>
      <td><input type="text" inputmode="decimal" class="ed-altura" value="${m.altura ?? ''}"></td>
      <td>
        <select class="ed-qualidade">
          ${QUALIDADES.map((q) => `<option value="${q.id}" ${q.id === m.qualidade ? 'selected' : ''}>${q.nome}</option>`).join('')}
        </select>
      </td>
      <td class="acoes-tabela">
        <button type="button" class="btn-salvar" data-id="${m.id}">Salvar</button>
        <button type="button" class="btn-cancelar" data-id="${m.id}">Cancelar</button>
      </td>
    </tr>
  `;
}

function ligarEventosTabela(ctx, medicoes) {
  const tabela = ctx.container.querySelector('#tabela-medicoes');
  if (!tabela) return;

  tabela.querySelectorAll('.btn-excluir').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!(await confirmar('Excluir esta medição?', { confirmarTexto: 'Excluir' }))) return;
      await db.excluirMedicao(id);
      render(ctx);
    });
  });

  tabela.querySelectorAll('.btn-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const m = medicoes.find((med) => med.id === id);
      const tr = tabela.querySelector(`tr[data-id="${id}"]`);
      tr.outerHTML = linhaEdicao(m);
      ligarEventosTabela(ctx, medicoes);
    });
  });

  tabela.querySelectorAll('.btn-cancelar').forEach((btn) => {
    btn.addEventListener('click', () => render(ctx));
  });

  tabela.querySelectorAll('.btn-salvar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const tr = tabela.querySelector(`tr[data-id="${id}"]`);
      const parseNum = (s) => Number(String(s).trim().replace(',', '.'));
      const linha = Number(tr.querySelector('.ed-linha').value);
      const arvore = Number(tr.querySelector('.ed-arvore').value);
      const cap = parseNum(tr.querySelector('.ed-cap').value);
      const alturaTexto = tr.querySelector('.ed-altura').value;
      const altura = alturaTexto.trim() === '' ? null : parseNum(alturaTexto);
      const qualidade = Number(tr.querySelector('.ed-qualidade').value);
      await db.atualizarMedicao(id, { linha, arvore, cap, altura, qualidade });
      render(ctx);
    });
  });
}
