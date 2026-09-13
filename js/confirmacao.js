// Confirmação em modal próprio do app — o window.confirm() nativo é bloqueado
// ou silenciosamente ignorado em muitos PWAs instalados (modo standalone no
// Android), fazendo cliques em "Apagar" parecerem não fazer nada.
export function confirmar(mensagem, { confirmarTexto = 'Apagar', cancelarTexto = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-confirmacao';
    overlay.innerHTML = `
      <div class="caixa-confirmacao">
        <p class="mensagem-confirmacao"></p>
        <div class="acoes">
          <button type="button" class="btn-cancelar-modal">${cancelarTexto}</button>
          <button type="button" class="btn-confirmar-modal btn-perigo">${confirmarTexto}</button>
        </div>
      </div>
    `;
    overlay.querySelector('.mensagem-confirmacao').textContent = mensagem;
    document.body.appendChild(overlay);

    const fechar = (resultado) => {
      overlay.remove();
      document.removeEventListener('keydown', aoTeclar);
      resolve(resultado);
    };

    const aoTeclar = (e) => {
      if (e.key === 'Escape') fechar(false);
    };
    document.addEventListener('keydown', aoTeclar);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar(false);
    });
    overlay.querySelector('.btn-cancelar-modal').addEventListener('click', () => fechar(false));
    overlay.querySelector('.btn-confirmar-modal').addEventListener('click', () => fechar(true));
  });
}
