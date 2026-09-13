// Controle explícito de atualização do app — nada aqui aplica uma versão
// nova sozinho. O Service Worker (sw.js) não chama skipWaiting() na
// instalação, então uma versão nova baixada em segundo plano fica "esperando"
// até o usuário confirmar em "Atualizar agora" (tela Projetos). Importante
// para não trocar o app no meio de uma coleta em campo.

let registration = null;

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
    } catch {
      // offline no primeiro acesso, ou navegador sem suporte — segue sem SW.
    }
  });
}

// Pergunta ao navegador se há uma versão nova no servidor. Só baixa/instala
// (fica esperando) — não ativa nada sozinho. Espera o evento real de
// instalação em vez de um tempo fixo (registration.update() resolve antes
// da instalação terminar, então um delay fixo pode checar cedo demais).
export async function verificarAtualizacoes() {
  if (!registration) return { suportado: false, disponivel: false };
  if (registration.waiting) return { suportado: true, disponivel: true };

  const instalou = new Promise((resolve) => {
    registration.addEventListener(
      'updatefound',
      () => {
        const novo = registration.installing;
        if (!novo) return resolve(false);
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed') resolve(true);
          else if (novo.state === 'redundant') resolve(false);
        });
      },
      { once: true }
    );
  });

  try {
    await registration.update();
  } catch {
    return { suportado: true, disponivel: false, offline: true };
  }

  // Se 'updatefound' nunca disparar (não há versão nova), não trava esperando.
  const semNovidade = new Promise((resolve) => setTimeout(() => resolve(false), 4000));
  const disponivel = await Promise.race([instalou, semNovidade]);
  return { suportado: true, disponivel };
}

// Uma versão nova já foi baixada e está esperando confirmação (sem checar o servidor de novo).
export function temAtualizacaoDisponivel() {
  return !!registration?.waiting;
}

// Só aqui uma versão nova passa a valer — ação explícita do usuário.
export function aplicarAtualizacao() {
  if (!registration?.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  registration.waiting.postMessage('SKIP_WAITING');
}
