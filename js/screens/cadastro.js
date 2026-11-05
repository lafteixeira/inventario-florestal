import * as db from '../db.js';
import { confirmar } from '../confirmacao.js';
import { parseNumero } from '../validation.js';
import {
  garantirTalhaoEParcela,
  finalizarEAbrirProxima,
  concluirEAbrirNovoTalhao,
} from '../sessao.js';

function rotuloTalhao(talhao) {
  return talhao.nome || `Talhão ${talhao.numero}`;
}

function valorNumerico(texto) {
  const n = parseNumero(texto);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

export async function initCadastro(container, fazenda, { irPara } = {}) {
  const ctx = { container, fazenda, irPara, aviso: '', gps: 'parado' };
  await carregar(ctx);
  render(ctx);
}

async function carregar(ctx) {
  const { talhao, parcela } = await garantirTalhaoEParcela(ctx.fazenda);
  ctx.talhao = talhao;
  ctx.parcela = parcela;
  ctx.medicoesParcela = await db.getMedicoesDaParcela(parcela.id);
  ctx.medicoesTalhao = await db.getMedicoesDoTalhao(talhao.id);

  const talhoes = await db.getTalhoesDaFazenda(ctx.fazenda.id);
  ctx.estrutura = [];
  ctx.totalMedicoesProjeto = 0;
  for (const t of talhoes) {
    const parcelas = await db.getParcelasDoTalhao(t.id);
    const itens = [];
    for (const p of parcelas) {
      const medicoes = await db.getMedicoesDaParcela(p.id);
      ctx.totalMedicoesProjeto += medicoes.length;
      itens.push({ parcela: p, n: medicoes.length });
    }
    ctx.estrutura.push({ talhao: t, parcelas: itens });
  }
}

function textoCentro(parcela) {
  if (!parcela.centro) return 'Centro ainda não marcado.';
  const { lat, lon, precisao } = parcela.centro;
  return `Centro marcado: ${lat.toFixed(6)}, ${lon.toFixed(6)} (±${Math.round(precisao)} m)`;
}

function render(ctx) {
  const { talhao: t, parcela: p } = ctx;
  const opcoes = db.opcoesDoProjeto(ctx.fazenda);
  const talhaoTravado = ctx.medicoesTalhao.length > 0;
  const parcelaTravada = ctx.medicoesParcela.length > 0;

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>Cadastro</h2>
      <p id="aviso-cadastro" class="msg" ${ctx.aviso ? '' : 'hidden'}>${ctx.aviso}</p>

      <h3>Opções do projeto</h3>
      <label class="toggle"><input id="op-linha" type="checkbox" ${opcoes.usarLinha ? 'checked' : ''}> Usar número da linha</label>
      <label class="toggle"><input id="op-qualidade" type="checkbox" ${opcoes.usarQualidade ? 'checked' : ''}> Registrar qualidade do fuste</label>
      <label class="toggle"><input id="op-130" type="checkbox" ${opcoes.somar130 ? 'checked' : ''}> Somar 1,30 m na altura digitada</label>

      <h3>${rotuloTalhao(t)}${talhaoTravado ? ' <span class="selo-aberto">travado</span>' : ''}</h3>
      <fieldset id="config-talhao" ${talhaoTravado ? 'disabled' : ''}>
        <legend class="oculto-visual">Cadastro do talhão</legend>
        <label>Nome <input id="t-nome" type="text" placeholder="Talhão ${t.numero}" value="${t.nome ?? ''}"></label>
        <div class="linha-campos">
          <label>Área (ha) <input id="t-area" type="text" inputmode="decimal" value="${t.area ?? ''}"></label>
          <label>Rotação <input id="t-rotacao" type="text" value="${t.rotacao ?? ''}"></label>
        </div>
        <label>Material genético <input id="t-material" type="text" placeholder="ex: clone X" value="${t.materialGenetico ?? ''}"></label>
        <div class="linha-campos">
          <label>Espaçamento <input id="t-espacamento" type="text" placeholder="ex: 3x2 m" value="${t.espacamento ?? ''}"></label>
          <label>Data de plantio <input id="t-data-plantio" type="date" value="${t.dataPlantio ?? ''}"></label>
        </div>
        <label>Regime silvicultural <input id="t-regime" type="text" placeholder="ex: alto fuste, talhadia" value="${t.regimeSilvicultural ?? ''}"></label>
        <label>Observações <textarea id="t-observacoes" rows="2">${t.observacoes ?? ''}</textarea></label>
      </fieldset>

      <h3>Parcela ${p.numero}${parcelaTravada ? ' <span class="selo-aberto">travada</span>' : ''}</h3>
      <fieldset id="config-parcela" ${parcelaTravada ? 'disabled' : ''}>
        <legend class="oculto-visual">Configuração da parcela</legend>
        <label>Forma
          <select id="forma">
            <option value="retangular" ${p.forma === 'retangular' ? 'selected' : ''}>Retangular</option>
            <option value="circular" ${p.forma === 'circular' ? 'selected' : ''}>Circular</option>
          </select>
        </label>
        <div id="campos-retangular" class="linha-campos" ${p.forma !== 'retangular' ? 'hidden' : ''}>
          <label>Comprimento (m) <input id="comprimento" type="text" inputmode="decimal" value="${p.comprimento ?? ''}"></label>
          <label>Largura (m) <input id="largura" type="text" inputmode="decimal" value="${p.largura ?? ''}"></label>
        </div>
        <div id="campos-circular" class="linha-campos" ${p.forma !== 'circular' ? 'hidden' : ''}>
          <label>Raio (m) <input id="raio" type="text" inputmode="decimal" value="${p.raio ?? ''}"></label>
        </div>
        <p>Área: <strong id="area-calculada">${p.area ? p.area.toFixed(1) + ' m²' : '—'}</strong></p>
      </fieldset>

      <p id="status-centro" class="ajuda">${textoCentro(p)}</p>
      <button type="button" id="btn-marcar-centro" class="btn-secundario">Marcar centro da parcela (GPS)</button>

      <div class="acoes-empilhadas">
        <button type="button" id="btn-ir-coleta">Ir para a Coleta</button>
        <button type="button" id="btn-finalizar-parcela" class="btn-secundario">Finalizar parcela e abrir a próxima</button>
        <button type="button" id="btn-concluir-talhao" class="btn-secundario">Concluir talhão e abrir um novo</button>
      </div>

      <h3>Talhões e parcelas</h3>
      ${ctx.estrutura.map(blocoTalhao).join('')}
    </section>
  `;

  ligarEventos(ctx);
}

function blocoTalhao({ talhao, parcelas }) {
  const totalArvores = parcelas.reduce((acc, i) => acc + i.n, 0);
  return `
    <div class="bloco-talhao">
      <div class="linha-lista">
        <div><strong>${rotuloTalhao(talhao)}</strong>
          <span class="ajuda">${talhao.status === 'concluido' ? 'concluído' : 'em andamento'} · ${parcelas.length} parcela(s) · ${totalArvores} árv.</span>
        </div>
        <button type="button" class="btn-apagar-talhao btn-perigo btn-pequeno" data-id="${talhao.id}" data-rotulo="${rotuloTalhao(talhao).replace(/"/g, '&quot;')}" data-parcelas="${parcelas.length}" data-arvores="${totalArvores}">Apagar</button>
      </div>
      ${parcelas
        .map(
          ({ parcela, n }) => `
        <div class="linha-lista sub">
          <div>Parcela ${parcela.numero}
            <span class="ajuda">${parcela.status === 'concluida' ? 'concluída' : 'em andamento'} · ${n} árv.${parcela.centro ? ' · com centro' : ''}</span>
          </div>
          <button type="button" class="btn-apagar-parcela btn-perigo btn-pequeno" data-id="${parcela.id}" data-numero="${parcela.numero}" data-arvores="${n}">Apagar</button>
        </div>`
        )
        .join('')}
    </div>
  `;
}

async function recarregar(ctx, aviso = '') {
  ctx.aviso = aviso;
  await carregar(ctx);
  render(ctx);
}

function ligarEventos(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);

  // --- opções do projeto ---
  ['#op-linha', '#op-qualidade', '#op-130'].forEach((sel) => {
    $(sel).addEventListener('change', async (e) => {
      const novas = {
        usarLinha: $('#op-linha').checked,
        usarQualidade: $('#op-qualidade').checked,
        somar130: $('#op-130').checked,
      };
      if (ctx.totalMedicoesProjeto > 0) {
        const ok = await confirmar(
          'Este projeto já tem medições. Mudar essa opção afeta só as próximas leituras; as já gravadas não mudam. Continuar?',
          { confirmarTexto: 'Mudar', perigo: false }
        );
        if (!ok) {
          e.target.checked = !e.target.checked;
          return;
        }
      }
      ctx.fazenda = await db.atualizarOpcoesProjeto(ctx.fazenda.id, novas);
    });
  });

  // --- talhão ---
  ['#t-nome', '#t-area', '#t-rotacao', '#t-material', '#t-espacamento', '#t-data-plantio', '#t-regime', '#t-observacoes'].forEach((sel) => {
    $(sel).addEventListener('change', async () => {
      ctx.talhao = await db.atualizarCadastroTalhao(ctx.talhao.id, {
        nome: $('#t-nome').value.trim(),
        area: valorNumerico($('#t-area').value),
        materialGenetico: $('#t-material').value.trim(),
        espacamento: $('#t-espacamento').value.trim(),
        regimeSilvicultural: $('#t-regime').value.trim(),
        dataPlantio: $('#t-data-plantio').value || null,
        rotacao: $('#t-rotacao').value.trim(),
        observacoes: $('#t-observacoes').value.trim(),
      });
    });
  });

  // --- parcela ---
  const salvarParcela = async () => {
    const forma = $('#forma').value;
    $('#campos-retangular').hidden = forma !== 'retangular';
    $('#campos-circular').hidden = forma !== 'circular';
    ctx.parcela = await db.atualizarConfigParcela(ctx.parcela.id, {
      forma,
      comprimento: forma === 'retangular' ? valorNumerico($('#comprimento').value) : null,
      largura: forma === 'retangular' ? valorNumerico($('#largura').value) : null,
      raio: forma === 'circular' ? valorNumerico($('#raio').value) : null,
    });
    $('#area-calculada').textContent = ctx.parcela.area ? ctx.parcela.area.toFixed(1) + ' m²' : '—';
  };
  ['#forma', '#comprimento', '#largura', '#raio'].forEach((sel) => {
    $(sel).addEventListener('change', salvarParcela);
  });

  // --- centro da parcela (GPS) ---
  $('#btn-marcar-centro').addEventListener('click', () => marcarCentro(ctx));

  // --- fluxo de campo ---
  $('#btn-ir-coleta').addEventListener('click', () => ctx.irPara?.('coleta'));

  $('#btn-finalizar-parcela').addEventListener('click', async () => {
    if (ctx.medicoesParcela.length === 0) {
      await recarregar(ctx, 'A Parcela ' + ctx.parcela.numero + ' ainda não tem medições.');
      return;
    }
    if (!ctx.parcela.area) {
      await recarregar(ctx, 'Preencha o tamanho da parcela antes de finalizá-la.');
      return;
    }
    const ok = await confirmar(
      `Finalizar a Parcela ${ctx.parcela.numero} (${ctx.medicoesParcela.length} árvores) e abrir a próxima?`,
      { confirmarTexto: 'Finalizar', perigo: false }
    );
    if (!ok) return;
    await finalizarEAbrirProxima(ctx.talhao, ctx.parcela);
    await recarregar(ctx, '');
    ctx.irPara?.('coleta');
  });

  $('#btn-concluir-talhao').addEventListener('click', async () => {
    if (ctx.medicoesTalhao.length === 0) {
      await recarregar(ctx, 'Este talhão ainda não tem medições.');
      return;
    }
    const ok = await confirmar(
      `Concluir "${rotuloTalhao(ctx.talhao)}" e abrir um novo talhão? As parcelas dele serão marcadas como concluídas.`,
      { confirmarTexto: 'Concluir', perigo: false }
    );
    if (!ok) return;
    await concluirEAbrirNovoTalhao(ctx.fazenda.id, ctx.talhao, ctx.parcela);
    await recarregar(ctx, '');
  });

  // --- apagar ---
  ctx.container.querySelectorAll('.btn-apagar-parcela').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmar(
        `Apagar Parcela ${btn.dataset.numero}? As ${btn.dataset.arvores} medições dela serão perdidas. Essa ação não pode ser desfeita.`
      );
      if (!ok) return;
      await db.excluirParcela(btn.dataset.id);
      await recarregar(ctx, '');
    });
  });

  ctx.container.querySelectorAll('.btn-apagar-talhao').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmar(
        `Apagar "${btn.dataset.rotulo}"? As ${btn.dataset.parcelas} parcelas e ${btn.dataset.arvores} árvores dele serão perdidas. Essa ação não pode ser desfeita.`
      );
      if (!ok) return;
      await db.excluirTalhao(btn.dataset.id);
      await recarregar(ctx, '');
    });
  });
}

function marcarCentro(ctx) {
  const status = ctx.container.querySelector('#status-centro');
  const botao = ctx.container.querySelector('#btn-marcar-centro');

  if (!navigator.geolocation) {
    status.textContent = 'Este aparelho ou navegador não oferece GPS.';
    return;
  }
  botao.disabled = true;
  status.textContent = 'Obtendo a posição… pode levar até 30 s. Fique parado no centro da parcela.';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const centro = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        precisao: pos.coords.accuracy,
        timestamp: new Date(pos.timestamp).toISOString(),
      };
      ctx.parcela = await db.atualizarCentroParcela(ctx.parcela.id, centro);
      await recarregar(ctx, '');
    },
    (erro) => {
      botao.disabled = false;
      const motivos = {
        1: 'Permissão de localização negada (o GPS só funciona em https, no site publicado).',
        2: 'Não foi possível obter a posição. Vá para um lugar aberto e tente de novo.',
        3: 'Tempo esgotado sem sinal de GPS. Tente de novo em lugar aberto.',
      };
      status.textContent = motivos[erro.code] || 'Falha ao ler o GPS.';
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
  );
}
