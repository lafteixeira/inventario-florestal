import * as db from './db.js';
import { initColeta } from './screens/coleta.js';
import { initParcelas } from './screens/parcelas.js';
import { initTalhoes } from './screens/talhoes.js';
import { initProjetos } from './screens/projetos.js';
import { registrarServiceWorker } from './atualizacao.js';

const TELAS = {
  coleta: { titulo: 'Coleta', init: initColeta },
  parcelas: { titulo: 'Parcelas', init: initParcelas },
  talhoes: { titulo: 'Talhões', init: initTalhoes },
};
const ORDEM = Object.keys(TELAS);

const LIMIAR_DESLIZE_PX = 70;
const MARGEM_BORDA_PX = 24;
const DURACAO_MAX_DESLIZE_MS = 800;

const app = document.getElementById('app');
const nav = document.getElementById('nav-telas');
const nomeProjetoEl = document.getElementById('projeto-atual');
const btnProjetos = document.getElementById('btn-trocar-projeto');

let fazendaAtual = null;
let telaAtual = 'coleta';
let trocandoTela = false;

async function main() {
  const meta = await db.getMeta();
  const fazenda = meta.fazendaAtualId ? await db.getFazenda(meta.fazendaAtualId) : null;

  if (fazenda) {
    await abrirProjeto(fazenda);
  } else {
    mostrarHome();
  }
}

// Vai para a lista de Projetos. Se já há um projeto aberto, ele continua
// aberto em segundo plano e a tela oferece "Voltar" para a última aba usada.
function mostrarHome() {
  nav.hidden = true;
  btnProjetos.hidden = true;
  nomeProjetoEl.hidden = !fazendaAtual;

  const voltar = fazendaAtual
    ? {
        projetoId: fazendaAtual.id,
        rotulo: `← Voltar para ${TELAS[telaAtual].titulo} · ${fazendaAtual.nome}`,
        onVoltar: voltarAoProjeto,
      }
    : null;

  initProjetos(app, {
    onAbrirProjeto: abrirProjeto,
    voltar,
    onProjetoApagado: () => {
      fazendaAtual = null;
      telaAtual = 'coleta';
      nomeProjetoEl.hidden = true;
      mostrarHome();
    },
  });
}

async function voltarAoProjeto() {
  const fazenda = fazendaAtual ? await db.getFazenda(fazendaAtual.id) : null;
  if (!fazenda) {
    fazendaAtual = null;
    mostrarHome();
    return;
  }
  await abrirProjeto(fazenda);
}

async function abrirProjeto(fazenda) {
  const mesmoProjeto = fazendaAtual?.id === fazenda.id;
  fazendaAtual = fazenda;
  await db.setMeta({ fazendaAtualId: fazenda.id });

  nomeProjetoEl.textContent = fazenda.nome;
  nomeProjetoEl.hidden = false;
  btnProjetos.hidden = false;

  nav.hidden = false;
  nav.innerHTML = ORDEM.map(
    (chave) => `<button type="button" data-tela="${chave}">${TELAS[chave].titulo}</button>`
  ).join('');
  nav.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => mostrarTela(btn.dataset.tela));
  });

  await mostrarTela(mesmoProjeto ? telaAtual : 'coleta');
}

async function mostrarTela(chave, direcao = null) {
  if (trocandoTela) return;
  trocandoTela = true;
  try {
    telaAtual = chave;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.tela === chave));
    await TELAS[chave].init(app, fazendaAtual);
    animarEntrada(direcao);
  } finally {
    trocandoTela = false;
  }
}

function animarEntrada(direcao) {
  app.classList.remove('entra-da-direita', 'entra-da-esquerda');
  if (!direcao) return;
  void app.offsetWidth;
  app.classList.add(direcao === 'proxima' ? 'entra-da-direita' : 'entra-da-esquerda');
}

function trocarParaVizinha(passo) {
  const indice = ORDEM.indexOf(telaAtual) + passo;
  if (indice < 0 || indice >= ORDEM.length) return;
  mostrarTela(ORDEM[indice], passo > 0 ? 'proxima' : 'anterior');
}

// --- Deslize lateral entre abas -------------------------------------------

function rolavelNaHorizontal(el) {
  for (let atual = el; atual && atual !== document.body; atual = atual.parentElement) {
    const { overflowX } = getComputedStyle(atual);
    if ((overflowX === 'auto' || overflowX === 'scroll') && atual.scrollWidth > atual.clientWidth) {
      return true;
    }
  }
  return false;
}

// O deslize não pode atrapalhar a digitação nem outros gestos: ignora campos de
// formulário, teclado aberto, leitura digitada ainda não adicionada, tabelas
// rolando de lado, histograma, modal aberto e seleção de texto.
function deslizeBloqueado(alvo) {
  if (nav.hidden) return true;
  if (document.querySelector('.overlay-confirmacao')) return true;
  if (alvo.closest('input, textarea, select, label, .histograma')) return true;
  if (rolavelNaHorizontal(alvo)) return true;

  const ativo = document.activeElement;
  if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName)) return true;
  if (window.getSelection().toString()) return true;

  if (telaAtual === 'coleta') {
    const rascunho = ['#cap', '#altura'].some((sel) => document.querySelector(sel)?.value);
    if (rascunho) return true;
  }
  return false;
}

let toque = null;

app.addEventListener(
  'touchstart',
  (e) => {
    toque = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < MARGEM_BORDA_PX || t.clientX > window.innerWidth - MARGEM_BORDA_PX) return;
    if (deslizeBloqueado(e.target)) return;
    toque = { x: t.clientX, y: t.clientY, tempo: Date.now() };
  },
  { passive: true }
);

app.addEventListener(
  'touchend',
  (e) => {
    if (!toque) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toque.x;
    const dy = t.clientY - toque.y;
    const duracao = Date.now() - toque.tempo;
    toque = null;

    const horizontal = Math.abs(dx) >= LIMIAR_DESLIZE_PX && Math.abs(dy) <= Math.abs(dx) * 0.5;
    if (!horizontal || duracao > DURACAO_MAX_DESLIZE_MS) return;
    trocarParaVizinha(dx < 0 ? 1 : -1);
  },
  { passive: true }
);

app.addEventListener('touchcancel', () => {
  toque = null;
});

btnProjetos.addEventListener('click', mostrarHome);

registrarServiceWorker();

main();
