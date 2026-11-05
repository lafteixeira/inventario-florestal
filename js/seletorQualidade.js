import { QUALIDADES, QUALIDADE_FALHA } from './validation.js';

// Grade de letras (N, M, S, ...) em vez de um menu com 11 opções: um toque
// escolhe e fecha. Resolve com o id da qualidade, ou null se cancelar.
export function escolherQualidade(atualId) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-confirmacao';
    overlay.innerHTML = `
      <div class="caixa-confirmacao caixa-qualidade">
        <p class="mensagem-confirmacao"><strong>Qualidade do fuste</strong></p>
        <div class="grade-qualidade"></div>
        <button type="button" class="btn-cancelar-modal btn-secundario">Cancelar</button>
      </div>
    `;
    const grade = overlay.querySelector('.grade-qualidade');
    for (const q of QUALIDADES.filter((item) => item.id !== QUALIDADE_FALHA)) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = `item-qualidade ${q.id === atualId ? 'ativa' : ''}`;
      const letra = document.createElement('strong');
      letra.textContent = q.letra;
      const nome = document.createElement('span');
      nome.textContent = q.nome;
      botao.append(letra, nome);
      botao.addEventListener('click', () => fechar(q.id));
      grade.appendChild(botao);
    }
    document.body.appendChild(overlay);

    const fechar = (resultado) => {
      overlay.remove();
      document.removeEventListener('keydown', aoTeclar);
      resolve(resultado);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') fechar(null);
    };
    document.addEventListener('keydown', aoTeclar);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar(null);
    });
    overlay.querySelector('.btn-cancelar-modal').addEventListener('click', () => fechar(null));
  });
}
