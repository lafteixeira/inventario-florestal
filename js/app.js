import * as db from './db.js';
import { initCadastro } from './screens/cadastro.js';
import { initColeta } from './screens/coleta.js';
import { initAnalise } from './screens/analise.js';
import { initDados } from './screens/dados.js';
import { initProjetos } from './screens/projetos.js';
import { registrarServiceWorker } from './atualizacao.js';

const TELAS = {
  cadastro: { titulo: 'Cadastro', init: initCadastro },
  coleta: { titulo: 'Coleta', init: initColeta },
  analise: { titulo: 'Análise', init: initAnalise },
  dados: { titulo: 'Dados', init: initDados },
};
const ORDEM = Object.keys(TELAS);

const app = document.getElementById('app');
const nav = document.getElementById('nav-telas');
const nomeProjetoEl = document.getElementById('projeto-atual');
const btnProjetos = document.getElementById('btn-trocar-projeto');

let fazendaAtual = null;
let telaAtual = 'cadastro';
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
      telaAtual = 'cadastro';
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

// Projeto novo abre no Cadastro; projeto com leituras na parcela em andamento
// abre direto na Coleta, para a equipe não precisar navegar toda vez.
async function telaInicialDoProjeto(fazenda) {
  const talhao = await db.getTalhaoEmAndamento(fazenda.id);
  const parcela = talhao ? await db.getParcelaEmAndamento(talhao.id) : null;
  const medicoes = parcela ? await db.getMedicoesDaParcela(parcela.id) : [];
  return medicoes.length > 0 ? 'coleta' : 'cadastro';
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

  await mostrarTela(mesmoProjeto ? telaAtual : await telaInicialDoProjeto(fazenda));
}

async function mostrarTela(chave) {
  if (trocandoTela) return;
  trocandoTela = true;
  try {
    telaAtual = chave;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.tela === chave));
    // Opções do projeto podem ter mudado no Cadastro: sempre lê a versão atual.
    fazendaAtual = (await db.getFazenda(fazendaAtual.id)) ?? fazendaAtual;
    await TELAS[chave].init(app, fazendaAtual, { irPara: mostrarTela });
    window.scrollTo(0, 0);
  } finally {
    trocandoTela = false;
  }
}

// Sem isso, ao tocar num campo o teclado do celular oferece endereços, CEPs e
// textos copiados — atrapalha a digitação de CAP/altura e causa erro.
function desligarSugestoes(raiz) {
  raiz.querySelectorAll('input, textarea').forEach((el) => {
    if (['checkbox', 'radio', 'file', 'date', 'button', 'submit'].includes(el.type)) return;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
  });
}
new MutationObserver(() => desligarSugestoes(app)).observe(app, { childList: true, subtree: true });

btnProjetos.addEventListener('click', mostrarHome);

registrarServiceWorker();

main();
