import { initParcelas } from './parcelas.js';
import { initTalhoes } from './talhoes.js';

// A visão escolhida (parcela ou projeto) é lembrada enquanto o app estiver aberto.
let visao = 'parcela';

export async function initAnalise(container, fazenda) {
  container.innerHTML = `
    <div class="toggle-unidade alternador-analise">
      <button type="button" class="btn-unidade" data-visao="parcela">Por parcela</button>
      <button type="button" class="btn-unidade" data-visao="projeto">Talhões e projeto</button>
    </div>
    <div id="corpo-analise"></div>
  `;
  const corpo = container.querySelector('#corpo-analise');

  const mostrar = async () => {
    container.querySelectorAll('[data-visao]').forEach((b) => {
      b.classList.toggle('ativa', b.dataset.visao === visao);
    });
    await (visao === 'parcela' ? initParcelas : initTalhoes)(corpo, fazenda);
  };

  container.querySelectorAll('[data-visao]').forEach((btn) => {
    btn.addEventListener('click', () => {
      visao = btn.dataset.visao;
      mostrar();
    });
  });

  await mostrar();
}
