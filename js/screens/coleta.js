import * as db from '../db.js';
import { validarCap, validarAltura, QUALIDADES } from '../validation.js';
import { medicoesValidasComDap, classesComDeficitDeAltura } from '../stats.js';

const LIMIAR_DEFICIT = 3;

function rotuloTalhao(talhao) {
  return talhao.nome || `Talhão ${talhao.numero}`;
}

export async function initColeta(container, fazenda) {
  const ctx = {
    container,
    fazenda,
    talhao: null,
    parcela: null,
    medicoes: [],
    medicoesTalhao: [],
    pendente: null,
    talhaoExpandido: true,
    parcelaExpandido: true,
  };
  await carregarOuCriarTalhaoEParcela(ctx);
  ctx.talhaoExpandido = ctx.medicoesTalhao.length === 0;
  ctx.parcelaExpandido = ctx.medicoes.length === 0;
  render(ctx);
}

async function carregarOuCriarTalhaoEParcela(ctx) {
  ctx.talhao = await db.getTalhaoEmAndamento(ctx.fazenda.id);
  if (!ctx.talhao) {
    ctx.talhao = await db.criarTalhao(ctx.fazenda.id);
  }

  ctx.parcela = await db.getParcelaEmAndamento(ctx.talhao.id);
  if (!ctx.parcela) {
    const ultima = await db.getUltimaParcelaCriada(ctx.fazenda.id);
    const configPrefill = ultima
      ? { forma: ultima.forma, comprimento: ultima.comprimento, largura: ultima.largura, raio: ultima.raio }
      : { forma: 'retangular', comprimento: null, largura: null, raio: null };
    ctx.parcela = await db.criarParcela(ctx.talhao.id, configPrefill);
  }

  ctx.medicoes = await db.getMedicoesDaParcela(ctx.parcela.id);
  ctx.medicoesTalhao = await db.getMedicoesDoTalhao(ctx.talhao.id);
}

function proximaLinhaEArvore(ctx) {
  if (ctx.medicoes.length === 0) return { linha: 1, arvore: 1 };
  const ultima = ctx.medicoes.reduce((a, b) => (a.id > b.id ? a : b));
  return { linha: ultima.linha, arvore: ultima.arvore + 1 };
}

function render(ctx) {
  const { forma, comprimento, largura, raio, area } = ctx.parcela;
  const configTravada = ctx.medicoes.length > 0;
  const talhaoTravado = ctx.medicoesTalhao.length > 0;
  const { linha, arvore } = proximaLinhaEArvore(ctx);
  const t = ctx.talhao;

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>${rotuloTalhao(ctx.talhao)} · Parcela ${ctx.parcela.numero}</h2>

      <div class="cartao-secao">
        <button type="button" class="cabecalho-secao" id="toggle-cadastro-talhao">
          <span>Cadastro do talhão${talhaoTravado ? ' (travado)' : ''}</span>
          <span class="seta">${ctx.talhaoExpandido ? '▾' : '▸'}</span>
        </button>
        <fieldset id="config-talhao" ${talhaoTravado ? 'disabled' : ''} ${ctx.talhaoExpandido ? '' : 'hidden'}>
          <legend class="oculto-visual">Cadastro do talhão</legend>
          <label>Nome <input id="t-nome" type="text" placeholder="Talhão ${t.numero}" value="${t.nome ?? ''}"></label>
          <div class="linha-campos">
            <label>Área (ha) <input id="t-area" type="number" step="0.01" min="0" value="${t.area ?? ''}"></label>
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
      </div>

      <div class="cartao-secao">
        <button type="button" class="cabecalho-secao" id="toggle-config-parcela">
          <span>Configuração da parcela${configTravada ? ' (travada)' : ''}</span>
          <span class="seta">${ctx.parcelaExpandido ? '▾' : '▸'}</span>
        </button>
        <fieldset id="config-parcela" ${configTravada ? 'disabled' : ''} ${ctx.parcelaExpandido ? '' : 'hidden'}>
          <legend class="oculto-visual">Configuração da parcela</legend>
          <label>Forma
            <select id="forma">
              <option value="retangular" ${forma === 'retangular' ? 'selected' : ''}>Retangular</option>
              <option value="circular" ${forma === 'circular' ? 'selected' : ''}>Circular</option>
            </select>
          </label>
          <div id="campos-retangular" class="linha-campos" ${forma !== 'retangular' ? 'hidden' : ''}>
            <label>Comprimento (m) <input id="comprimento" type="number" step="0.01" min="0" value="${comprimento ?? ''}"></label>
            <label>Largura (m) <input id="largura" type="number" step="0.01" min="0" value="${largura ?? ''}"></label>
          </div>
          <div id="campos-circular" class="linha-campos" ${forma !== 'circular' ? 'hidden' : ''}>
            <label>Raio (m) <input id="raio" type="number" step="0.01" min="0" value="${raio ?? ''}"></label>
          </div>
          <p>Área: <strong id="area-calculada">${area ? area.toFixed(1) + ' m²' : '—'}</strong></p>
        </fieldset>
      </div>

      <form id="form-medicao">
        <legend>Medição</legend>
        <div class="linha-campos">
          <label>Linha <input id="linha" type="number" min="1" step="1" value="${linha}"></label>
          <label>Árvore <input id="arvore" type="number" min="1" step="1" value="${arvore}"></label>
        </div>
        <div class="linha-campos">
          <label>CAP (cm) <input id="cap" type="text" inputmode="decimal" placeholder="ex: 32,5"></label>
          <label>Altura (m) <input id="altura" type="text" inputmode="decimal" placeholder="opcional"></label>
        </div>
        <label class="toggle">
          <input id="toggle130" type="checkbox">
          Somar 1,30 m automaticamente (leitura à altura do peito)
        </label>
        <label>Qualidade
          <select id="qualidade">
            ${QUALIDADES.filter((q) => q.id !== 5)
              .map((q) => `<option value="${q.id}">${q.nome}</option>`)
              .join('')}
          </select>
        </label>
        <p id="msg-validacao" class="msg" hidden></p>
        <button type="submit" id="btn-adicionar">Adicionar medição</button>
      </form>

      <section id="painel-resultados"></section>

      <div class="acoes">
        <button id="btn-desfazer" type="button">Desfazer última medição</button>
        <button id="btn-finalizar-parcela" type="button">Finalizar parcela</button>
        <button id="btn-concluir-talhao" type="button">Concluir talhão</button>
      </div>
    </section>
  `;

  atualizarPainelResultados(ctx);
  ligarEventos(ctx);
}

function atualizarPainelResultados(ctx) {
  const painel = ctx.container.querySelector('#painel-resultados');
  const semAltura = ctx.medicoes.filter((m) => !m.falha && m.altura == null).length;
  const comAltura = ctx.medicoes.filter((m) => !m.falha && m.altura != null).length;
  const falhas = ctx.medicoes.filter((m) => m.falha).length;

  const validas = medicoesValidasComDap(ctx.medicoes);
  const deficit = classesComDeficitDeAltura(validas, LIMIAR_DEFICIT);

  painel.innerHTML = `
    <p class="contador">
      Sem altura: <strong>${semAltura}</strong> ·
      Com altura: <strong>${comAltura}</strong> ·
      Falhas: <strong>${falhas}</strong>
    </p>
    ${
      deficit.length > 0
        ? `<div class="alerta-deficit">
            <strong>Priorize altura nas classes de CAP:</strong>
            ${deficit.map((c) => `<span class="chip">${c.labelCap} cm (${c.diferenca.toFixed(1)} pp)</span>`).join(' ')}
          </div>`
        : ''
    }
  `;
}

function ligarEventos(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);

  $('#toggle-cadastro-talhao').addEventListener('click', () => {
    ctx.talhaoExpandido = !ctx.talhaoExpandido;
    render(ctx);
  });

  $('#toggle-config-parcela').addEventListener('click', () => {
    ctx.parcelaExpandido = !ctx.parcelaExpandido;
    render(ctx);
  });

  ['#t-nome', '#t-area', '#t-rotacao', '#t-material', '#t-espacamento', '#t-data-plantio', '#t-regime', '#t-observacoes'].forEach((sel) => {
    $(sel)?.addEventListener('change', () => salvarConfigTalhao(ctx));
  });

  $('#forma').addEventListener('change', async (e) => {
    const forma = e.target.value;
    $('#campos-retangular').hidden = forma !== 'retangular';
    $('#campos-circular').hidden = forma !== 'circular';
    await salvarConfig(ctx);
  });

  ['#comprimento', '#largura', '#raio'].forEach((sel) => {
    $(sel)?.addEventListener('change', () => salvarConfig(ctx));
  });

  // Editar CAP/altura cancela qualquer confirmação pendente (seção 5 do log).
  $('#cap').addEventListener('input', () => {
    ctx.pendente = null;
  });
  $('#altura').addEventListener('input', () => {
    ctx.pendente = null;
  });

  $('#form-medicao').addEventListener('submit', (e) => {
    e.preventDefault();
    tentarAdicionarMedicao(ctx);
  });

  $('#btn-desfazer').addEventListener('click', async () => {
    const removida = await db.desfazerUltimaMedicao(ctx.parcela.id);
    if (removida) {
      ctx.medicoes = await db.getMedicoesDaParcela(ctx.parcela.id);
      ctx.medicoesTalhao = await db.getMedicoesDoTalhao(ctx.talhao.id);
      render(ctx);
    }
  });

  $('#btn-finalizar-parcela').addEventListener('click', async () => {
    await db.finalizarParcela(ctx.parcela.id);
    const ultima = ctx.parcela;
    ctx.parcela = await db.criarParcela(ctx.talhao.id, {
      forma: ultima.forma,
      comprimento: ultima.comprimento,
      largura: ultima.largura,
      raio: ultima.raio,
    });
    ctx.medicoes = [];
    ctx.pendente = null;
    ctx.parcelaExpandido = true;
    render(ctx);
  });

  $('#btn-concluir-talhao').addEventListener('click', async () => {
    await db.finalizarParcela(ctx.parcela.id);
    await db.concluirTalhao(ctx.talhao.id);
    const ultimaParcela = ctx.parcela;
    ctx.talhao = await db.criarTalhao(ctx.fazenda.id);
    ctx.parcela = await db.criarParcela(ctx.talhao.id, {
      forma: ultimaParcela.forma,
      comprimento: ultimaParcela.comprimento,
      largura: ultimaParcela.largura,
      raio: ultimaParcela.raio,
    });
    ctx.medicoes = [];
    ctx.medicoesTalhao = [];
    ctx.pendente = null;
    ctx.talhaoExpandido = true;
    ctx.parcelaExpandido = true;
    render(ctx);
  });
}

async function salvarConfigTalhao(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);
  ctx.talhao = await db.atualizarCadastroTalhao(ctx.talhao.id, {
    nome: $('#t-nome').value.trim(),
    area: Number($('#t-area').value) || null,
    materialGenetico: $('#t-material').value.trim(),
    espacamento: $('#t-espacamento').value.trim(),
    regimeSilvicultural: $('#t-regime').value.trim(),
    dataPlantio: $('#t-data-plantio').value || null,
    rotacao: $('#t-rotacao').value.trim(),
    observacoes: $('#t-observacoes').value.trim(),
  });
  ctx.container.querySelector('h2').textContent = `${rotuloTalhao(ctx.talhao)} · Parcela ${ctx.parcela.numero}`;
}

async function salvarConfig(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);
  const forma = $('#forma').value;
  const comprimento = forma === 'retangular' ? Number($('#comprimento').value) || null : null;
  const largura = forma === 'retangular' ? Number($('#largura').value) || null : null;
  const raio = forma === 'circular' ? Number($('#raio').value) || null : null;
  ctx.parcela = await db.atualizarConfigParcela(ctx.parcela.id, { forma, comprimento, largura, raio });
  $('#area-calculada').textContent = ctx.parcela.area ? ctx.parcela.area.toFixed(1) + ' m²' : '—';
}

async function tentarAdicionarMedicao(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);
  const msg = $('#msg-validacao');
  const mostrarMsg = (texto) => {
    msg.textContent = texto;
    msg.hidden = false;
  };

  if (!ctx.parcela.area || ctx.parcela.area <= 0) {
    mostrarMsg('Preencha as dimensões da parcela antes de adicionar medições.');
    return;
  }

  const linha = Number($('#linha').value);
  const arvore = Number($('#arvore').value);
  const capTexto = $('#cap').value;
  const alturaTexto = $('#altura').value;
  const toggle130 = $('#toggle130').checked;
  const qualidadeSelecionada = Number($('#qualidade').value);

  const resultadoCap = validarCap(capTexto);
  if (resultadoCap.status === 'invalido') {
    mostrarMsg(resultadoCap.mensagem);
    return;
  }
  if (resultadoCap.status === 'bloqueado') {
    ctx.pendente = null;
    mostrarMsg(resultadoCap.mensagem);
    return;
  }

  const falha = resultadoCap.status === 'falha' || qualidadeSelecionada === 5;

  let resultadoAltura = { status: 'ok', valor: null, mensagem: '' };
  if (!falha) {
    resultadoAltura = validarAltura(alturaTexto, toggle130);
    if (resultadoAltura.status === 'invalido') {
      mostrarMsg(resultadoAltura.mensagem);
      return;
    }
    if (resultadoAltura.status === 'bloqueado') {
      ctx.pendente = null;
      mostrarMsg(resultadoAltura.mensagem);
      return;
    }
  }

  const precisaConfirmar = resultadoCap.status === 'alerta' || resultadoAltura.status === 'alerta';
  const jaConfirmado =
    ctx.pendente && ctx.pendente.capTexto === capTexto && ctx.pendente.alturaTexto === alturaTexto;

  if (precisaConfirmar && !jaConfirmado) {
    ctx.pendente = { capTexto, alturaTexto };
    mostrarMsg(
      [resultadoCap.mensagem, resultadoAltura.mensagem].filter(Boolean).join(' ') +
        ' Clique em "Adicionar medição" novamente para confirmar.'
    );
    return;
  }

  await db.addMedicao({
    parcelaId: ctx.parcela.id,
    linha,
    arvore,
    cap: falha ? 0 : resultadoCap.valor,
    altura: falha ? null : resultadoAltura.valor,
    qualidade: falha ? 5 : qualidadeSelecionada,
    falha,
  });

  ctx.medicoes = await db.getMedicoesDaParcela(ctx.parcela.id);
  ctx.medicoesTalhao = await db.getMedicoesDoTalhao(ctx.talhao.id);
  ctx.pendente = null;
  msg.hidden = true;

  const proxima = proximaLinhaEArvore(ctx);
  $('#linha').value = proxima.linha;
  $('#arvore').value = proxima.arvore;
  $('#cap').value = '';
  $('#altura').value = '';
  $('#cap').focus();

  atualizarPainelResultados(ctx);
}
