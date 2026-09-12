import * as db from './db.js';
import { initColeta } from './screens/coleta.js';
import { initParcelas } from './screens/parcelas.js';
import { initTalhoes } from './screens/talhoes.js';

const TELAS = {
  coleta: { titulo: 'Coleta', init: initColeta },
  parcelas: { titulo: 'Parcelas', init: initParcelas },
  talhoes: { titulo: 'Talhões', init: initTalhoes },
};

async function main() {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav-telas');
  let fazenda = await db.getFazendaAtual();

  if (!fazenda) {
    fazenda = await primeiraExecucao(app);
  }

  nav.hidden = false;
  nav.innerHTML = Object.entries(TELAS)
    .map(([chave, t], i) => `<button type="button" data-tela="${chave}" class="${i === 0 ? 'ativa' : ''}">${t.titulo}</button>`)
    .join('');

  const mostrarTela = async (chave) => {
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.tela === chave));
    await TELAS[chave].init(app, fazenda);
  };

  nav.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => mostrarTela(btn.dataset.tela));
  });

  await mostrarTela('coleta');
}

function primeiraExecucao(app) {
  return new Promise((resolve) => {
    app.innerHTML = `
      <section class="painel">
        <h2>Bem-vindo</h2>
        <form id="form-fazenda">
          <label>Nome da fazenda
            <input id="nome-fazenda" type="text" required placeholder="ex: Fazenda Ibítira">
          </label>
          <button type="submit">Começar</button>
        </form>
      </section>
    `;
    app.querySelector('#form-fazenda').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = app.querySelector('#nome-fazenda').value.trim();
      if (!nome) return;
      const fazenda = await db.criarFazenda(nome);
      resolve(fazenda);
    });
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

main();
