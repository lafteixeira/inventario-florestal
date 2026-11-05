import * as db from '../db.js';
import { validarCap, validarAltura, QUALIDADES, QUALIDADE_FALHA } from '../validation.js';
import { medicoesValidasComDap, classesComDeficitDeAltura } from '../stats.js';
import { garantirTalhaoEParcela } from '../sessao.js';
import { escolherQualidade } from '../seletorQualidade.js';

const LIMIAR_DEFICIT = 3;

function rotuloTalhao(talhao) {
  return talhao.nome || `Talhão ${talhao.numero}`;
}

// Tela só de digitação: o cadastro (talhão, parcela, opções) fica na aba Cadastro.
export async function initColeta(container, fazenda, { irPara } = {}) {
  const ctx = {
    container,
    fazenda,
    opcoes: db.opcoesDoProjeto(fazenda),
    irPara,
    talhao: null,
    parcela: null,
    medicoes: [],
    qualidade: 0,
    pendente: null,
  };
  const { talhao, parcela } = await garantirTalhaoEParcela(fazenda);
  ctx.talhao = talhao;
  ctx.parcela = parcela;
  ctx.medicoes = await db.getMedicoesDaParcela(parcela.id);
  render(ctx);
}

function proximaLinhaEArvore(ctx) {
  if (ctx.medicoes.length === 0) return { linha: 1, arvore: 1 };
  const ultima = ctx.medicoes.reduce((a, b) => (a.id > b.id ? a : b));
  return { linha: ultima.linha, arvore: ultima.arvore + 1 };
}

function proximaArvoreDaLinha(ctx, linha) {
  const daLinha = ctx.medicoes.filter((m) => m.linha === linha);
  return daLinha.length === 0 ? 1 : Math.max(...daLinha.map((m) => m.arvore)) + 1;
}

function nomeQualidade(id) {
  return QUALIDADES.find((q) => q.id === id) ?? QUALIDADES[0];
}

function campoNumerico(id, rotulo, valor) {
  return `
    <div class="campo-stepper">
      <span class="rotulo-campo">${rotulo}</span>
      <div class="stepper">
        <button type="button" class="passo" data-alvo="${id}" data-passo="-1" aria-label="${rotulo} anterior">−</button>
        <input id="${id}" type="text" inputmode="numeric" enterkeyhint="done" value="${valor}">
        <button type="button" class="passo" data-alvo="${id}" data-passo="1" aria-label="${rotulo} seguinte">+</button>
      </div>
    </div>
  `;
}

function render(ctx) {
  const { usarLinha, usarQualidade, somar130 } = ctx.opcoes;
  const { linha, arvore } = proximaLinhaEArvore(ctx);
  const semArea = !ctx.parcela.area || ctx.parcela.area <= 0;
  const q = nomeQualidade(ctx.qualidade);

  ctx.container.innerHTML = `
    <section class="painel painel-coleta">
      <div class="cabecalho-coleta">
        <strong>${rotuloTalhao(ctx.talhao)} · P${ctx.parcela.numero}</strong>
        <span id="contador-arvores"></span>
      </div>

      ${
        semArea
          ? `<div class="aviso-area">Falta o tamanho da parcela.
              <button type="button" id="btn-ir-cadastro">Preencher no Cadastro</button></div>`
          : ''
      }

      <form id="form-medicao" autocomplete="off">
        <div class="linha-campos">
          ${usarLinha ? campoNumerico('linha', 'Linha', linha) : ''}
          ${campoNumerico('arvore', 'Árvore', arvore)}
        </div>

        <label class="campo-grande-rotulo">CAP (cm)
          <input id="cap" class="campo-grande" type="text" inputmode="decimal" enterkeyhint="done" placeholder="ex: 32,5">
        </label>

        <label class="campo-grande-rotulo">Altura (m)${somar130 ? ' · soma 1,30 m sozinho' : ''}
          <input id="altura" class="campo-grande" type="text" inputmode="decimal" enterkeyhint="done" placeholder="só se medir">
        </label>

        ${
          usarQualidade
            ? `<button type="button" id="btn-qualidade" class="btn-qualidade btn-secundario">
                Qualidade: <strong>${q.letra}</strong> — ${q.nome} ▾
              </button>`
            : ''
        }

        <p id="msg-validacao" class="msg" hidden></p>
        <div class="barra-adicionar">
          <button type="submit" id="btn-adicionar" class="btn-adicionar">Adicionar</button>
        </div>
      </form>

      <div id="ultima-leitura" class="ultima-leitura"></div>
      <div id="selo-alturas"></div>
    </section>
  `;

  atualizarResumo(ctx);
  ligarEventos(ctx);
}

function atualizarResumo(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);
  $('#contador-arvores').textContent = `${ctx.medicoes.length} árv.`;

  const ultima = ctx.medicoes.length
    ? ctx.medicoes.reduce((a, b) => (a.id > b.id ? a : b))
    : null;
  const blocoUltima = $('#ultima-leitura');
  if (ultima) {
    const texto = ultima.falha
      ? `L${ultima.linha}/A${ultima.arvore} · Falha`
      : `L${ultima.linha}/A${ultima.arvore} · CAP ${ultima.cap}${ultima.altura != null ? ` · H ${ultima.altura.toFixed(1)}` : ''} · ${nomeQualidade(ultima.qualidade).letra}`;
    blocoUltima.innerHTML = '<span class="rotulo-campo">Última leitura</span><div class="linha-ultima"><strong class="texto-ultima"></strong><button type="button" id="btn-desfazer" class="btn-secundario">Desfazer</button></div>';
    blocoUltima.querySelector('.texto-ultima').textContent = texto;
    blocoUltima.querySelector('#btn-desfazer').addEventListener('click', () => desfazer(ctx));
  } else {
    blocoUltima.innerHTML = '<span class="rotulo-campo">Nenhuma leitura ainda nesta parcela.</span>';
  }

  const deficit = classesComDeficitDeAltura(medicoesValidasComDap(ctx.medicoes), LIMIAR_DEFICIT);
  const selo = $('#selo-alturas');
  if (deficit.length > 0) {
    selo.innerHTML = `<button type="button" id="btn-ver-alturas" class="selo-pendencia">Faltam alturas em ${deficit.length} classe(s) — ver na Análise ›</button>`;
    selo.querySelector('#btn-ver-alturas').addEventListener('click', () => ctx.irPara?.('analise'));
  } else {
    selo.innerHTML = '';
  }
}

async function desfazer(ctx) {
  const removida = await db.desfazerUltimaMedicao(ctx.parcela.id);
  if (!removida) return;
  ctx.medicoes = await db.getMedicoesDaParcela(ctx.parcela.id);
  ctx.pendente = null;
  const { linha, arvore } = proximaLinhaEArvore(ctx);
  definirCampos(ctx, { linha, arvore });
  atualizarResumo(ctx);
}

function definirCampos(ctx, { linha, arvore }) {
  const $ = (sel) => ctx.container.querySelector(sel);
  if ($('#linha') && linha != null) $('#linha').value = linha;
  if (arvore != null) $('#arvore').value = arvore;
}

function ligarEventos(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);

  $('#btn-ir-cadastro')?.addEventListener('click', () => ctx.irPara?.('cadastro'));

  // Qualquer edição cancela uma confirmação pendente (alerta já mostrado).
  ['#linha', '#arvore', '#cap', '#altura'].forEach((sel) => {
    $(sel)?.addEventListener('input', () => {
      ctx.pendente = null;
    });
  });

  ctx.container.querySelectorAll('.passo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const alvo = btn.dataset.alvo;
      const atual = Number($(`#${alvo}`).value) || 1;
      const novo = Math.max(1, atual + Number(btn.dataset.passo));
      $(`#${alvo}`).value = novo;
      ctx.pendente = null;
      if (alvo === 'linha') {
        $('#arvore').value = proximaArvoreDaLinha(ctx, novo);
      }
    });
  });

  $('#btn-qualidade')?.addEventListener('click', async () => {
    const escolhida = await escolherQualidade(ctx.qualidade);
    if (escolhida == null) return;
    ctx.qualidade = escolhida;
    const q = nomeQualidade(escolhida);
    $('#btn-qualidade').innerHTML = `Qualidade: <strong>${q.letra}</strong> — ${q.nome} ▾`;
    ctx.pendente = null;
  });

  $('#form-medicao').addEventListener('submit', (e) => {
    e.preventDefault();
    tentarAdicionarMedicao(ctx);
  });
}

async function tentarAdicionarMedicao(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);
  const msg = $('#msg-validacao');
  const mostrarMsg = (texto) => {
    msg.textContent = texto;
    msg.hidden = false;
  };

  if (!ctx.parcela.area || ctx.parcela.area <= 0) {
    mostrarMsg('Falta o tamanho da parcela (aba Cadastro).');
    return;
  }

  const linha = ctx.opcoes.usarLinha ? Number($('#linha').value) : 1;
  const arvore = Number($('#arvore').value);
  if (!Number.isInteger(linha) || linha < 1 || !Number.isInteger(arvore) || arvore < 1) {
    mostrarMsg('Linha e árvore devem ser números inteiros a partir de 1.');
    return;
  }

  const capTexto = $('#cap').value;
  const alturaTexto = $('#altura').value;
  const qualidadeSelecionada = ctx.opcoes.usarQualidade ? ctx.qualidade : 0;

  const resultadoCap = validarCap(capTexto);
  if (resultadoCap.status === 'invalido' || resultadoCap.status === 'bloqueado') {
    ctx.pendente = null;
    mostrarMsg(resultadoCap.mensagem);
    return;
  }

  const falha = resultadoCap.status === 'falha';

  let resultadoAltura = { status: 'ok', valor: null, mensagem: '' };
  if (!falha) {
    resultadoAltura = validarAltura(alturaTexto, ctx.opcoes.somar130);
    if (resultadoAltura.status === 'invalido' || resultadoAltura.status === 'bloqueado') {
      ctx.pendente = null;
      mostrarMsg(resultadoAltura.mensagem);
      return;
    }
  }

  const repetida = ctx.medicoes.some((m) => m.linha === linha && m.arvore === arvore);
  const avisos = [
    resultadoCap.status === 'alerta' ? resultadoCap.mensagem : '',
    resultadoAltura.status === 'alerta' ? resultadoAltura.mensagem : '',
    repetida ? `L${linha}/A${arvore} já existe nesta parcela.` : '',
  ].filter(Boolean);

  if (avisos.length > 0 && !ctx.pendente) {
    ctx.pendente = true;
    mostrarMsg(`${avisos.join(' ')} Toque em Adicionar de novo para confirmar.`);
    return;
  }

  await db.addMedicao({
    parcelaId: ctx.parcela.id,
    linha,
    arvore,
    cap: falha ? 0 : resultadoCap.valor,
    altura: falha ? null : resultadoAltura.valor,
    qualidade: falha ? QUALIDADE_FALHA : qualidadeSelecionada,
    falha,
  });

  ctx.medicoes = await db.getMedicoesDaParcela(ctx.parcela.id);
  ctx.pendente = null;
  ctx.qualidade = 0;
  msg.hidden = true;

  const proxima = proximaLinhaEArvore(ctx);
  definirCampos(ctx, proxima);
  $('#cap').value = '';
  $('#altura').value = '';
  const botaoQualidade = $('#btn-qualidade');
  if (botaoQualidade) {
    const q = nomeQualidade(0);
    botaoQualidade.innerHTML = `Qualidade: <strong>${q.letra}</strong> — ${q.nome} ▾`;
  }
  $('#cap').focus();

  atualizarResumo(ctx);
}
