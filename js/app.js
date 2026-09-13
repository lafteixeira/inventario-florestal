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

const app = document.getElementById('app');
const nav = document.getElementById('nav-telas');
const nomeProjetoEl = document.getElementById('projeto-atual');
const btnTrocarProjeto = document.getElementById('btn-trocar-projeto');

let fazendaAtual = null;

async function main() {
  const meta = await db.getMeta();
  const fazenda = meta.fazendaAtualId ? await db.getFazenda(meta.fazendaAtualId) : null;

  if (fazenda) {
    await abrirProjeto(fazenda);
  } else {
    mostrarHome();
  }
}

function mostrarHome() {
  fazendaAtual = null;
  nav.hidden = true;
  nomeProjetoEl.hidden = true;
  btnTrocarProjeto.hidden = true;
  initProjetos(app, { onAbrirProjeto: abrirProjeto });
}

async function abrirProjeto(fazenda) {
  fazendaAtual = fazenda;
  await db.setMeta({ fazendaAtualId: fazenda.id });

  nomeProjetoEl.textContent = fazenda.nome;
  nomeProjetoEl.hidden = false;
  btnTrocarProjeto.hidden = false;

  nav.hidden = false;
  nav.innerHTML = Object.entries(TELAS)
    .map(([chave, t], i) => `<button type="button" data-tela="${chave}" class="${i === 0 ? 'ativa' : ''}">${t.titulo}</button>`)
    .join('');
  nav.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => mostrarTela(btn.dataset.tela));
  });

  await mostrarTela('coleta');
}

async function mostrarTela(chave) {
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.tela === chave));
  await TELAS[chave].init(app, fazendaAtual);
}

btnTrocarProjeto.addEventListener('click', mostrarHome);

registrarServiceWorker();

main();
